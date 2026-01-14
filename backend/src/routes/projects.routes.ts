import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { uploadPhoto } from '../middleware/upload.middleware';
import * as projectsController from '../controllers/projects.controller';
import * as checklistsController from '../controllers/checklists.controller';
import * as attachmentsController from '../controllers/attachments.controller';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'projects');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// All routes require authentication
router.use(authenticate);

// Project CRUD routes
router.get('/', projectsController.getAllProjects);
router.get('/stats', projectsController.getProjectStats);
router.get('/:id', projectsController.getProjectById);
router.post('/', projectsController.createProject);
router.put('/:id', projectsController.updateProject);
router.delete('/:id', projectsController.deleteProject);

// Project employee assignment
router.post('/:id/assign', projectsController.assignEmployees);

// Project checklists
router.get('/:projectId/checklists', checklistsController.getProjectChecklists);
router.post('/:projectId/checklists', checklistsController.createProjectChecklist);
router.put('/:projectId/checklists/:checklistId', checklistsController.updateProjectChecklist);
router.delete('/:projectId/checklists/:checklistId', checklistsController.deleteProjectChecklist);

// Project attachments
router.get('/:projectId/attachments', attachmentsController.getProjectAttachments);
router.post('/:projectId/attachments', upload.single('file'), attachmentsController.createProjectAttachment);
router.delete('/:projectId/attachments/:attachmentId', attachmentsController.deleteProjectAttachment);

export default router;



