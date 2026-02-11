import { Router } from 'express';
import {
  // Templates
  getQuestionnaireTemplates,
  getQuestionnaireTemplate,
  createQuestionnaireTemplate,
  updateQuestionnaireTemplate,
  deleteQuestionnaireTemplate,
  // Questions
  getQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  // Responses
  submitResponse,
  getResponses,
  lockResponse,
  // Assignments
  assignTemplate,
  getAssignments,
  // Status
  getQuestionnaireStatus,
} from '../controllers/questionnaire.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ============================================
// TEMPLATE ROUTES
// ============================================
router.get('/templates', getQuestionnaireTemplates);
router.get('/templates/:templateId', getQuestionnaireTemplate);
router.post('/templates', requireRole('ADMIN', 'PROJECT_MANAGER', 'HR'), createQuestionnaireTemplate);
router.put('/templates/:templateId', requireRole('ADMIN', 'PROJECT_MANAGER', 'HR'), updateQuestionnaireTemplate);
router.delete('/templates/:templateId', requireRole('ADMIN', 'PROJECT_MANAGER', 'HR'), deleteQuestionnaireTemplate);

// ============================================
// QUESTION ROUTES
// ============================================
router.get('/questions', getQuestions);
router.post('/questions', requireRole('ADMIN', 'PROJECT_MANAGER', 'HR'), createQuestion);
router.put('/questions/:questionId', requireRole('ADMIN', 'PROJECT_MANAGER', 'HR'), updateQuestion);
router.delete('/questions/:questionId', requireRole('ADMIN', 'PROJECT_MANAGER', 'HR'), deleteQuestion);

// ============================================
// RESPONSE ROUTES
// ============================================
router.post('/questions/:questionId/responses', submitResponse); // Employees can submit
router.get('/questions/:questionId/responses', getResponses); // View responses
router.put('/responses/:responseId/lock', requireRole('ADMIN', 'PROJECT_MANAGER', 'HR'), lockResponse);

// ============================================
// ASSIGNMENT ROUTES
// ============================================
router.post('/templates/:templateId/assign', requireRole('ADMIN', 'PROJECT_MANAGER', 'HR'), assignTemplate);
router.get('/assignments', getAssignments);

// ============================================
// STATUS ROUTES
// ============================================
router.get('/status', getQuestionnaireStatus);

export default router;
