"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerAllDailySiteReports = exports.sendDailySiteReport = exports.exportSiteCSV = exports.exportSitePDF = void 0;
const Site_1 = require("../models/Site");
const Expense_1 = require("../models/Expense");
const pdfService_1 = require("../services/pdfService");
const csvService_1 = require("../services/csvService");
const mongoose_1 = __importDefault(require("mongoose"));
const env_1 = require("../config/env");
const exportSitePDF = async (req, res) => {
    try {
        const { id } = req.params;
        const site = await Site_1.Site.findById(id).populate('createdBy', 'name email');
        if (!site) {
            return res.status(404).json({ success: false, message: 'Site not found.' });
        }
        const categoryBreakdown = await Expense_1.Expense.aggregate([
            { $match: { siteId: new mongoose_1.default.Types.ObjectId(id), isDeleted: false } },
            {
                $group: {
                    _id: '$category',
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { totalAmount: -1 } }
        ]);
        const itemSummary = await Expense_1.Expense.aggregate([
            { $match: { siteId: new mongoose_1.default.Types.ObjectId(id), isDeleted: false } },
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
        const detailedExpenses = await Expense_1.Expense.find({ siteId: new mongoose_1.default.Types.ObjectId(id), isDeleted: false })
            .sort({ date: -1 })
            .populate('createdBy', 'name email role');
        const userEntrySummary = await Expense_1.Expense.aggregate([
            { $match: { siteId: new mongoose_1.default.Types.ObjectId(id), isDeleted: false } },
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
        const pdfBuffer = await (0, pdfService_1.generateSitePDFReport)({
            site,
            totalCost,
            grossProfit,
            profitPercentage,
            categoryBreakdown,
            items: itemSummary,
            detailedExpenses,
            userSummary: userEntrySummary,
            companyName: env_1.config.companyName
        });
        const filename = `RD_Report_${site.siteName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(pdfBuffer);
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to generate PDF report.' });
    }
};
exports.exportSitePDF = exportSitePDF;
const exportSiteCSV = async (req, res) => {
    try {
        const { id } = req.params;
        const site = await Site_1.Site.findById(id);
        if (!site) {
            return res.status(404).json({ success: false, message: 'Site not found.' });
        }
        const expenses = await Expense_1.Expense.find({ siteId: id, isDeleted: false })
            .sort({ date: -1 })
            .populate('createdBy', 'name email');
        const csvContent = (0, csvService_1.generateExpensesCSV)(expenses);
        const filename = `Expenses_${site.siteName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csvContent);
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to export CSV.' });
    }
};
exports.exportSiteCSV = exportSiteCSV;
const dailyReportCronService_1 = require("../services/dailyReportCronService");
/**
 * Sends a Daily Site Activity Report email to the site owner for items added today.
 * IF NO ITEMS WERE ADDED TODAY, THE REPORT IS SKIPPED (NO EMAIL SENT).
 */
const sendDailySiteReport = async (req, res) => {
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
        const result = await (0, dailyReportCronService_1.processSingleSiteDailyReport)(siteId, req.user?._id);
        if (!result.success && !result.reportSent && result.message === 'Site not found.') {
            return res.status(404).json({ success: false, message: result.message });
        }
        if (!result.success) {
            return res.status(400).json({ success: false, message: result.message });
        }
        return res.status(200).json({
            success: true,
            reportSent: result.reportSent,
            itemCount: result.itemCount,
            totalAmountToday: result.totalAmountToday || 0,
            ownerEmail: result.ownerEmail,
            message: result.message
        });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to send daily site report.' });
    }
};
exports.sendDailySiteReport = sendDailySiteReport;
/**
 * Triggers automated daily reports for ALL active sites.
 * Only sends emails for sites that had items added today.
 */
const triggerAllDailySiteReports = async (req, res) => {
    try {
        if (req.user?.role !== 'OWNER') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Daily site reports batch trigger is exclusively available to the Owner.'
            });
        }
        const result = await (0, dailyReportCronService_1.processAllDailySiteReportsBatch)(req.user?._id);
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
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to trigger daily reports batch.' });
    }
};
exports.triggerAllDailySiteReports = triggerAllDailySiteReports;
