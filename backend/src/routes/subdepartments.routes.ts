import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as subDepartmentsController from '../controllers/subdepartments.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Sub-department routes
// Note: Routes with :departmentId must come before routes with :id
router.get('/departments/:departmentId/sub-departments', subDepartmentsController.getDepartmentSubDepartments);
router.post('/departments/:departmentId/sub-departments', subDepartmentsController.createDepartmentSubDepartment);
router.get('/sub-departments/:id', subDepartmentsController.getSubDepartmentById);
router.put('/sub-departments/:id', subDepartmentsController.updateSubDepartment);
router.delete('/sub-departments/:id', subDepartmentsController.deleteSubDepartment);

export default router;
