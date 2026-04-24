import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import * as positionsController from '../controllers/positions.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Position routes
// Note: Routes with :subDepartmentId must come before routes with :id
router.get('/sub-departments/:subDepartmentId/positions', positionsController.getSubDepartmentPositions);
router.post('/sub-departments/:subDepartmentId/positions', positionsController.createSubDepartmentPosition);
// List all positions (HR/Admin job title management) — must be before GET /positions/:id
router.get('/positions', requireRole('ADMIN', 'HR'), positionsController.getAllPositions);
router.get('/positions/:id', positionsController.getPositionById);
router.put('/positions/:id', requireRole('ADMIN', 'HR'), positionsController.updatePosition);
router.delete('/positions/:id', requireRole('ADMIN', 'HR'), positionsController.deletePosition);

export default router;
