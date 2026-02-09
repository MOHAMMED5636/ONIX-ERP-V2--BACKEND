import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission, ResourceType, PermissionAction } from '../middleware/permissions.middleware';
import * as documentsController from '../controllers/documents.controller';
import { upload } from '../middleware/upload.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Upload routes must come before /:id routes to avoid conflicts
// Upload a new document - support both /upload and root POST
// Accept both 'file' and 'document' field names
// Employees CANNOT create/upload documents (company policies)
const uploadMiddleware = (req: any, res: any, next: any) => {
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
};

router.post('/upload', requirePermission(ResourceType.DOCUMENT, PermissionAction.CREATE), uploadMiddleware, documentsController.uploadDocument);
router.post('/', requirePermission(ResourceType.DOCUMENT, PermissionAction.CREATE), uploadMiddleware, documentsController.uploadDocument);

// List all documents - Employees can VIEW documents
router.get('/', documentsController.listDocuments);

// Get a single document by ID - Employees can VIEW documents
router.get('/:id', documentsController.getDocument);

// Delete a document - Employees CANNOT delete documents
router.delete('/:id', requirePermission(ResourceType.DOCUMENT, PermissionAction.DELETE), documentsController.deleteDocument);

export default router;

