import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as positionsController from '../controllers/positions.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Position routes
// Note: Routes with :subDepartmentId must come before routes with :id
router.get('/sub-departments/:subDepartmentId/positions', positionsController.getSubDepartmentPositions);
router.post('/sub-departments/:subDepartmentId/positions', positionsController.createSubDepartmentPosition);
router.get('/positions/:id', positionsController.getPositionById);
router.put('/positions/:id', positionsController.updatePosition);
router.delete('/positions/:id', positionsController.deletePosition);

export default router;
