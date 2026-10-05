import { Site } from '../models/Site';
import { Expense } from '../models/Expense';
import { SiteMember } from '../models/SiteMember';
import { User } from '../models/User';
import { sendDailySiteReportEmail } from './emailService';
import { Types } from 'mongoose';

/**
 * Processes daily summary report for a single site.
 * Sends email report to the company/site Owner containing items added today.
 * Skips report generation if 0 items were added today.
 */
export const processSingleSiteDailyReport = async (
  siteId: string | Types.ObjectId,
  requestingUserId?: Types.ObjectId
): Promise<{
  success: boolean;
  reportSent: boolean;
  itemCount: number;
  totalAmountToday?: number;
  ownerEmail?: string;
  message: string;
}> => {
  try {
    const site = await Site.findById(siteId).populate('createdBy', 'name email role');
    if (!site) {
      return { success: false, reportSent: false, itemCount: 0, message: 'Site not found.' };
    }

    // Determine today's date range (considering UTC and local timezone offsets)
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const earliestDate = startOfToday < twentyFourHoursAgo ? startOfToday : twentyFourHoursAgo;

    // Fetch expenses added today or within the last 24 hours
    const todayExpenses = await Expense.find({
      siteId: site._id,
      isDeleted: false,
      $or: [
        { createdAt: { $gte: earliestDate, $lte: endOfToday } },
        { date: { $gte: earliestDate, $lte: endOfToday } }
      ]
    }).populate('createdBy', 'name email role').sort({ createdAt: -1 });

    // REQUIREMENT: If NO items were added on this site today, DO NOT send daily report
    if (todayExpenses.length === 0) {
      return {
        success: true,
        reportSent: false,
        itemCount: 0,
        message: `No items were added to site "${site.siteName}" today. Daily report was skipped.`
      };
    }

    // Determine Owner recipient user
    let ownerUser: any = null;

    // Priority 1: Site creator if creator is an OWNER
    if (site.createdBy && (site.createdBy as any).role === 'OWNER' && (site.createdBy as any).email) {
      ownerUser = site.createdBy;
    }

    // Priority 2: SiteMember assigned as OWNER
    if (!ownerUser) {
      const ownerMember = await SiteMember.findOne({ siteId: site._id, role: 'OWNER' }).populate('userId', 'name email role');
      if (ownerMember && (ownerMember.userId as any)?.email) {
        ownerUser = ownerMember.userId;
      }
    }

    // Priority 3: Fallback to any active OWNER in the system
    if (!ownerUser) {
      const systemOwner = await User.findOne({ role: 'OWNER', isActive: true });
      if (systemOwner && systemOwner.email) {
        ownerUser = systemOwner;
      }
    }

    // Priority 4: Fallback to site creator if no OWNER role found
    if (!ownerUser && site.createdBy && (site.createdBy as any).email) {
      ownerUser = site.createdBy;
    }

    if (!ownerUser || !ownerUser.email) {
      return {
        success: false,
        reportSent: false,
        itemCount: todayExpenses.length,
        message: `Owner email address not found for site "${site.siteName}".`
      };
    }

    const formattedItems = todayExpenses.map(exp => ({
      itemName: exp.itemName,
      category: exp.category,
      quantity: exp.quantity,
      unit: exp.unit,
      rate: exp.rate,
      amount: exp.amount,
      addedBy: (exp.createdBy as any)?.name || 'Supervisor',
      vendor: exp.vendor,
      notes: exp.notes
    }));

    const totalAmountToday = todayExpenses.reduce((sum, item) => sum + item.amount, 0);
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const emailRes = await sendDailySiteReportEmail({
      ownerEmail: ownerUser.email,
      ownerName: ownerUser.name || 'Owner',
      siteName: site.siteName,
      siteId: site._id,
      dateStr,
      todayExpenses: formattedItems,
      totalAmountToday,
      userId: requestingUserId
    });

    if (!emailRes.success) {
      return {
        success: false,
        reportSent: false,
        itemCount: todayExpenses.length,
        totalAmountToday,
        message: emailRes.error || 'Failed to send daily site report email.'
      };
    }

    return {
      success: true,
      reportSent: true,
      itemCount: todayExpenses.length,
      totalAmountToday,
      ownerEmail: ownerUser.email,
      message: `Daily report for site "${site.siteName}" sent to owner (${ownerUser.email}) with ${todayExpenses.length} items (Total: ₹${totalAmountToday.toLocaleString('en-IN')}).`
    };
  } catch (error: any) {
    return {
      success: false,
      reportSent: false,
      itemCount: 0,
      message: error.message || 'Failed to process daily site report.'
    };
  }
};

/**
 * Runs the daily report batch for ALL active sites.
 * Only sends emails for sites that had items recorded today.
 */
export const processAllDailySiteReportsBatch = async (
  requestingUserId?: Types.ObjectId
): Promise<{
  success: boolean;
  reportsSent: number;
  skippedSites: number;
  totalActiveSites: number;
  message: string;
}> => {
  try {
    const activeSites = await Site.find({ status: 'ACTIVE' });
    let reportsSent = 0;
    let skippedSites = 0;

    for (const site of activeSites) {
      const res = await processSingleSiteDailyReport(site._id, requestingUserId);
      if (res.success && res.reportSent) {
        reportsSent++;
      } else {
        skippedSites++;
      }
    }

    const logMsg = `Daily report batch process completed. Processed ${activeSites.length} active sites: ${reportsSent} email report(s) sent, ${skippedSites} site(s) skipped (0 additions today).`;
    console.log(`[Daily Report Service] ${logMsg}`);

    return {
      success: true,
      reportsSent,
      skippedSites,
      totalActiveSites: activeSites.length,
      message: logMsg
    };
  } catch (error: any) {
    console.error('[Daily Report Service Error]:', error?.message || error);
    return {
      success: false,
      reportsSent: 0,
      skippedSites: 0,
      totalActiveSites: 0,
      message: error.message || 'Failed to execute daily report batch.'
    };
  }
};

/**
 * Starts the automated background cron service for daily site summary reports.
 * Runs automatically every 24 hours at 8:00 PM (20:00).
 */
export const startDailyReportCron = (): void => {
  console.log('⏰ [Daily Report Service] Automated Daily Site Summary Report Cron initialized.');

  // Run initial check 15 seconds after server startup
  setTimeout(() => {
    const currentHour = new Date().getHours();
    // If running in evening (>= 18:00), run daily report check on boot
    if (currentHour >= 18 || currentHour <= 2) {
      console.log('[Daily Report Service] Boot-time evening check triggering daily report batch...');
      processAllDailySiteReportsBatch();
    }
  }, 15000);

  // Check every 1 hour; if 20:00 (8 PM local time), trigger daily report batch
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 20) {
      console.log('[Daily Report Service] 8:00 PM evening trigger firing automated daily reports...');
      processAllDailySiteReportsBatch();
    }
  }, 60 * 60 * 1000);
};
