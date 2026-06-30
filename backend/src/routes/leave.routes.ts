import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { uploadLeaveDocuments } from '../middleware/upload.middleware';
import * as leaveController from '../controllers/leave.controller';
import * as leaveWorkflowController from '../controllers/leaveWorkflow.controller';
import { requireAbility } from '../middleware/abilities.middleware';
import { AbilityKeys } from '../utils/roleAbilities';

const router = Router();

router.use(authenticate);

router.get('/balance', leaveController.getMyBalance);
router.get('/policies', leaveController.getLeavePolicies);
router.get('/reports/summary', requireAbility(AbilityKeys.LEAVE_REPORTS), leaveController.getLeaveReportsSummary);
router.get('/reports/export', requireAbility(AbilityKeys.LEAVE_REPORTS), leaveController.getLeaveReportExport);
router.get('/hr/dashboard', requireAbility(AbilityKeys.LEAVE_HR_DASHBOARD), leaveController.getHRDashboard);
router.get('/hr/employee-balances', requireAbility(AbilityKeys.LEAVE_HR_DASHBOARD), leaveController.getEmployeeBalances);
router.get('/documents/certificates', requireAbility(AbilityKeys.LEAVE_HR_DASHBOARD), leaveController.listCertificatesForHR);
router.post('/', leaveController.createLeave);
router.get('/', leaveController.listLeaves);
router.get('/team', leaveController.listTeamLeaves);
router.get('/workflow/hr-queue', leaveWorkflowController.listHrFinalApprovalQueue);
router.get('/workflow/finance-queue', leaveWorkflowController.listFinanceClearanceQueue);
router.get('/workflow/project-confirmation-queue', leaveWorkflowController.listProjectConfirmationQueue);
router.post('/:id/manager-approve', leaveController.managerApproveLeave);
router.post('/:id/manager-reject', leaveController.managerRejectLeave);
router.post('/:id/hr-request-project-confirmation', leaveWorkflowController.hrRequestProjectConfirmation);
router.post('/:id/project-confirmation', leaveWorkflowController.respondProjectConfirmation);
router.post('/:id/finance-clearance', leaveWorkflowController.financeClearance);
router.post('/:id/hr-final-approve', leaveWorkflowController.hrFinalApprove);
router.post('/:id/hr-workflow-reject', leaveWorkflowController.hrWorkflowReject);
router.post('/:id/hr-resume-from-hold', leaveWorkflowController.hrResumeFromHold);
router.get('/:id/workflow-log', leaveWorkflowController.getWorkflowLog);
router.get('/:id/certificate/download', leaveWorkflowController.downloadLeaveCertificate);
router.post('/:id/certificate/regenerate', leaveWorkflowController.regenerateCertificate);
router.get('/:id', leaveController.getLeaveById);
router.post('/:id/approve', leaveController.approveLeave);
router.post('/:id/reject', leaveController.rejectLeave);
router.post('/:id/reschedule', leaveController.rescheduleLeave);
router.get('/:id/documents', leaveController.getLeaveDocuments);
router.post('/:id/documents', uploadLeaveDocuments, leaveController.uploadLeaveDocuments);
router.get('/:id/documents/download/:filename', leaveController.downloadLeaveDocument);

export default router;
