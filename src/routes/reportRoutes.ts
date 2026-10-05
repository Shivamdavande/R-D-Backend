import { Router } from 'express';
import { exportSitePDF, exportSiteCSV, sendDailySiteReport, triggerAllDailySiteReports } from '../controllers/reportController';
import { authenticate } from '../middleware/auth';
import { requireSiteAccess } from '../middleware/siteAuth';

const router = Router();

router.use(authenticate);

router.get('/site/:id/pdf', requireSiteAccess, exportSitePDF);
router.get('/site/:id/excel', requireSiteAccess, exportSiteCSV);
router.get('/site/:id/csv', requireSiteAccess, exportSiteCSV);
router.post('/site/:id/daily-report', requireSiteAccess, sendDailySiteReport);
router.post('/daily-batch', triggerAllDailySiteReports);

export default router;
