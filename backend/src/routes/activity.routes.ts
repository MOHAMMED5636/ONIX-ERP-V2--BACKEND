import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as activityController from '../controllers/activity.controller';
import { requireAbility } from '../middleware/abilities.middleware';
import { AbilityKeys } from '../utils/roleAbilities';

const router = Router();

router.post('/track', authenticate, activityController.trackActivity);
router.get('/events', authenticate, requireAbility(AbilityKeys.ACTIVITY_VIEW), activityController.listActivityEvents);

export default router;
