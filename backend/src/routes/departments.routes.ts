import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission, ResourceType, PermissionAction } from '../middleware/permissions.middleware';
import * as departmentsController from '../controllers/departments.controller';
import * as workloadController from '../controllers/workload.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Department routes
// Employees can only VIEW departments (GET requests are allowed)
router.get('/:id/workload', workloadController.getDepartmentWorkload);
router.get('/:id', departmentsController.getDepartmentById);
// Employees CANNOT create, edit, or delete departments
router.put('/:id', requirePermission(ResourceType.DEPARTMENT, PermissionAction.UPDATE), departmentsController.updateDepartment);
router.delete('/:id', requirePermission(ResourceType.DEPARTMENT, PermissionAction.DELETE), departmentsController.deleteDepartment);

export default router;
