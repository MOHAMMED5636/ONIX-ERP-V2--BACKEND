import { Router } from 'express';
import { optionalAuthenticate } from '../middleware/auth.middleware';
import { getPublicFormByToken, submitPublicFormByToken } from '../controllers/feedbackSurvey.controller';

const router = Router();

router.get('/:token', getPublicFormByToken);
router.post('/:token/submit', optionalAuthenticate, submitPublicFormByToken);

export default router;
