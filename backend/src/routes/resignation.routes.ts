import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAbility } from '../middleware/abilities.middleware';
import { uploadResignationDocuments } from '../middleware/upload.middleware';
import { AbilityKeys } from '../utils/roleAbilities';
import * as resignationController from '../controllers/resignation.controller';
import * as resignationWorkflowController from '../controllers/resignationWorkflow.controller';

const router = Router();
router.use(authenticate);

router.get('/dashboard', resignationController.getResignationDashboard);
router.get('/mine', resignationController.listMyResignations);
router.get(
  '/all',
  requireAbility(AbilityKeys.RESIGNATION_HR_QUEUE),
  resignationController.listAllResignations,
);
router.get('/team/queue', resignationWorkflowController.listPmQueue);
router.get('/gm/queue', resignationWorkflowController.listGmQueue);
router.get('/finance/queue', resignationWorkflowController.listFinanceQueue);

router.post('/', uploadResignationDocuments, resignationController.submitResignation);

router.get('/:id/workflow-log', resignationWorkflowController.getWorkflowLog);
router.get('/:id/documents/relieving-letter', resignationWorkflowController.downloadRelievingLetter);
router.get('/:id/documents/experience-certificate', resignationWorkflowController.downloadExperienceCertificate);
router.post(
  '/:id/documents/regenerate',
  requireAbility(AbilityKeys.RESIGNATION_HR_QUEUE),
  resignationWorkflowController.regenerateResignationDocuments,
);
router.get('/:id', resignationController.getResignationById);

router.post('/:id/pm/approve', resignationWorkflowController.pmApprove);
router.post('/:id/pm/reject', resignationWorkflowController.pmReject);
router.post('/:id/pm/discussion', resignationWorkflowController.pmRequestDiscussion);

router.post('/:id/gm/retention-approve', resignationWorkflowController.gmApproveRetention);
router.post('/:id/gm/retention-reject', resignationWorkflowController.gmRejectRetention);

router.post('/:id/retention-response', resignationWorkflowController.employeeRetentionResponse);

router.post(
  '/:id/hr/review-approve',
  requireAbility(AbilityKeys.RESIGNATION_HR_QUEUE),
  resignationWorkflowController.hrReviewApprove,
);
router.post(
  '/:id/hr/review-reject',
  requireAbility(AbilityKeys.RESIGNATION_HR_QUEUE),
  resignationWorkflowController.hrReviewReject,
);
router.post('/:id/hr/final', requireAbility(AbilityKeys.RESIGNATION_HR_QUEUE), resignationWorkflowController.hrFinalClearance);

router.post('/:id/finance/clearance', resignationWorkflowController.financeClearance);

export default router;
