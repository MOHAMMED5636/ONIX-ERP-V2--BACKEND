import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAbility } from '../middleware/abilities.middleware';
import { uploadPolicyFile } from '../middleware/upload.middleware';
import { AbilityKeys } from '../utils/roleAbilities';
import {
  listCompanyPolicies,
  createCompanyPolicy,
  updateCompanyPolicy,
  deleteCompanyPolicy,
  acknowledgeCompanyPolicy,
  downloadCompanyPolicyFile,
} from '../controllers/companyPolicy.controller';
import {
  archivePolicyHandler,
  backfillPolicyAssignmentsHandler,
  exportPolicyAuditReport,
  getMyPolicyHistory,
  getPolicyAuditByEmployee,
  getPolicyAuditByPolicy,
  getPolicyAuditDashboard,
  getPolicyAuditLogs,
  publishPolicyHandler,
  recordPolicyViewHandler,
  sendPolicyRemindersHandler,
} from '../controllers/companyPolicyAudit.controller';

const router = Router();

router.use(authenticate);

router.get('/audit/dashboard', requireAbility(AbilityKeys.COMPANY_POLICY_MANAGE), getPolicyAuditDashboard);
router.get('/audit/by-policy', requireAbility(AbilityKeys.COMPANY_POLICY_MANAGE), getPolicyAuditByPolicy);
router.get('/audit/by-employee', requireAbility(AbilityKeys.COMPANY_POLICY_MANAGE), getPolicyAuditByEmployee);
router.get('/audit/logs', requireAbility(AbilityKeys.COMPANY_POLICY_MANAGE), getPolicyAuditLogs);
router.get('/audit/export', requireAbility(AbilityKeys.COMPANY_POLICY_MANAGE), exportPolicyAuditReport);
router.post(
  '/audit/backfill-assignments',
  requireAbility(AbilityKeys.COMPANY_POLICY_MANAGE),
  backfillPolicyAssignmentsHandler,
);

router.get('/my/history', getMyPolicyHistory);

router.get('/', listCompanyPolicies);
router.get('/:id/download', downloadCompanyPolicyFile);
router.post('/:id/view', recordPolicyViewHandler);
router.post('/:id/publish', requireAbility(AbilityKeys.COMPANY_POLICY_MANAGE), publishPolicyHandler);
router.post('/:id/archive', requireAbility(AbilityKeys.COMPANY_POLICY_MANAGE), archivePolicyHandler);
router.post('/:id/reminders', requireAbility(AbilityKeys.COMPANY_POLICY_MANAGE), sendPolicyRemindersHandler);
router.post(
  '/',
  requireAbility(AbilityKeys.COMPANY_POLICY_MANAGE),
  (req, res, next) => {
    uploadPolicyFile(req, res, (err) => {
      if (err) {
        res.status(400).json({ success: false, message: (err as Error).message || 'File upload failed' });
        return;
      }
      next();
    });
  },
  createCompanyPolicy,
);
router.put('/:id', requireAbility(AbilityKeys.COMPANY_POLICY_MANAGE), updateCompanyPolicy);
router.delete('/:id', requireAbility(AbilityKeys.COMPANY_POLICY_MANAGE), deleteCompanyPolicy);
router.post('/:id/acknowledge', acknowledgeCompanyPolicy);

export default router;
