import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as tasksController from '../controllers/tasks.controller';
import * as checklistsController from '../controllers/checklists.controller';
import * as attachmentsController from '../controllers/attachments.controller';
import * as commentsController from '../controllers/comments.controller';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'tasks');
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

// Log all DELETE requests for debugging
router.use((req, res, next) => {
  if (req.method === 'DELETE') {
    console.log(`🔍 DELETE request: ${req.path}`);
    console.log(`   Query params:`, req.query);
    console.log(`   Body:`, req.body);
  }
  next();
});

// Task CRUD routes
router.get('/stats', tasksController.getTaskStats);
router.get('/kanban', tasksController.getKanbanTasks);
router.get('/', tasksController.getAllTasks);
router.get('/delegations/report', tasksController.getDelegationsReport);
router.get('/:id', tasksController.getTaskById);
router.post('/', tasksController.createTask);
router.put('/:id', tasksController.updateTask);
router.delete('/bulk', tasksController.deleteTasks); // Bulk delete must come before /:id
router.delete('/:id', tasksController.deleteTask);

// Hierarchical task endpoints (support both singular and plural for frontend compatibility)
router.post('/:parentId/subtask', tasksController.addSubtask); // Add subtask to main task
router.post('/:parentId/subtasks', tasksController.addSubtask); // Alias: some frontends call /subtasks
router.post('/:parentId/child', tasksController.addChildTask); // Add child task to subtask

// Task employee assignment
router.post('/:id/assign', tasksController.assignEmployees);
router.put('/:id/assignments/:assignmentId/status', tasksController.updateAssignmentStatus);
router.post('/:id/delegate', tasksController.delegateTask);

// Task checklists
router.get('/:taskId/checklists', checklistsController.getTaskChecklists);
router.post('/:taskId/checklists', checklistsController.createTaskChecklist);
router.put('/:taskId/checklists/:checklistId', checklistsController.updateTaskChecklist);
router.delete('/:taskId/checklists/:checklistId', checklistsController.deleteTaskChecklist);

// Task attachments
router.get('/:taskId/attachments', attachmentsController.getTaskAttachments);
router.post('/:taskId/attachments', upload.single('file'), attachmentsController.createTaskAttachment);
router.delete('/:taskId/attachments/:attachmentId', attachmentsController.deleteTaskAttachment);

// Task comments
router.get('/:taskId/comments', commentsController.getTaskComments);
router.post('/:taskId/comments', commentsController.createTaskComment);
router.put('/:taskId/comments/:commentId', commentsController.updateTaskComment);
router.delete('/:taskId/comments/:commentId', commentsController.deleteTaskComment);

export default router;

