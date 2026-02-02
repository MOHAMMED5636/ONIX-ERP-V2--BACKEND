import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as documentsController from '../controllers/documents.controller';
import { upload } from '../middleware/upload.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Upload routes must come before /:id routes to avoid conflicts
// Upload a new document - support both /upload and root POST
// Accept both 'file' and 'document' field names
router.post('/upload', (req, res, next) => {
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'document', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) {
      console.error('❌ Document upload multer error:', err);
      res.status(400).json({
        success: false,
        message: err.message || 'File upload failed'
      });
      return;
    }
    // Normalize the file to req.file for backward compatibility
    const files = (req as any).files || {};
    (req as any).file = files.file?.[0] || files.document?.[0] || null;
    next();
  });
}, documentsController.uploadDocument);

router.post('/', (req, res, next) => {
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'document', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) {
      console.error('❌ Document upload multer error:', err);
      res.status(400).json({
        success: false,
        message: err.message || 'File upload failed'
      });
      return;
    }
    // Normalize the file to req.file for backward compatibility
    const files = (req as any).files || {};
    (req as any).file = files.file?.[0] || files.document?.[0] || null;
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

