import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission, ResourceType, PermissionAction } from '../middleware/permissions.middleware';
import * as subDepartmentsController from '../controllers/subdepartments.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Sub-department routes
// Note: Routes with :departmentId must come before routes with :id
// Employees can only VIEW sub-departments (GET requests are allowed)
router.get('/departments/:departmentId/sub-departments', subDepartmentsController.getDepartmentSubDepartments);
router.get('/sub-departments/:id', subDepartmentsController.getSubDepartmentById);
// Employees CANNOT create, edit, or delete sub-departments
router.post('/departments/:departmentId/sub-departments', requirePermission(ResourceType.SUBDEPARTMENT, PermissionAction.CREATE), subDepartmentsController.createDepartmentSubDepartment);
router.put('/sub-departments/:id', requirePermission(ResourceType.SUBDEPARTMENT, PermissionAction.UPDATE), subDepartmentsController.updateSubDepartment);
router.delete('/sub-departments/:id', requirePermission(ResourceType.SUBDEPARTMENT, PermissionAction.DELETE), subDepartmentsController.deleteSubDepartment);

export default router;
