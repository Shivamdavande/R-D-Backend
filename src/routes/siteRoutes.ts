import { Router } from 'express';
import {
  createSite,
  getSites,
  getSiteById,
  updateSite,
  deleteSite,
  closeSite,
  reopenSite,
  addCollaborator,
  removeCollaborator,
  getSiteMembers
} from '../controllers/siteController';
import { getSiteExpenses, addExpense } from '../controllers/expenseController';
import { getSiteSummary, getItemWiseSummary, getMeasurementBook } from '../controllers/summaryController';
import { getSiteActivityLog } from '../controllers/activityController';
import { sendDailySiteReport } from '../controllers/reportController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { requireSiteAccess, requireSiteOwner, requireActiveSite } from '../middleware/siteAuth';
import { upload, uploadDocument } from '../middleware/upload';

import {
  getSiteImages,
  uploadSiteImage,
  deleteSiteImage,
  getSiteImagesPDF
} from '../controllers/siteImageController';
import { uploadSiteBill, getSiteBills, deleteSiteBill } from '../controllers/siteBillController';

const router = Router();

router.use(authenticate);

// List & Create Sites
router.get('/', getSites);
router.post('/', requireRole('OWNER'), createSite);

// Single Site Details, Update, Delete (Owner Only)
router.get('/:id', requireSiteAccess, getSiteById);
router.put('/:id', requireSiteAccess, requireSiteOwner, updateSite);
router.delete('/:id', requireSiteAccess, requireSiteOwner, deleteSite);

// Collaborators
router.get('/:id/members', requireSiteAccess, getSiteMembers);
router.post('/:id/members', requireSiteAccess, requireSiteOwner, addCollaborator);
router.delete('/:id/members/:userId', requireSiteAccess, requireSiteOwner, removeCollaborator);

// Close & Reopen Site
router.post('/:id/close', requireSiteAccess, requireSiteOwner, closeSite);
router.post('/:id/reopen', requireSiteAccess, requireSiteOwner, reopenSite);

// Site Expenses Sub-resource
router.get('/:id/expenses', requireSiteAccess, getSiteExpenses);
router.post('/:id/expenses', requireSiteAccess, requireActiveSite, upload.single('billImage'), addExpense);

// Site Images Sub-resource
router.get('/:id/images', requireSiteAccess, getSiteImages);
router.post('/:id/images', requireSiteAccess, requireActiveSite, upload.single('image'), uploadSiteImage);
router.delete('/:id/images/:imageId', requireSiteAccess, requireActiveSite, deleteSiteImage);
router.get('/:id/images/pdf', requireSiteAccess, getSiteImagesPDF);

// Site Excel Bills Sub-resource
router.get('/:id/bills', requireSiteAccess, getSiteBills);
router.post('/:id/bills', requireSiteAccess, requireSiteOwner, uploadDocument.single('billFile'), uploadSiteBill);
router.delete('/:id/bills/:billId', requireSiteAccess, requireSiteOwner, deleteSiteBill);

// Site Summaries & Aggregations
router.get('/:id/summary', requireSiteAccess, getSiteSummary);
router.get('/:id/item-summary', requireSiteAccess, getItemWiseSummary);
router.get('/:id/measurement-book', requireSiteAccess, getMeasurementBook);
router.get('/:id/activity', requireSiteAccess, getSiteActivityLog);
router.post('/:id/daily-report', requireSiteAccess, sendDailySiteReport);
router.post('/daily-report', sendDailySiteReport);

export default router;
