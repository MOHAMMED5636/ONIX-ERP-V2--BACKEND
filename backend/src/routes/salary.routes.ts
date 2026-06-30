import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as salaryController from '../controllers/salary.controller';
import { requireAbility } from '../middleware/abilities.middleware';
import { AbilityKeys } from '../utils/roleAbilities';
import { uploadCompanyPayslipTemplate, uploadCompanyStamp } from '../middleware/upload.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Self view (Manager/Employee read-only for their own data)
router.get('/self', salaryController.getSelfSalaryDetails);
router.get('/self/payslips', salaryController.getSelfPublishedPayslips);
router.get('/self/payslips/:year/:month', salaryController.getSelfPublishedPayslipDetail);
router.post('/self/payslip-request', salaryController.createSelfPayslipRequest);
router.get('/payslip-requests', requireAbility(AbilityKeys.SALARY_READ), salaryController.listPayslipRequests);
router.put(
  '/payslip-requests/:requestId/respond',
  requireAbility(AbilityKeys.SALARY_MANAGE),
  salaryController.respondToPayslipRequest,
);

// Employee salary structures
router.get('/employee/:employeeId/structures', requireAbility(AbilityKeys.SALARY_READ), salaryController.listEmployeeSalaryStructures);
router.post('/employee/:employeeId/structures', requireAbility(AbilityKeys.SALARY_MANAGE), salaryController.createSalaryStructure);
router.put('/employee/:employeeId/structures/:structureId', requireAbility(AbilityKeys.SALARY_MANAGE), salaryController.updateSalaryStructure);
router.delete('/employee/:employeeId/structures/:structureId', requireAbility(AbilityKeys.SALARY_MANAGE), salaryController.deleteSalaryStructure);

// Allowances CRUD
router.post(
  '/employee/:employeeId/structures/:structureId/allowances',
  requireAbility(AbilityKeys.SALARY_MANAGE),
  salaryController.addSalaryAllowance
);
router.put(
  '/employee/:employeeId/structures/:structureId/allowances/:allowanceId',
  requireAbility(AbilityKeys.SALARY_MANAGE),
  salaryController.updateSalaryAllowance
);
router.delete(
  '/employee/:employeeId/structures/:structureId/allowances/:allowanceId',
  requireAbility(AbilityKeys.SALARY_MANAGE),
  salaryController.deleteSalaryAllowance
);

// Deductions CRUD
router.post(
  '/employee/:employeeId/structures/:structureId/deductions',
  requireAbility(AbilityKeys.SALARY_MANAGE),
  salaryController.addSalaryDeduction
);
router.put(
  '/employee/:employeeId/structures/:structureId/deductions/:deductionId',
  requireAbility(AbilityKeys.SALARY_MANAGE),
  salaryController.updateSalaryDeduction
);
router.delete(
  '/employee/:employeeId/structures/:structureId/deductions/:deductionId',
  requireAbility(AbilityKeys.SALARY_MANAGE),
  salaryController.deleteSalaryDeduction
);

// Increment history CRUD
router.post(
  '/employee/:employeeId/structures/:structureId/increments',
  requireAbility(AbilityKeys.SALARY_MANAGE),
  salaryController.addSalaryIncrement
);
router.put(
  '/employee/:employeeId/structures/:structureId/increments/:incrementId',
  requireAbility(AbilityKeys.SALARY_MANAGE),
  salaryController.updateSalaryIncrement
);
router.delete(
  '/employee/:employeeId/structures/:structureId/increments/:incrementId',
  requireAbility(AbilityKeys.SALARY_MANAGE),
  salaryController.deleteSalaryIncrement
);

router.get(
  '/monthly-sheet',
  requireAbility(AbilityKeys.SALARY_READ),
  salaryController.getMonthlySalarySheet
);
router.put(
  '/monthly-sheet',
  requireAbility(AbilityKeys.SALARY_MANAGE),
  salaryController.saveMonthlySalarySheet
);
router.post(
  '/monthly-sheet/run-payroll',
  requireAbility(AbilityKeys.SALARY_MANAGE),
  salaryController.runPayrollFromMonthlySheet
);
router.post(
  '/monthly-sheet/publish',
  requireAbility(AbilityKeys.SALARY_MANAGE),
  salaryController.publishMonthlySalarySheet
);
router.post(
  '/monthly-sheet/unpublish',
  requireAbility(AbilityKeys.SALARY_MANAGE),
  salaryController.unpublishMonthlySalarySheet
);
router.post(
  '/company/:companyId/payslip-template',
  requireAbility(AbilityKeys.SALARY_MANAGE),
  uploadCompanyPayslipTemplate,
  salaryController.uploadPayslipTemplateForCompany
);
router.get(
  '/company/:companyId/payslip-template',
  requireAbility(AbilityKeys.SALARY_READ),
  salaryController.getPayslipTemplateForCompany
);
router.post(
  '/company/:companyId/stamp',
  requireAbility(AbilityKeys.SALARY_MANAGE),
  uploadCompanyStamp,
  salaryController.uploadCompanyStampForCompany
);
router.get(
  '/company/:companyId/stamp',
  requireAbility(AbilityKeys.SALARY_READ),
  salaryController.getCompanyStampForCompany
);
router.get(
  '/intelligence/dashboard',
  salaryController.getSalaryIntelligenceDashboardHandler
);
router.get(
  '/intelligence/employee/:employeeId',
  salaryController.getEmployeeSalaryIntelligenceHandler
);

export default router;

