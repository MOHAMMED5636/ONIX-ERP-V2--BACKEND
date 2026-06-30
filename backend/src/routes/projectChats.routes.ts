import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { uploadProjectChatFile } from '../middleware/upload.middleware';
import * as projectChatsController from '../controllers/projectChats.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Project Chat routes
// Get all project chats (optionally filtered by projectId)
router.get('/', projectChatsController.getAllProjectChats);

// Get or create a project chat for a specific project
router.get('/project/:projectId', projectChatsController.getOrCreateProjectChat);

// Manage explicit chat participants (grant chat access to additional employees)
router.post('/project/:projectId/participants', projectChatsController.addProjectChatParticipants);
router.delete(
  '/project/:projectId/participants/:userId',
  projectChatsController.removeProjectChatParticipant,
);

// Read receipts: unread counts per chat for current user (chat list badges)
router.get('/unread/counts', projectChatsController.getProjectChatUnreadCounts);

// Read receipts: who saw a message
router.get('/messages/:messageId/seen-status', projectChatsController.getProjectMessageSeenStatus);

// Read receipts: mark single message seen
router.post('/messages/:messageId/seen', projectChatsController.markProjectMessageSeen);

// Get a specific project chat by ID with all messages
router.get('/:id', projectChatsController.getProjectChatById);

// Update a project chat (title, isActive)
router.put('/:id', projectChatsController.updateProjectChat);

// Delete a project chat
router.delete('/:id', projectChatsController.deleteProjectChat);

// Message routes
// Create a new message in a project chat
router.post('/:chatId/messages', projectChatsController.createProjectMessage);

// Read receipts: bulk mark all unread messages in a chat as seen
router.post('/:chatId/seen', projectChatsController.markProjectChatSeen);

// Upload photo / video / document attachment
router.post(
  '/:chatId/messages/attachment',
  uploadProjectChatFile,
  projectChatsController.createProjectChatAttachment,
);

// Delete a message
router.delete('/messages/:messageId', projectChatsController.deleteProjectMessage);

export default router;
