import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as activityController from '../controllers/activity.controller';

const router = Router();

router.post('/track', authenticate, activityController.trackActivity);
router.get('/events', authenticate, activityController.listActivityEvents);

export default router;
