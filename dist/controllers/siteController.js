"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSite = exports.getSiteMembers = exports.removeCollaborator = exports.addCollaborator = exports.reopenSite = exports.closeSite = exports.updateSite = exports.getSiteById = exports.getSites = exports.createSite = void 0;
const Site_1 = require("../models/Site");
const SiteMember_1 = require("../models/SiteMember");
const SiteImage_1 = require("../models/SiteImage");
const Expense_1 = require("../models/Expense");
const ActivityLog_1 = require("../models/ActivityLog");
const User_1 = require("../models/User");
const pdfService_1 = require("../services/pdfService");
const imagePdfService_1 = require("../services/imagePdfService");
const emailService_1 = require("../services/emailService");
const env_1 = require("../config/env");
const createSite = async (req, res) => {
    try {
        const { siteName, clientName, workOrderNumber, workOrderDate, contractValue, location, startDate, expectedEndDate, description } = req.body;
        if (!siteName || !clientName || !workOrderNumber) {
            return res.status(400).json({
                success: false,
                message: 'Site Name, Client Name, and Work Order Number are required.'
            });
        }
        const site = await Site_1.Site.create({
            siteName,
            clientName,
            workOrderNumber,
            workOrderDate: workOrderDate ? new Date(workOrderDate) : undefined,
            contractValue: Number(contractValue) || 0,
            location,
            startDate: startDate ? new Date(startDate) : new Date(),
            expectedEndDate: expectedEndDate ? new Date(expectedEndDate) : undefined,
            description,
            status: 'ACTIVE',
            createdBy: req.user._id
        });
        // Automatically add owner as SiteMember
        await SiteMember_1.SiteMember.create({
            siteId: site._id,
            userId: req.user._id,
            role: 'OWNER',
            assignedBy: req.user._id
        });
        // Log Activity
        await ActivityLog_1.ActivityLog.create({
            siteId: site._id,
            userId: req.user._id,
            userName: req.user.name,
            action: 'SITE_CREATED',
            details: `Created site "${site.siteName}" (WO: ${site.workOrderNumber}, Value: ₹${site.contractValue.toLocaleString()})`
        });
        return res.status(201).json({
            success: true,
            message: 'Site created successfully.',
            site
        });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to create site.' });
    }
};
exports.createSite = createSite;
const getSites = async (req, res) => {
    try {
        const user = req.user;
        const userRole = (user.role || '').toUpperCase();
        let sites;
        if (userRole === 'OWNER') {
            // Owner sees all sites
            sites = await Site_1.Site.find().sort({ createdAt: -1 }).populate('createdBy', 'name email');
        }
        else {
            // Supervisors see sites they are assigned to OR sites created by them
            const memberships = await SiteMember_1.SiteMember.find({ userId: user._id });
            const siteIds = memberships.map(m => m.siteId);
            sites = await Site_1.Site.find({
                $or: [{ _id: { $in: siteIds } }, { createdBy: user._id }]
            }).sort({ createdAt: -1 }).populate('createdBy', 'name email');
        }
        if (!sites || sites.length === 0) {
            return res.status(200).json({
                success: true,
                count: 0,
                sites: []
            });
        }
        const allSiteIds = sites.map(s => s._id);
        // Optimized Single Aggregation Query for all sites
        const expensesGrouped = await Expense_1.Expense.aggregate([
            { $match: { siteId: { $in: allSiteIds }, isDeleted: false } },
            {
                $group: {
                    _id: '$siteId',
                    totalExpenses: { $sum: '$amount' },
                    expenseCount: { $sum: 1 }
                }
            }
        ]);
        const expenseMap = {};
        expensesGrouped.forEach(item => {
            if (item._id) {
                expenseMap[item._id.toString()] = {
                    totalExpenses: item.totalExpenses || 0,
                    expenseCount: item.expenseCount || 0
                };
            }
        });
        const sitesWithMetrics = sites.map((site) => {
            const metrics = expenseMap[site._id.toString()] || { totalExpenses: 0, expenseCount: 0 };
            const totalExpenses = metrics.totalExpenses;
            const expenseCount = metrics.expenseCount;
            const profit = site.contractValue > 0 ? site.contractValue - totalExpenses : 0;
            const profitPercentage = site.contractValue > 0 ? Number(((profit / site.contractValue) * 100).toFixed(2)) : 0;
            return {
                ...site.toObject(),
                totalExpenses,
                expenseCount,
                profit,
                profitPercentage
            };
        });
        return res.status(200).json({
            success: true,
            count: sitesWithMetrics.length,
            sites: sitesWithMetrics
        });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch sites.' });
    }
};
exports.getSites = getSites;
const getSiteById = async (req, res) => {
    try {
        const { id } = req.params;
        const site = await Site_1.Site.findById(id).populate('createdBy', 'name email').populate('closedBy', 'name email');
        if (!site) {
            return res.status(404).json({ success: false, message: 'Site not found.' });
        }
        // Calculate quick metrics
        const totalExpensesResult = await Expense_1.Expense.aggregate([
            { $match: { siteId: site._id, isDeleted: false } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]);
        const totalExpenses = totalExpensesResult.length > 0 ? totalExpensesResult[0].total : 0;
        const expenseCount = totalExpensesResult.length > 0 ? totalExpensesResult[0].count : 0;
        const profit = site.contractValue > 0 ? site.contractValue - totalExpenses : 0;
        const profitPercentage = site.contractValue > 0 ? Number(((profit / site.contractValue) * 100).toFixed(2)) : 0;
        const members = await SiteMember_1.SiteMember.find({ siteId: site._id }).populate('userId', 'name email role phone');
        return res.status(200).json({
            success: true,
            site: {
                ...site.toObject(),
                totalExpenses,
                expenseCount,
                profit,
                profitPercentage,
                members
            }
        });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch site details.' });
    }
};
exports.getSiteById = getSiteById;
const updateSite = async (req, res) => {
    try {
        const { id } = req.params;
        const site = await Site_1.Site.findById(id);
        if (!site) {
            return res.status(404).json({ success: false, message: 'Site not found.' });
        }
        const updatedSite = await Site_1.Site.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
        await ActivityLog_1.ActivityLog.create({
            siteId: site._id,
            userId: req.user._id,
            userName: req.user.name,
            action: 'SITE_UPDATED',
            details: `Updated details for site "${site.siteName}"`
        });
        return res.status(200).json({
            success: true,
            message: 'Site updated successfully.',
            site: updatedSite
        });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to update site.' });
    }
};
exports.updateSite = updateSite;
const closeSite = async (req, res) => {
    try {
        if (req.user?.role !== 'OWNER') {
            return res.status(403).json({
                success: false,
                message: 'Permission denied. Only the Owner can close a construction site.'
            });
        }
        const { id } = req.params;
        const { contractValue, clientName, actualEndDate } = req.body || {};
        const site = await Site_1.Site.findById(id).populate('createdBy', 'name email');
        if (!site) {
            return res.status(404).json({ success: false, message: 'Site not found.' });
        }
        if (site.status === 'CLOSED') {
            return res.status(400).json({ success: false, message: 'Site is already closed.' });
        }
        // Update optional site details if supplied
        if (contractValue !== undefined && !isNaN(Number(contractValue))) {
            site.contractValue = Number(contractValue);
        }
        if (clientName)
            site.clientName = clientName;
        if (actualEndDate)
            site.actualEndDate = new Date(actualEndDate);
        // Save site closure state first
        site.status = 'CLOSED';
        site.closedBy = req.user._id;
        site.closedAt = new Date();
        await site.save();
        await ActivityLog_1.ActivityLog.create({
            siteId: site._id,
            userId: req.user._id,
            userName: req.user.name,
            action: 'SITE_CLOSED',
            details: `Site "${site.siteName}" was closed by ${req.user.role === 'OWNER' ? 'Owner' : 'Supervisor'} ${req.user.name}`
        });
        // Generate final site report PDF
        let pdfBuffer = null;
        let totalCost = 0;
        let grossProfit = 0;
        let profitPercentage = 0;
        try {
            const categoryBreakdown = await Expense_1.Expense.aggregate([
                { $match: { siteId: site._id, isDeleted: false } },
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
                { $match: { siteId: site._id, isDeleted: false } },
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
            const detailedExpenses = await Expense_1.Expense.find({ siteId: site._id, isDeleted: false })
                .sort({ date: -1 })
                .populate('createdBy', 'name email role');
            const userEntrySummary = await Expense_1.Expense.aggregate([
                { $match: { siteId: site._id, isDeleted: false } },
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
            totalCost = categoryBreakdown.reduce((sum, item) => sum + item.totalAmount, 0);
            const val = site.contractValue || 0;
            grossProfit = val > 0 ? val - totalCost : 0;
            profitPercentage = val > 0 ? Number(((grossProfit / val) * 100).toFixed(2)) : 0;
            pdfBuffer = await (0, pdfService_1.generateSitePDFReport)({
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
        }
        catch (pdfErr) {
            console.error('Error generating PDF for closed site:', pdfErr);
        }
        // Generate Site Photos PDF if images exist
        let photosPdfBuffer = null;
        let sitePhotosCount = 0;
        try {
            const siteImages = await SiteImage_1.SiteImage.find({ siteId: site._id })
                .populate('uploadedBy', 'name email role')
                .sort({ uploadedAt: -1, createdAt: -1 });
            sitePhotosCount = siteImages.length;
            if (siteImages.length > 0) {
                photosPdfBuffer = await (0, imagePdfService_1.generateSiteImagesPDF)({
                    site,
                    images: siteImages,
                    companyName: env_1.config.companyName
                });
            }
        }
        catch (imgPdfErr) {
            console.error('Error generating photos PDF for closed site:', imgPdfErr);
        }
        // Determine Owner recipient email
        let ownerUser = null;
        if (req.user && req.user.role === 'OWNER') {
            ownerUser = req.user;
        }
        else if (site.createdBy && site.createdBy.email) {
            ownerUser = site.createdBy;
        }
        else {
            const ownerMember = await SiteMember_1.SiteMember.findOne({ siteId: site._id, role: 'OWNER' }).populate('userId', 'name email');
            if (ownerMember && ownerMember.userId?.email) {
                ownerUser = ownerMember.userId;
            }
            else {
                const fallbackOwner = await User_1.User.findOne({ role: 'OWNER' });
                if (fallbackOwner)
                    ownerUser = fallbackOwner;
            }
        }
        let emailSent = false;
        let emailErrorMsg = '';
        if (pdfBuffer && ownerUser && ownerUser.email) {
            try {
                const emailRes = await (0, emailService_1.sendSiteFinalReportEmail)({
                    ownerEmail: ownerUser.email,
                    ownerName: ownerUser.name || 'Owner',
                    supervisorName: req.user.name,
                    siteName: site.siteName,
                    earning: site.contractValue || 0,
                    totalCost,
                    profitLoss: grossProfit,
                    pdfBuffer,
                    photosPdfBuffer,
                    photoCount: sitePhotosCount,
                    siteId: site._id,
                    userId: req.user._id
                });
                emailSent = emailRes.success;
                if (!emailRes.success) {
                    emailErrorMsg = emailRes.error || 'Brevo email delivery failed.';
                }
            }
            catch (e) {
                console.error('Error sending report email via Brevo:', e);
                emailErrorMsg = e.message || 'Email delivery failure.';
            }
        }
        else {
            emailErrorMsg = 'Could not retrieve Owner email address or generate PDF report.';
        }
        if (!emailSent) {
            return res.status(200).json({
                success: true,
                message: 'Site closed successfully, but the report email could not be sent.',
                emailSent: false,
                emailError: emailErrorMsg,
                site
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Site closed successfully. Final report has been sent to the owner.',
            emailSent: true,
            site
        });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to close site.' });
    }
};
exports.closeSite = closeSite;
const reopenSite = async (req, res) => {
    try {
        const { id } = req.params;
        const site = await Site_1.Site.findById(id);
        if (!site) {
            return res.status(404).json({ success: false, message: 'Site not found.' });
        }
        site.status = 'ACTIVE';
        site.closedBy = undefined;
        site.closedAt = undefined;
        await site.save();
        await ActivityLog_1.ActivityLog.create({
            siteId: site._id,
            userId: req.user._id,
            userName: req.user.name,
            action: 'SITE_REOPENED',
            details: `Site "${site.siteName}" was reopened by Owner ${req.user.name}`
        });
        return res.status(200).json({
            success: true,
            message: 'Site reopened successfully.',
            site
        });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to reopen site.' });
    }
};
exports.reopenSite = reopenSite;
const addCollaborator = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, role } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required.' });
        }
        const targetUser = await User_1.User.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'User to add not found.' });
        }
        const site = await Site_1.Site.findById(id);
        if (!site) {
            return res.status(404).json({ success: false, message: 'Site not found.' });
        }
        const existingMember = await SiteMember_1.SiteMember.findOne({ siteId: id, userId });
        if (existingMember) {
            existingMember.role = role || existingMember.role;
            await existingMember.save();
            return res.status(200).json({ success: true, message: 'Updated collaborator role.', member: existingMember });
        }
        const newMember = await SiteMember_1.SiteMember.create({
            siteId: id,
            userId,
            role: role || 'SUPERVISOR',
            assignedBy: req.user._id
        });
        await ActivityLog_1.ActivityLog.create({
            siteId: id,
            userId: req.user._id,
            userName: req.user.name,
            action: 'MEMBER_ADDED',
            details: `Added ${targetUser.name} (${targetUser.email}) as ${newMember.role} to site`
        });
        // Send Supervisor Assignment Email via Brevo if role is SUPERVISOR
        let emailSent = false;
        if (newMember.role === 'SUPERVISOR' && targetUser.email) {
            try {
                const emailRes = await (0, emailService_1.sendSupervisorAssignmentEmail)({
                    supervisorEmail: targetUser.email,
                    supervisorName: targetUser.name,
                    siteName: site.siteName,
                    ownerName: req.user.name,
                    date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                    siteId: site._id,
                    userId: targetUser._id
                });
                emailSent = emailRes.success;
            }
            catch (emailErr) {
                console.error('Failed to send supervisor assignment email:', emailErr);
            }
        }
        return res.status(201).json({
            success: true,
            message: `Collaborator ${targetUser.name} added to site successfully.${emailSent ? ' Notification email sent to supervisor.' : ''}`,
            member: newMember,
            emailSent
        });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to add collaborator.' });
    }
};
exports.addCollaborator = addCollaborator;
const removeCollaborator = async (req, res) => {
    try {
        const { id, userId } = req.params;
        const targetUser = await User_1.User.findById(userId);
        await SiteMember_1.SiteMember.deleteOne({ siteId: id, userId });
        await ActivityLog_1.ActivityLog.create({
            siteId: id,
            userId: req.user._id,
            userName: req.user.name,
            action: 'MEMBER_REMOVED',
            details: `Removed ${targetUser?.name || 'user'} from site collaborators`
        });
        return res.status(200).json({
            success: true,
            message: 'Collaborator removed successfully.'
        });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to remove collaborator.' });
    }
};
exports.removeCollaborator = removeCollaborator;
const getSiteMembers = async (req, res) => {
    try {
        const { id } = req.params;
        const members = await SiteMember_1.SiteMember.find({ siteId: id }).populate('userId', 'name email role phone');
        return res.status(200).json({ success: true, count: members.length, members });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch site members.' });
    }
};
exports.getSiteMembers = getSiteMembers;
const deleteSite = async (req, res) => {
    try {
        const { id } = req.params;
        const site = await Site_1.Site.findById(id);
        if (!site) {
            return res.status(404).json({ success: false, message: 'Site not found.' });
        }
        if (req.user?.role !== 'OWNER') {
            return res.status(403).json({
                success: false,
                message: 'Permission denied. Only the Owner can delete a construction site.'
            });
        }
        // Cascade delete associated members, expenses, site images, and activity logs
        await SiteMember_1.SiteMember.deleteMany({ siteId: id });
        await Expense_1.Expense.deleteMany({ siteId: id });
        await SiteImage_1.SiteImage.deleteMany({ siteId: id });
        await ActivityLog_1.ActivityLog.deleteMany({ siteId: id });
        await Site_1.Site.findByIdAndDelete(id);
        return res.status(200).json({
            success: true,
            message: `Site "${site.siteName}" deleted successfully.`
        });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to delete site.' });
    }
};
exports.deleteSite = deleteSite;
