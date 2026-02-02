import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as departmentsController from '../controllers/departments.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Department routes
router.get('/:id', departmentsController.getDepartmentById);
router.put('/:id', departmentsController.updateDepartment);
router.delete('/:id', departmentsController.deleteDepartment);

export default router;
