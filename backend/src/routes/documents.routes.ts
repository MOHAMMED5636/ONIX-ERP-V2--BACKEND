import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as documentsController from '../controllers/documents.controller';
import { upload } from '../middleware/upload.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Upload routes must come before /:id routes to avoid conflicts
// Upload a new document - support both /upload and root POST
router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('❌ Document upload multer error:', err);
      res.status(400).json({
        success: false,
        message: err.message || 'File upload failed'
      });
      return;
    }
    next();
  });
}, documentsController.uploadDocument);

router.post('/', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('❌ Document upload multer error:', err);
      res.status(400).json({
        success: false,
        message: err.message || 'File upload failed'
      });
      return;
    }
    next();
  });
}, documentsController.uploadDocument);

// List all documents
router.get('/', documentsController.listDocuments);

// Get a single document by ID
router.get('/:id', documentsController.getDocument);

// Delete a document
router.delete('/:id', documentsController.deleteDocument);

export default router;

