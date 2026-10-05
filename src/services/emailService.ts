import axios from 'axios';
import { Types } from 'mongoose';
import { config } from '../config/env';
import { EmailLog, EmailType } from '../models/EmailLog';

interface SendBrevoEmailParams {
  toEmail: string;
  toName: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  attachments?: Array<{ name: string; content: string }>; // base64 content
  emailType: EmailType;
  userId?: Types.ObjectId;
  siteId?: Types.ObjectId;
  metadata?: Record<string, any>;
}

import nodemailer from 'nodemailer';

/**
 * Core function to post emails to Brevo Transactional Email API v3 or SMTP Relay.
 * Logs delivery attempts and status into EmailLog table.
 */
export const sendBrevoEmail = async (params: SendBrevoEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  const { toEmail, toName, subject, htmlContent, textContent, attachments, emailType, userId, siteId, metadata } = params;

  const apiKey = config.brevo.apiKey?.trim();
  const senderEmail = config.brevo.senderEmail?.trim();
  const senderName = config.brevo.senderName?.trim();

  // Pre-create log entry
  const logEntry = new EmailLog({
    emailType,
    recipient: toEmail,
    userId,
    siteId,
    status: 'PENDING',
    metadata
  });

  if (!apiKey || apiKey === 'your_brevo_api_key_here') {
    const errorMsg = 'Brevo API Key is missing or not configured in environment variables.';
    console.warn(`[Brevo Email Service] ${errorMsg}`);
    logEntry.status = 'FAILED';
    logEntry.failureReason = errorMsg;
    await logEntry.save().catch(e => console.error('Error saving EmailLog:', e));
    return { success: false, error: 'Email service configuration incomplete.' };
  }

  try {
    let messageId = 'sent';

    // Strategy 1: REST API v3 (Preferred for modern Brevo xkeysib- keys & fast HTTPS execution)
    // Strategy 2: Nodemailer SMTP Relay (for xsmtpsib- keys)
    if (apiKey.startsWith('xkeysib-')) {
      const payload: any = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail, name: toName }],
        subject,
        htmlContent,
        ...(textContent ? { textContent } : {})
      };

      if (attachments && attachments.length > 0) {
        payload.attachment = attachments;
      }

      const response = await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
        headers: {
          'api-key': apiKey,
          'accept': 'application/json',
          'content-type': 'application/json'
        },
        timeout: 15000
      });

      messageId = response.data?.messageId || response.data?.messageIds?.[0] || 'sent_api';
    } else {
      // Key starts with xsmtpsib- or other: Try Nodemailer SMTP first, fallback to REST API
      try {
        const transporter = nodemailer.createTransport({
          host: 'smtp-relay.brevo.com',
          port: 587,
          secure: false,
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 10000,
          auth: {
            user: senderEmail,
            pass: apiKey
          }
        });

        const mailOptions: any = {
          from: `"${senderName}" <${senderEmail}>`,
          to: `"${toName}" <${toEmail}>`,
          subject,
          html: htmlContent,
          text: textContent
        };

        if (attachments && attachments.length > 0) {
          mailOptions.attachments = attachments.map(att => ({
            filename: att.name,
            content: Buffer.from(att.content, 'base64')
          }));
        }

        const info = await transporter.sendMail(mailOptions);
        messageId = info.messageId || 'sent_smtp';
      } catch (smtpErr: any) {
        console.warn(`[Brevo SMTP Relay warning]: ${smtpErr.message}.`);
        if (!apiKey.startsWith('xkeysib-')) {
          throw new Error(`SMTP Relay login failed (${smtpErr.message}). NOTE: Brevo REST API requires a v3 API Key starting with 'xkeysib-'. Please generate an API Key in Brevo Dashboard -> SMTP & API -> API Keys.`);
        }
        console.warn(`Attempting REST API fallback...`);
        // Fallback to Brevo REST API v3
        const payload: any = {
          sender: { name: senderName, email: senderEmail },
          to: [{ email: toEmail, name: toName }],
          subject,
          htmlContent,
          ...(textContent ? { textContent } : {})
        };

        if (attachments && attachments.length > 0) {
          payload.attachment = attachments;
        }

        const response = await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
          headers: {
            'api-key': apiKey,
            'accept': 'application/json',
            'content-type': 'application/json'
          },
          timeout: 15000
        });

        messageId = response.data?.messageId || response.data?.messageIds?.[0] || 'sent_api_fallback';
      }
    }

    logEntry.status = 'SENT';
    logEntry.messageId = messageId;
    logEntry.sentAt = new Date();
    await logEntry.save().catch(e => console.error('Error saving EmailLog:', e));

    return { success: true, messageId };
  } catch (error: any) {
    const brevoError = error.response?.data?.message || error.message || 'Unknown Brevo error';
    console.error('[Brevo Email Error]:', brevoError, error.response?.data || '');

    logEntry.status = 'FAILED';
    logEntry.failureReason = brevoError;
    await logEntry.save().catch(e => console.error('Error saving EmailLog:', e));

    return { success: false, error: brevoError };
  }
};

