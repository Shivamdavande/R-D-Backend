"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const siteController_1 = require("../controllers/siteController");
const expenseController_1 = require("../controllers/expenseController");
const summaryController_1 = require("../controllers/summaryController");
const activityController_1 = require("../controllers/activityController");
const reportController_1 = require("../controllers/reportController");
const auth_1 = require("../middleware/auth");
const role_1 = require("../middleware/role");
const siteAuth_1 = require("../middleware/siteAuth");
const upload_1 = require("../middleware/upload");
const siteImageController_1 = require("../controllers/siteImageController");
const siteBillController_1 = require("../controllers/siteBillController");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// List & Create Sites
router.get('/', siteController_1.getSites);
router.post('/', (0, role_1.requireRole)('OWNER'), siteController_1.createSite);
// Single Site Details, Update, Delete (Owner Only)
router.get('/:id', siteAuth_1.requireSiteAccess, siteController_1.getSiteById);
router.put('/:id', siteAuth_1.requireSiteAccess, siteAuth_1.requireSiteOwner, siteController_1.updateSite);
router.delete('/:id', siteAuth_1.requireSiteAccess, siteAuth_1.requireSiteOwner, siteController_1.deleteSite);
// Collaborators
router.get('/:id/members', siteAuth_1.requireSiteAccess, siteController_1.getSiteMembers);
router.post('/:id/members', siteAuth_1.requireSiteAccess, siteAuth_1.requireSiteOwner, siteController_1.addCollaborator);
router.delete('/:id/members/:userId', siteAuth_1.requireSiteAccess, siteAuth_1.requireSiteOwner, siteController_1.removeCollaborator);
// Close & Reopen Site
router.post('/:id/close', siteAuth_1.requireSiteAccess, siteAuth_1.requireSiteOwner, siteController_1.closeSite);
router.post('/:id/reopen', siteAuth_1.requireSiteAccess, siteAuth_1.requireSiteOwner, siteController_1.reopenSite);
// Site Expenses Sub-resource
router.get('/:id/expenses', siteAuth_1.requireSiteAccess, expenseController_1.getSiteExpenses);
router.post('/:id/expenses', siteAuth_1.requireSiteAccess, siteAuth_1.requireActiveSite, upload_1.upload.single('billImage'), expenseController_1.addExpense);
// Site Images Sub-resource
router.get('/:id/images', siteAuth_1.requireSiteAccess, siteImageController_1.getSiteImages);
router.post('/:id/images', siteAuth_1.requireSiteAccess, siteAuth_1.requireActiveSite, upload_1.upload.single('image'), siteImageController_1.uploadSiteImage);
router.delete('/:id/images/:imageId', siteAuth_1.requireSiteAccess, siteAuth_1.requireActiveSite, siteImageController_1.deleteSiteImage);
router.get('/:id/images/pdf', siteAuth_1.requireSiteAccess, siteImageController_1.getSiteImagesPDF);
// Site Excel Bills Sub-resource
router.get('/:id/bills', siteAuth_1.requireSiteAccess, siteBillController_1.getSiteBills);
router.post('/:id/bills', siteAuth_1.requireSiteAccess, siteAuth_1.requireSiteOwner, upload_1.uploadDocument.single('billFile'), siteBillController_1.uploadSiteBill);
router.get('/:id/bills/:billId/download', siteAuth_1.requireSiteAccess, siteBillController_1.downloadSiteBill);
router.delete('/:id/bills/:billId', siteAuth_1.requireSiteAccess, siteAuth_1.requireSiteOwner, siteBillController_1.deleteSiteBill);
// Site Summaries & Aggregations
router.get('/:id/summary', siteAuth_1.requireSiteAccess, summaryController_1.getSiteSummary);
router.get('/:id/item-summary', siteAuth_1.requireSiteAccess, summaryController_1.getItemWiseSummary);
router.get('/:id/measurement-book', siteAuth_1.requireSiteAccess, summaryController_1.getMeasurementBook);
router.get('/:id/activity', siteAuth_1.requireSiteAccess, activityController_1.getSiteActivityLog);
router.post('/:id/daily-report', siteAuth_1.requireSiteAccess, reportController_1.sendDailySiteReport);
router.post('/daily-report', reportController_1.sendDailySiteReport);
exports.default = router;
