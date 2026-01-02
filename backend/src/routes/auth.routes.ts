import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { uploadPhoto } from '../middleware/upload.middleware';
import * as authController from '../controllers/auth.controller';
import * as passwordController from '../controllers/password.controller';
import * as profileController from '../controllers/profile.controller';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

router.post('/login', authController.login);
router.get('/me', authenticate, authController.getCurrentUser);
router.post('/logout', authenticate, authController.logout);

// Profile management routes
router.put('/profile', authenticate, uploadPhoto.single('photo'), profileController.updateProfile);

// Password management routes
router.post('/change-password', authenticate, passwordController.changePassword);
router.post('/reset-password/:userId', authenticate, requireRole('ADMIN', 'HR'), passwordController.resetPassword);

export default router;

  