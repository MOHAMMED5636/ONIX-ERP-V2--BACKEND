import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as salaryController from '../controllers/salary.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Self view (Manager/Employee read-only for their own data)
router.get('/self', salaryController.getSelfSalaryDetails);

// Employee salary structures
router.get('/employee/:employeeId/structures', salaryController.listEmployeeSalaryStructures);
router.post('/employee/:employeeId/structures', salaryController.createSalaryStructure);
router.put('/employee/:employeeId/structures/:structureId', salaryController.updateSalaryStructure);
router.delete('/employee/:employeeId/structures/:structureId', salaryController.deleteSalaryStructure);

// Allowances CRUD
router.post(
  '/employee/:employeeId/structures/:structureId/allowances',
  salaryController.addSalaryAllowance
);
router.put(
  '/employee/:employeeId/structures/:structureId/allowances/:allowanceId',
  salaryController.updateSalaryAllowance
);
router.delete(
  '/employee/:employeeId/structures/:structureId/allowances/:allowanceId',
  salaryController.deleteSalaryAllowance
);

// Deductions CRUD
router.post(
  '/employee/:employeeId/structures/:structureId/deductions',
  salaryController.addSalaryDeduction
);
router.put(
  '/employee/:employeeId/structures/:structureId/deductions/:deductionId',
  salaryController.updateSalaryDeduction
);
router.delete(
  '/employee/:employeeId/structures/:structureId/deductions/:deductionId',
  salaryController.deleteSalaryDeduction
);

// Increment history CRUD
router.post(
  '/employee/:employeeId/structures/:structureId/increments',
  salaryController.addSalaryIncrement
);
router.put(
  '/employee/:employeeId/structures/:structureId/increments/:incrementId',
  salaryController.updateSalaryIncrement
);
router.delete(
  '/employee/:employeeId/structures/:structureId/increments/:incrementId',
  salaryController.deleteSalaryIncrement
);

export default router;

