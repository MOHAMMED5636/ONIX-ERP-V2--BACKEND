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
router.post('/request-login-otp', authController.requestLoginOtp);
router.post('/verify-login-otp', authController.verifyLoginOtp);
router.get('/me', authenticate, authController.getCurrentUser);
router.post('/logout', authenticate, authController.logout);

// Profile management routes - handle multer errors
router.put('/profile', authenticate, (req, res, next) => {
  console.log('📸 Profile update route - Multer middleware');
  console.log('   Content-Type:', req.headers['content-type']);
  console.log('   Content-Length:', req.headers['content-length']);
  
  uploadPhoto.single('photo')(req, res, (err) => {
    if (err) {
      console.error('❌ Multer upload error:', err);
      console.error('   Error code:', (err as any).code);
      console.error('   Error message:', err.message);
      res.status(400).json({
        success: false,
        message: err.message || 'File upload failed',
        error: process.env.NODE_ENV === 'development' ? {
          code: (err as any).code,
          message: err.message,
          stack: err.stack
        } : undefined
      });
      return;
    }
    
    // Log file info after multer processing
    const file = (req as any).file;
    if (file) {
      console.log('✅ File received by multer:', {
        fieldname: file.fieldname,
        originalname: file.originalname,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path
      });
    } else {
      console.log('ℹ️  No file in request (this is OK if only updating other fields)');
    }
    
    next();
  });
}, profileController.updateProfile);

// Password management routes
router.post('/change-password', authenticate, passwordController.changePassword);
router.post('/reset-password/:userId', authenticate, requireRole('ADMIN', 'HR'), passwordController.resetPassword);
router.post('/admin/set-password', authenticate, requireRole('ADMIN'), passwordController.setPassword);

// Organization preferences (Admin Profile). Read/Update: any authenticated user.
router.get('/preferences', authenticate, preferencesController.getPreferences);
router.patch('/preferences', authenticate, preferencesController.updatePreferences);

export default router;

  