import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAbility } from '../middleware/abilities.middleware';
import { AbilityKeys } from '../utils/roleAbilities';
import * as documentExpiryController from '../controllers/documentExpiry.controller';

const router = Router();

router.use(authenticate);

router.get('/summary', documentExpiryController.getExpirySummaryHandler);
router.get('/mine', documentExpiryController.getMyExpiryRecords);

router.get(
  '/dashboard',
  requireAbility(AbilityKeys.DOCUMENT_EXPIRY_VIEW),
  documentExpiryController.getExpiryDashboard,
);

router.get(
  '/report',
  requireAbility(AbilityKeys.DOCUMENT_EXPIRY_REPORT),
  documentExpiryController.getExpiryReport,
);

router.get(
  '/export/excel',
  requireAbility(AbilityKeys.DOCUMENT_EXPIRY_REPORT),
  documentExpiryController.exportExpiryReportExcel,
);

export default router;
