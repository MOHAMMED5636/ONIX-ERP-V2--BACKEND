import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import * as employeeController from '../controllers/employee.controller';

const router = Router();

// All employee routes require authentication
router.use(authenticate);

// All routes require ADMIN or HR role
router.use(requireRole('ADMIN', 'HR'));

// Employee CRUD routes
router.post('/', employeeController.createEmployee);
router.get('/', employeeController.getEmployees);
router.get('/:id', employeeController.getEmployeeById);
router.put('/:id', employeeController.updateEmployee);
router.delete('/:id', employeeController.deleteEmployee);

export default router;

