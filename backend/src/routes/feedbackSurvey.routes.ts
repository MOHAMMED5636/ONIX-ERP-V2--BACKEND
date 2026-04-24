import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import {
  createFeedbackSurvey,
  listFeedbackSurveys,
  getFeedbackSurvey,
  getFeedbackSurveyStats,
  submitFeedbackSurveyResponses,
  deleteFeedbackSurvey,
  updateFeedbackSurveyStatus,
  updateFeedbackSurvey,
  publishFeedbackSurvey,
  duplicateFeedbackSurvey,
  postSurveySubmission,
  listSurveySubmissions,
  getSurveySubmissionDetail,
  getSurveyAnalytics,
  exportSurveyCsv,
  listSurveyShareLinks,
  createSurveyShareLink,
  revokeSurveyShareLink,
  addSurveyCollaborator,
  listSurveyCollaborators,
  removeSurveyCollaborator,
  upsertSurveyActions,
  listSurveyActions,
} from '../controllers/feedbackSurvey.controller';

const router = Router();
router.use(authenticate);

router.get('/stats/summary', requireRole('ADMIN', 'HR'), getFeedbackSurveyStats);
router.get('/', listFeedbackSurveys);

router.get('/:surveyId/submissions', listSurveySubmissions);
router.get('/:surveyId/submissions/:submissionId', getSurveySubmissionDetail);
router.get('/:surveyId/analytics', getSurveyAnalytics);
router.get('/:surveyId/exports/csv', exportSurveyCsv);

router.patch('/:surveyId/status', requireRole('ADMIN', 'HR'), updateFeedbackSurveyStatus);
router.patch('/:surveyId', updateFeedbackSurvey);

router.post('/', requireRole('ADMIN', 'HR'), createFeedbackSurvey);
router.post('/:surveyId/publish', publishFeedbackSurvey);
router.post('/:surveyId/duplicate', duplicateFeedbackSurvey);
router.post('/:surveyId/responses', submitFeedbackSurveyResponses);
router.post('/:surveyId/submissions', postSurveySubmission);

router.get('/:surveyId/share', listSurveyShareLinks);
router.post('/:surveyId/share', createSurveyShareLink);
router.delete('/:surveyId/share/:linkId', revokeSurveyShareLink);

router.get('/:surveyId/collaborators', listSurveyCollaborators);
router.post('/:surveyId/collaborators', addSurveyCollaborator);
router.delete('/:surveyId/collaborators/:userId', removeSurveyCollaborator);

router.get('/:surveyId/actions', listSurveyActions);
router.put('/:surveyId/actions', upsertSurveyActions);

router.delete('/:surveyId', requireRole('ADMIN', 'HR'), deleteFeedbackSurvey);
router.get('/:surveyId', getFeedbackSurvey);

export default router;
