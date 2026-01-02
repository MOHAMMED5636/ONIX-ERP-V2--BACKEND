import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { uploadPhoto } from '../middleware/upload.middleware';
import * as employeeController from '../controllers/employee.controller';

const router = Router();

// All employee routes require authentication
router.use(authenticate);

// Employee CRUD routes
// Create employee - requires ADMIN or HR role + photo upload
router.post('/', requireRole('ADMIN', 'HR'), uploadPhoto.single('photo'), employeeController.createEmployee);
router.get('/', requireRole('ADMIN', 'HR'), employeeController.getEmployees);
router.get('/:id', employeeController.getEmployeeById);
router.put('/:id', requireRole('ADMIN', 'HR'), uploadPhoto.single('photo'), employeeController.updateEmployee);
router.delete('/:id', requireRole('ADMIN', 'HR'), employeeController.deleteEmployee);

export default router;


