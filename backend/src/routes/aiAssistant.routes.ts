import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  getAiAssistantStatus,
  postAiAssistantChat,
} from '../controllers/aiAssistant.controller';

const router = Router();

router.use(authenticate);

router.get('/status', getAiAssistantStatus);
router.post('/chat', postAiAssistantChat);

export default router;
