import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  listEmailTemplates,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  testEmailTemplate,
  listEmailTriggers,
  upsertEmailTrigger,
  deleteEmailTrigger,
  listEmailLogs,
  listEmailQueue,
  retryQueueItem,
} from '../controllers/emailManagement.controller';

const router = Router();
router.use(authenticate);

// Templates
router.get('/templates', listEmailTemplates);
router.post('/templates', createEmailTemplate);
router.patch('/templates/:id', updateEmailTemplate);
router.delete('/templates/:id', deleteEmailTemplate);
router.post('/templates/:id/test', testEmailTemplate);

// Triggers
router.get('/triggers', listEmailTriggers);
router.post('/triggers', upsertEmailTrigger);
router.patch('/triggers/:id', upsertEmailTrigger);
router.delete('/triggers/:id', deleteEmailTrigger);

// Logs
router.get('/logs', listEmailLogs);

// Queue
router.get('/queue', listEmailQueue);
router.post('/queue/:id/retry', retryQueueItem);

export default router;

