import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as leaveController from '../controllers/leave.controller';

const router = Router();

router.use(authenticate);

router.get('/balance', leaveController.getMyBalance);
router.post('/', leaveController.createLeave);
router.get('/', leaveController.listLeaves);
router.get('/:id', leaveController.getLeaveById);
router.post('/:id/approve', leaveController.approveLeave);
router.post('/:id/reject', leaveController.rejectLeave);

export default router;
