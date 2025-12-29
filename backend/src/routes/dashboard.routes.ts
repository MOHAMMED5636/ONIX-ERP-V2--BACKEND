import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as dashboardController from '../controllers/dashboard.controller';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate);

// Dashboard endpoints
router.get('/stats', dashboardController.getDashboardStats);
router.get('/summary', dashboardController.getDashboardSummary);
router.get('/projects', dashboardController.getDashboardProjects);
router.get('/tasks', dashboardController.getDashboardTasks);
router.get('/team', dashboardController.getDashboardTeam);
router.get('/calendar', dashboardController.getDashboardCalendar);

export default router;


