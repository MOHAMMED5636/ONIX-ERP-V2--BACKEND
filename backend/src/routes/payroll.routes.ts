import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as payrollController from '../controllers/payroll.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Payroll settings (HR/Admin)
router.get('/settings', payrollController.getPayrollSettings);
router.put('/settings', payrollController.updatePayrollSettings);

// Payroll runs list & details (HR/Admin)
router.get('/runs', payrollController.listPayrollRuns);
router.get('/runs/:id', payrollController.getPayrollRun);

// Self payslips (Manager/Employee view-only)
router.get('/self', payrollController.getSelfPayslips);

// Payroll run lines
router.get('/runs/:runId/lines', payrollController.getRunLines);

// HR/Admin: create run
router.post('/runs', payrollController.createPayrollRun);

// HR/Admin: manual adjustments
router.patch('/runs/:runId/lines/:lineId/adjustment', payrollController.adjustPayrollLine);
router.put('/runs/:id/lines/:lineId', payrollController.updatePayrollLine);

// HR/Admin: approvals
router.post('/runs/:runId/approve', payrollController.approvePayrollRun);
router.post('/runs/:id/approve/hr', payrollController.approvePayrollHR);
router.post('/runs/:id/approve/finance', payrollController.approvePayrollFinance);
router.post('/runs/:id/approve/final', payrollController.approvePayrollFinal);

// HR/Admin: lock & payslip generation
router.post('/runs/:runId/lock', payrollController.lockPayrollRun);
router.post('/runs/:runId/payslips/generate', payrollController.generatePayslipsForRun);
router.get('/runs/:id/payslip/:employeeId', payrollController.generatePayslip);
router.get('/runs/:id/register', payrollController.generateRegister);

export default router;

