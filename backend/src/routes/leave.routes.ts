import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { uploadLeaveDocuments } from '../middleware/upload.middleware';
import * as leaveController from '../controllers/leave.controller';

const router = Router();

router.use(authenticate);

router.get('/balance', leaveController.getMyBalance);
router.get('/policies', leaveController.getLeavePolicies);
router.get('/reports/summary', leaveController.getLeaveReportsSummary);
router.get('/reports/export', leaveController.getLeaveReportExport);
router.get('/hr/dashboard', leaveController.getHRDashboard);
router.get('/hr/employee-balances', leaveController.getEmployeeBalances);
router.get('/documents/certificates', leaveController.listCertificatesForHR);
router.post('/', leaveController.createLeave);
router.get('/', leaveController.listLeaves);
router.get('/:id', leaveController.getLeaveById);
router.post('/:id/approve', leaveController.approveLeave);
router.post('/:id/reject', leaveController.rejectLeave);
router.post('/:id/reschedule', leaveController.rescheduleLeave);
router.get('/:id/documents', leaveController.getLeaveDocuments);
router.post('/:id/documents', uploadLeaveDocuments, leaveController.uploadLeaveDocuments);
router.get('/:id/documents/download/:filename', leaveController.downloadLeaveDocument);

export default router;
