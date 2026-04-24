import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';
import * as dashboardController from '../controllers/dashboard.controller';
import * as dashboardWidgetPreferencesController from '../controllers/dashboardWidgetPreferences.controller';

const router = Router();

// Dashboard routes use optional authentication - will return default values if token is invalid/expired
router.use(optionalAuthenticate);

// Dashboard endpoints
router.get('/stats', dashboardController.getDashboardStats);
router.get('/summary', dashboardController.getDashboardSummary);
router.get('/projects', dashboardController.getDashboardProjects);
router.get('/tasks', dashboardController.getDashboardTasks);
router.get('/team', dashboardController.getDashboardTeam);
router.get('/calendar', dashboardController.getDashboardCalendar);

// Dashboard widget preferences (per user) — requires auth
router.get('/widgets/me', authenticate, dashboardWidgetPreferencesController.getMyDashboardWidgetPreferences);
router.put('/widgets/me', authenticate, dashboardWidgetPreferencesController.upsertMyDashboardWidgetPreferences);
router.delete('/widgets/me', authenticate, dashboardWidgetPreferencesController.resetMyDashboardWidgetPreferences);

export default router;




