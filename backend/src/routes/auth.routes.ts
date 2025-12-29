import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as authController from '../controllers/auth.controller';
import * as passwordController from '../controllers/password.controller';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

router.post('/login', authController.login);
router.get('/me', authenticate, authController.getCurrentUser);
router.post('/logout', authenticate, authController.logout);

// Password management routes
router.post('/change-password', authenticate, passwordController.changePassword);
router.post('/reset-password/:userId', authenticate, requireRole('ADMIN', 'HR'), passwordController.resetPassword);

export default router;

  