import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as controller from '../controllers/projectDeletionRequests.controller';

const router = Router();

router.use(authenticate);

router.get('/', controller.listDeletionRequests);
router.get('/mine', controller.getMyDeletionRequest);
router.post('/:requestId/approve', controller.approveDeletionRequest);
router.post('/:requestId/reject', controller.rejectDeletionRequest);
router.post('/:requestId/regenerate-otp', controller.regenerateDeletionOtp);

export default router;
