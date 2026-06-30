import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { uploadTeamChatFile } from '../middleware/upload.middleware';
import * as teamChatController from '../controllers/teamChat.controller';

const router = Router();

router.use(authenticate);

router.post('/messages/attachment', uploadTeamChatFile, teamChatController.uploadTeamChatAttachment);
router.delete('/messages/:messageId', teamChatController.deleteTeamChatMessage);

export default router;
