import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Site } from '../models/Site';
import { Expense } from '../models/Expense';
import { SiteMember } from '../models/SiteMember';
import { User } from '../models/User';
import { generateSitePDFReport } from '../services/pdfService';
import { generateExpensesCSV } from '../services/csvService';
import { sendDailySiteReportEmail } from '../services/emailService';
import mongoose from 'mongoose';
import { config } from '../config/env';

export const exportSitePDF = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const site = await Site.findById(id).populate('createdBy', 'name email');

    if (!site) {
      return res.status(404).json({ success: false, message: 'Site not found.' });
    }

    const categoryBreakdown = await Expense.aggregate([
      { $match: { siteId: new mongoose.Types.ObjectId(id), isDeleted: false } },
      {
        $group: {
          _id: '$category',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    const itemSummary = await Expense.aggregate([
      { $match: { siteId: new mongoose.Types.ObjectId(id), isDeleted: false } },
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'creator'
        }
      },
      {
        $group: {
          _id: { itemName: '$itemName', unit: '$unit' },
          category: { $first: '$category' },
          totalQuantity: { $sum: '$quantity' },
          totalCost: { $sum: '$amount' },
          entryCount: { $sum: 1 },
          creatorNames: { $addToSet: { $arrayElemAt: ['$creator.name', 0] } }
        }
      },
      {
        $project: {
          _id: 0,
          itemName: '$_id.itemName',
          unit: '$_id.unit',
          category: 1,
          totalQuantity: 1,
          totalCost: 1,
          averageRate: {
            $cond: [
              { $gt: ['$totalQuantity', 0] },
              { $round: [{ $divide: ['$totalCost', '$totalQuantity'] }, 2] },
              0
            ]
          },
          entryCount: 1,
          addedByUsers: {
            $filter: {
              input: '$creatorNames',
              as: 'name',
              cond: { $ne: ['$$name', null] }
            }
          }
        }
      },
      { $sort: { totalCost: -1 } }
    ]);

    const detailedExpenses = await Expense.find({ siteId: new mongoose.Types.ObjectId(id), isDeleted: false })
      .sort({ date: -1 })
      .populate('createdBy', 'name email role');

    const userEntrySummary = await Expense.aggregate([
      { $match: { siteId: new mongoose.Types.ObjectId(id), isDeleted: false } },
      {
        $group: {
          _id: '$createdBy',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: '$userInfo' },
      {
        $project: {
          userName: '$userInfo.name',
          userRole: '$userInfo.role',
          totalAmount: 1,
          count: 1
        }
      }
    ]);

    const totalCost = categoryBreakdown.reduce((sum, item) => sum + item.totalAmount, 0);
    const contractValue = site.contractValue || 0;
    const grossProfit = contractValue > 0 ? contractValue - totalCost : 0;
    const profitPercentage = contractValue > 0 ? Number(((grossProfit / contractValue) * 100).toFixed(2)) : 0;

    const pdfBuffer = await generateSitePDFReport({
      site,
      totalCost,
      grossProfit,
      profitPercentage,
      categoryBreakdown,
      items: itemSummary,
      detailedExpenses,
      userSummary: userEntrySummary,
      companyName: config.companyName
    });

    const filename = `RD_Report_${site.siteName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to generate PDF report.' });
  }
};

export const exportSiteCSV = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const site = await Site.findById(id);

    if (!site) {
      return res.status(404).json({ success: false, message: 'Site not found.' });
    }

    const expenses = await Expense.find({ siteId: id, isDeleted: false })
      .sort({ date: -1 })
      .populate('createdBy', 'name email');

    const csvContent = generateExpensesCSV(expenses);
    const filename = `Expenses_${site.siteName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csvContent);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to export CSV.' });
  }
};

import { processSingleSiteDailyReport, processAllDailySiteReportsBatch } from '../services/dailyReportCronService';

/**
 * Sends a Daily Site Activity Report email to the site owner for items added today.
 * IF NO ITEMS WERE ADDED TODAY, THE REPORT IS SKIPPED (NO EMAIL SENT).
 */
export const sendDailySiteReport = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'OWNER') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Daily site reports are exclusively available to the Owner.'
      });
    }

    const siteId = req.params.id || req.body.siteId;

    if (!siteId) {
      return res.status(400).json({ success: false, message: 'Site ID is required.' });
    }

    const result = await processSingleSiteDailyReport(siteId, req.user?._id);

    if (!result.success && !result.reportSent && result.message.includes('not found')) {
      return res.status(404).json({ success: false, message: result.message });
    }

    if (!result.success) {
      return res.status(500).json({ success: false, message: result.message });
    }

    return res.status(200).json({
      success: true,
      reportSent: result.reportSent,
      itemCount: result.itemCount,
      totalAmountToday: result.totalAmountToday || 0,
      ownerEmail: result.ownerEmail,
      message: result.message
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to send daily site report.' });
  }
};

/**
 * Triggers automated daily reports for ALL active sites.
 * Only sends emails for sites that had items added today.
 */
export const triggerAllDailySiteReports = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'OWNER') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Daily site reports batch trigger is exclusively available to the Owner.'
      });
    }

    const result = await processAllDailySiteReportsBatch(req.user?._id);

    if (!result.success) {
      return res.status(500).json({ success: false, message: result.message });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      reportsSent: result.reportsSent,
      skippedSites: result.skippedSites,
      totalActiveSites: result.totalActiveSites
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to trigger daily reports batch.' });
  }
};