/**
 * 1. Send Registration OTP Email
 */
export const sendRegistrationOtpEmail = async (params: {
  email: string;
  name: string;
  otp: string;
  expiryMinutes: number;
  userId?: Types.ObjectId;
}) => {
  const appName = config.companyName || 'R&D CONSTRUCTIONS';
  const subject = 'Verify your account';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px; color: #333333; }
        .container { max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .header { background-color: #1e293b; color: #ffffff; padding: 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; color: #f59e0b; }
        .header p { margin: 4px 0 0 0; font-size: 12px; color: #94a3b8; }
        .body { padding: 30px; }
        .otp-box { background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; text-align: center; padding: 20px; margin: 24px 0; }
        .otp-code { font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #0f172a; margin: 8px 0; }
        .expiry-text { font-size: 13px; color: #dc2626; font-weight: 600; }
        .footer { background-color: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${appName}</h1>
          <p>Civil Contractor Site Expense & P&L Management</p>
        </div>
        <div class="body">
          <p>Hello <strong>${params.name}</strong>,</p>
          <p>Welcome to <strong>${appName}</strong>.</p>
          <p>Your verification OTP is:</p>
          <div class="otp-box">
            <div class="otp-code">${params.otp}</div>
            <div class="expiry-text">This OTP will expire in ${params.expiryMinutes} minutes.</div>
          </div>
          <p style="font-size: 13px; color: #64748b;">If you did not request this registration, you can safely ignore this email.</p>
          <br>
          <p>Regards,<br><strong>${appName} Team</strong></p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `Hello ${params.name},\n\nWelcome to ${appName}.\n\nYour verification OTP is: ${params.otp}\n\nThis OTP will expire in ${params.expiryMinutes} minutes.\n\nIf you did not request this registration, you can safely ignore this email.\n\nRegards,\n${appName} Team`;

  return sendBrevoEmail({
    toEmail: params.email,
    toName: params.name,
    subject,
    htmlContent,
    textContent,
    emailType: 'REGISTRATION_OTP',
    userId: params.userId,
    metadata: { expiryMinutes: params.expiryMinutes }
  });
};

/**
 * 2. Send Supervisor Site Assignment Email
 */
export const sendSupervisorAssignmentEmail = async (params: {
  supervisorEmail: string;
  supervisorName: string;
  siteName: string;
  ownerName: string;
  date: string;
  siteId: Types.ObjectId;
  userId: Types.ObjectId;
}) => {
  const appName = config.companyName || 'R&D CONSTRUCTIONS';
  const subject = 'You have been assigned to a new site';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px; color: #333333; }
        .container { max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .header { background-color: #1e293b; color: #ffffff; padding: 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; color: #f59e0b; }
        .body { padding: 30px; }
        .site-card { background-color: #f8fafc; border-left: 4px solid #f59e0b; border-radius: 4px; padding: 16px; margin: 20px 0; }
        .site-field { margin-bottom: 8px; font-size: 14px; }
        .site-label { font-weight: bold; color: #475569; }
        .footer { background-color: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${appName}</h1>
        </div>
        <div class="body">
          <p>Hello <strong>${params.supervisorName}</strong>,</p>
          <p>You have been assigned as a Supervisor for the following site:</p>
          
          <div class="site-card">
            <div class="site-field"><span class="site-label">Site:</span> ${params.siteName}</div>
            <div class="site-field"><span class="site-label">Owner:</span> ${params.ownerName}</div>
            <div class="site-field"><span class="site-label">Assignment Date:</span> ${params.date}</div>
          </div>

          <p>You can now open the application and view/manage the site according to your permissions.</p>
          <br>
          <p>Regards,<br><strong>${appName} Team</strong></p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `Hello ${params.supervisorName},\n\nYou have been assigned as a Supervisor for the following site:\n\nSite: ${params.siteName}\nOwner: ${params.ownerName}\nAssignment Date: ${params.date}\n\nYou can now open the application and view/manage the site according to your permissions.\n\nRegards,\n${appName} Team`;

  return sendBrevoEmail({
    toEmail: params.supervisorEmail,
    toName: params.supervisorName,
    subject,
    htmlContent,
    textContent,
    emailType: 'SUPERVISOR_SITE_ASSIGNMENT',
    userId: params.userId,
    siteId: params.siteId
  });
};

/**
 * 3. Send Site Closed Final Report PDF Email to Owner (Includes Final Financial Report PDF + Photos PDF)
 */
export const sendSiteFinalReportEmail = async (params: {
  ownerEmail: string;
  ownerName: string;
  supervisorName: string;
  siteName: string;
  earning: number;
  totalCost: number;
  profitLoss: number;
  pdfBuffer: Buffer;
  photosPdfBuffer?: Buffer | null;
  photoCount?: number;
  siteId: Types.ObjectId;
  userId?: Types.ObjectId;
}) => {
  const appName = config.companyName || 'R&D CONSTRUCTIONS';
  const subject = `Site Closed - ${params.siteName} - Final Report & Photographs`;
  const sanitizedSiteName = params.siteName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const reportFilename = `${sanitizedSiteName}_Final_Report.pdf`;
  const photosFilename = `${sanitizedSiteName}_Site_Photos.pdf`;

  const isProfit = params.profitLoss >= 0;
  const plColor = isProfit ? '#16a34a' : '#dc2626';

  const attachments: Array<{ name: string; content: string }> = [
    {
      name: reportFilename,
      content: params.pdfBuffer.toString('base64')
    }
  ];

  if (params.photosPdfBuffer && params.photosPdfBuffer.length > 0) {
    attachments.push({
      name: photosFilename,
      content: params.photosPdfBuffer.toString('base64')
    });
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px; color: #333333; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .header { background-color: #1e293b; color: #ffffff; padding: 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; color: #f59e0b; }
        .body { padding: 30px; }
        .summary-table { width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #f8fafc; border-radius: 6px; overflow: hidden; }
        .summary-table td { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
        .summary-table tr:last-child td { border-bottom: none; }
        .label { font-weight: bold; color: #475569; width: 45%; }
        .val { font-weight: bold; color: #0f172a; text-align: right; }
        .attachments-box { background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 14px 18px; margin: 20px 0; }
        .attachment-item { font-size: 13px; color: #065f46; font-weight: 700; margin: 4px 0; }
        .footer { background-color: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${appName}</h1>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">FINAL SITE RECONCILIATION & CLOSURE REPORT</p>
        </div>
        <div class="body">
          <p>Hello <strong>${params.ownerName}</strong>,</p>
          <p>The construction site <strong>${params.siteName}</strong> has been successfully closed and marked as <strong>COMPLETED</strong> by <strong>${params.supervisorName}</strong>.</p>
          
          <table class="summary-table">
            <tr>
              <td class="label">Site Name:</td>
              <td class="val">${params.siteName}</td>
            </tr>
            <tr>
              <td class="label">Site Status:</td>
              <td class="val" style="color: #2563eb;">Completed / Closed</td>
            </tr>
            <tr>
              <td class="label">Contract / Earning:</td>
              <td class="val">₹${params.earning.toLocaleString('en-IN')}</td>
            </tr>
            <tr>
              <td class="label">Total Expenses:</td>
              <td class="val">₹${params.totalCost.toLocaleString('en-IN')}</td>
            </tr>
            <tr>
              <td class="label">Final Profit / Loss:</td>
              <td class="val" style="color: ${plColor}; font-size: 16px;">₹${params.profitLoss.toLocaleString('en-IN')}</td>
            </tr>
            ${params.photoCount !== undefined ? `
            <tr>
              <td class="label">Site Photos:</td>
              <td class="val">${params.photoCount} Photos Attached</td>
            </tr>` : ''}
          </table>

          <div class="attachments-box">
            <div style="font-weight: 800; color: #047857; font-size: 13px; margin-bottom: 6px;">📑 ATTACHED PDF REPORTS:</div>
            <div class="attachment-item">1. 📊 ${reportFilename} (Financial & Item-wise Reconciliation)</div>
            ${params.photosPdfBuffer ? `<div class="attachment-item">2. 📷 ${photosFilename} (Site Work Photographs PDF)</div>` : ''}
          </div>

          <p style="font-size: 13px; color: #64748b;">Both PDF documents have been generated and attached directly to this email for your permanent records.</p>
          <br>
          <p>Regards,<br><strong>${appName} Management System</strong></p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `Hello ${params.ownerName},\n\nThe construction site ${params.siteName} has been closed by ${params.supervisorName}.\n\nSite: ${params.siteName}\nStatus: Completed / Closed\nContract Value: ₹${params.earning.toLocaleString('en-IN')}\nTotal Expenses: ₹${params.totalCost.toLocaleString('en-IN')}\nProfit/Loss: ₹${params.profitLoss.toLocaleString('en-IN')}\n\nAttached PDFs:\n1. ${reportFilename}\n${params.photosPdfBuffer ? `2. ${photosFilename}\n` : ''}\nRegards,\n${appName} Team`;

  return sendBrevoEmail({
    toEmail: params.ownerEmail,
    toName: params.ownerName,
    subject,
    htmlContent,
    textContent,
    attachments,
    emailType: 'SITE_FINAL_REPORT',
    userId: params.userId,
    siteId: params.siteId
  });
};

/**
 * 4. Send Password Reset OTP Email
 */
export const sendPasswordResetEmail = async (params: {
  email: string;
  name: string;
  otp: string;
  expiryMinutes: number;
  userId?: Types.ObjectId;
}) => {
  const appName = config.companyName || 'R&D CONSTRUCTIONS';
  const subject = `Password Reset Request - ${appName}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px; color: #333333; }
        .container { max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .header { background-color: #1e293b; color: #ffffff; padding: 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; color: #f59e0b; }
        .header p { margin: 4px 0 0 0; font-size: 12px; color: #94a3b8; }
        .body { padding: 30px; }
        .otp-box { background-color: #fef3c7; border: 2px dashed #f59e0b; border-radius: 8px; text-align: center; padding: 20px; margin: 24px 0; }
        .otp-code { font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #b45309; margin: 8px 0; }
        .expiry-text { font-size: 13px; color: #dc2626; font-weight: 600; }
        .footer { background-color: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${appName}</h1>
          <p>Password Reset Security Service</p>
        </div>
        <div class="body">
          <p>Hello <strong>${params.name}</strong>,</p>
          <p>We received a request to reset the password for your <strong>${appName}</strong> account.</p>
          <p>Your Password Reset OTP is:</p>
          <div class="otp-box">
            <div class="otp-code">${params.otp}</div>
            <div class="expiry-text">This code will expire in ${params.expiryMinutes} minutes.</div>
          </div>
          <p style="font-size: 13px; color: #64748b;">If you did not request a password reset, please ignore this email or contact support if you suspect unauthorized access.</p>
          <br>
          <p>Regards,<br><strong>${appName} Security Team</strong></p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `Hello ${params.name},\n\nWe received a request to reset your password for ${appName}.\n\nYour Password Reset OTP is: ${params.otp}\n\nThis OTP will expire in ${params.expiryMinutes} minutes.\n\nIf you did not request this, please safely ignore this email.\n\nRegards,\n${appName} Team`;

  return sendBrevoEmail({
    toEmail: params.email,
    toName: params.name,
    subject,
    htmlContent,
    textContent,
    emailType: 'PASSWORD_RESET',
    userId: params.userId,
    metadata: { expiryMinutes: params.expiryMinutes }
  });
};

export interface SendDailySiteReportEmailParams {
  ownerEmail: string;
  ownerName: string;
  siteName: string;
  siteId: Types.ObjectId;
  dateStr: string;
  todayExpenses: Array<{
    itemName: string;
    category: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
    addedBy: string;
    vendor?: string;
    notes?: string;
  }>;
  totalAmountToday: number;
  userId?: Types.ObjectId;
}

/**
 * Sends a Daily Site Activity Report to the site Owner with today's newly added items.
 */
export const sendDailySiteReportEmail = async (params: SendDailySiteReportEmailParams) => {
  const appName = config.companyName || 'R&D CONSTRUCTIONS';
  const subject = `📅 Daily Site Summary Report: ${params.siteName} (${params.dateStr})`;

  const itemRowsHtml = params.todayExpenses.map((item, idx) => `
    <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
      <td style="padding: 10px; font-weight: 700; color: #1e293b;">${item.itemName}</td>
      <td style="padding: 10px; color: #64748b; font-size: 12px;">${item.category}</td>
      <td style="padding: 10px; text-align: center; color: #d97706; font-weight: 700;">${item.quantity} ${item.unit}</td>
      <td style="padding: 10px; text-align: right; color: #475569;">₹${item.rate.toLocaleString('en-IN')}</td>
      <td style="padding: 10px; text-align: right; font-weight: 800; color: #16a34a;">₹${item.amount.toLocaleString('en-IN')}</td>
      <td style="padding: 10px; color: #2563eb; font-size: 12px;">${item.addedBy}</td>
    </tr>
  `).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; }
        .container { max-width: 650px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        .header { background-color: #0f172a; padding: 24px; text-align: center; color: #ffffff; border-bottom: 4px solid #f59e0b; }
        .header h1 { margin: 0; font-size: 22px; color: #f59e0b; letter-spacing: 0.5px; }
        .header p { margin: 6px 0 0 0; font-size: 13px; color: #94a3b8; }
        .body { padding: 24px; }
        .banner { background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
        .banner-title { color: #b45309; font-weight: 800; font-size: 14px; margin-bottom: 4px; }
        .stats-grid { display: flex; gap: 12px; margin-bottom: 20px; }
        .stat-box { flex: 1; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
        .stat-label { font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; }
        .stat-val { font-size: 18px; font-weight: 900; color: #0f172a; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
        th { background-color: #1e293b; color: #ffffff; padding: 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
        .footer { background-color: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${appName}</h1>
          <p>📅 Daily Site Activity & Expense Report</p>
        </div>
        <div class="body">
          <p>Hello <strong>${params.ownerName}</strong>,</p>
          <div class="banner">
            <div class="banner-title">🏗️ SITE: ${params.siteName}</div>
            <div style="font-size: 12px; color: #78350f;">Date: <strong>${params.dateStr}</strong> | Daily items activity summary report.</div>
          </div>

          <div style="display: table; width: 100%; margin-bottom: 16px;">
            <div style="display: table-cell; width: 50%; padding-right: 6px;">
              <div class="stat-box">
                <div class="stat-label">ITEMS ADDED TODAY</div>
                <div class="stat-val" style="color: #2563eb;">${params.todayExpenses.length} Items</div>
              </div>
            </div>
            <div style="display: table-cell; width: 50%; padding-left: 6px;">
              <div class="stat-box">
                <div class="stat-label">TOTAL COST ADDED TODAY</div>
                <div class="stat-val" style="color: #16a34a;">₹${params.totalAmountToday.toLocaleString('en-IN')}</div>
              </div>
            </div>
          </div>

          <h3 style="font-size: 14px; color: #0f172a; margin-top: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
            📋 Detailed Breakdown of Items Added Today:
          </h3>

          <table>
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Rate</th>
                <th style="text-align: right;">Total</th>
                <th>Added By</th>
              </tr>
            </thead>
            <tbody>
              ${itemRowsHtml}
            </tbody>
          </table>
        </div>
        <div class="footer">
          Notice: This automated report was sent because items were recorded on this site today.<br>
          &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  return sendBrevoEmail({
    toEmail: params.ownerEmail,
    toName: params.ownerName,
    subject,
    htmlContent,
    emailType: 'DAILY_SITE_SUMMARY',
    userId: params.userId,
    siteId: params.siteId,
    metadata: {
      dateStr: params.dateStr,
      itemCount: params.todayExpenses.length,
      totalAmountToday: params.totalAmountToday
    }
  });
};


