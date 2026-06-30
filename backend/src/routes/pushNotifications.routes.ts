import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as pushController from '../controllers/pushNotifications.controller';

const router = Router();

router.get('/vapid-public-key', pushController.getPushPublicKey);
router.post('/subscribe', authenticate, pushController.subscribePush);
router.post('/unsubscribe', authenticate, pushController.unsubscribePush);
router.post('/test', authenticate, pushController.testPush);

export default router;
