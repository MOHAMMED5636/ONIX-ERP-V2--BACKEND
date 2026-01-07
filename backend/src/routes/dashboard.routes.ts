import { Router } from 'express';
import { optionalAuthenticate } from '../middleware/auth.middleware';
import * as dashboardController from '../controllers/dashboard.controller';

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

export default router;




