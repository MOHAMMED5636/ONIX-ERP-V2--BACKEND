import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { uploadFeedbackScreenshot } from '../middleware/upload.middleware';
import {
  submitSystemFeedback,
  listSystemFeedback,
  getSystemFeedback,
  updateSystemFeedback,
} from '../controllers/systemFeedback.controller';

const router = Router();

router.use(authenticate);

/** Any authenticated role may submit (Employees, Managers, HR, Admin, etc.). */
router.post('/', (req, res, next) => {
  uploadFeedbackScreenshot(req, res, (err) => {
    if (err) {
      res.status(400).json({
        success: false,
        message: (err as Error).message || 'Screenshot upload failed',
      });
      return;
    }
    next();
  });
}, submitSystemFeedback);

/** Admin-only inbox & management */
router.get('/', requireRole('ADMIN'), listSystemFeedback);
router.get('/:id', requireRole('ADMIN'), getSystemFeedback);
router.patch('/:id', requireRole('ADMIN'), updateSystemFeedback);

export default router;
