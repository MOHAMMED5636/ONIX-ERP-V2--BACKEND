import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { uploadPhoto } from '../middleware/upload.middleware';
import * as authController from '../controllers/auth.controller';
import * as passwordController from '../controllers/password.controller';
import * as profileController from '../controllers/profile.controller';
import * as preferencesController from '../controllers/preferences.controller';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

router.post('/login', authController.login);
router.get('/me', authenticate, authController.getCurrentUser);
router.post('/logout', authenticate, authController.logout);

// Profile management routes - handle multer errors
router.put('/profile', authenticate, (req, res, next) => {
  uploadPhoto.single('photo')(req, res, (err) => {
    if (err) {
      console.error('❌ Multer upload error:', err);
      res.status(400).json({
        success: false,
        message: err.message || 'File upload failed'
      });
      return;
    }
    next();
  });
}, profileController.updateProfile);

// Password management routes
router.post('/change-password', authenticate, passwordController.changePassword);
router.post('/reset-password/:userId', authenticate, requireRole('ADMIN', 'HR'), passwordController.resetPassword);

// Organization preferences (Admin Profile). Read: any authenticated; Update: Admin only.
router.get('/preferences', authenticate, preferencesController.getPreferences);
router.patch('/preferences', authenticate, requireRole('ADMIN'), preferencesController.updatePreferences);

export default router;

  