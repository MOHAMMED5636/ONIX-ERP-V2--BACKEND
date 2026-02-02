import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as projectChatsController from '../controllers/projectChats.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Project Chat routes
// Get all project chats (optionally filtered by projectId)
router.get('/', projectChatsController.getAllProjectChats);

// Get or create a project chat for a specific project
router.get('/project/:projectId', projectChatsController.getOrCreateProjectChat);

// Get a specific project chat by ID with all messages
router.get('/:id', projectChatsController.getProjectChatById);

// Update a project chat (title, isActive)
router.put('/:id', projectChatsController.updateProjectChat);

// Delete a project chat
router.delete('/:id', projectChatsController.deleteProjectChat);

// Message routes
// Create a new message in a project chat
router.post('/:chatId/messages', projectChatsController.createProjectMessage);

// Delete a message
router.delete('/messages/:messageId', projectChatsController.deleteProjectMessage);

export default router;
