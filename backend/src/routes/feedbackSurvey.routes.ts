import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAbility } from '../middleware/abilities.middleware';
import { AbilityKeys } from '../utils/roleAbilities';
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

router.get('/stats/summary', requireAbility(AbilityKeys.FEEDBACK_SURVEY_READ), getFeedbackSurveyStats);
router.get('/', requireAbility(AbilityKeys.FEEDBACK_SURVEY_READ), listFeedbackSurveys);

router.get('/:surveyId/submissions', listSurveySubmissions);
router.get('/:surveyId/submissions/:submissionId', getSurveySubmissionDetail);
router.get('/:surveyId/analytics', getSurveyAnalytics);
router.get('/:surveyId/exports/csv', exportSurveyCsv);

router.patch('/:surveyId/status', requireAbility(AbilityKeys.FEEDBACK_SURVEY_MANAGE), updateFeedbackSurveyStatus);
router.patch('/:surveyId', requireAbility(AbilityKeys.FEEDBACK_SURVEY_MANAGE), updateFeedbackSurvey);

router.post('/', requireAbility(AbilityKeys.FEEDBACK_SURVEY_MANAGE), createFeedbackSurvey);
router.post('/:surveyId/publish', requireAbility(AbilityKeys.FEEDBACK_SURVEY_MANAGE), publishFeedbackSurvey);
router.post('/:surveyId/duplicate', requireAbility(AbilityKeys.FEEDBACK_SURVEY_MANAGE), duplicateFeedbackSurvey);
router.post('/:surveyId/responses', submitFeedbackSurveyResponses);
router.post('/:surveyId/submissions', postSurveySubmission);

router.get('/:surveyId/share', requireAbility(AbilityKeys.FEEDBACK_SURVEY_READ), listSurveyShareLinks);
router.post('/:surveyId/share', requireAbility(AbilityKeys.FEEDBACK_SURVEY_MANAGE), createSurveyShareLink);
router.delete('/:surveyId/share/:linkId', requireAbility(AbilityKeys.FEEDBACK_SURVEY_MANAGE), revokeSurveyShareLink);

router.get('/:surveyId/collaborators', requireAbility(AbilityKeys.FEEDBACK_SURVEY_READ), listSurveyCollaborators);
router.post('/:surveyId/collaborators', requireAbility(AbilityKeys.FEEDBACK_SURVEY_MANAGE), addSurveyCollaborator);
router.delete('/:surveyId/collaborators/:userId', requireAbility(AbilityKeys.FEEDBACK_SURVEY_MANAGE), removeSurveyCollaborator);

router.get('/:surveyId/actions', requireAbility(AbilityKeys.FEEDBACK_SURVEY_READ), listSurveyActions);
router.put('/:surveyId/actions', requireAbility(AbilityKeys.FEEDBACK_SURVEY_MANAGE), upsertSurveyActions);

router.delete('/:surveyId', requireAbility(AbilityKeys.FEEDBACK_SURVEY_MANAGE), deleteFeedbackSurvey);
router.get('/:surveyId', getFeedbackSurvey);

export default router;
