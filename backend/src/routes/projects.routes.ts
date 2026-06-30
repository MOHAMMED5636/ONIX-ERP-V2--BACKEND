import { Router, NextFunction, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { requirePermission, ResourceType, PermissionAction } from '../middleware/permissions.middleware';
import { uploadPhoto } from '../middleware/upload.middleware';
import * as projectsController from '../controllers/projects.controller';
import * as projectChatsController from '../controllers/projectChats.controller';
import * as checklistsController from '../controllers/checklists.controller';
import * as attachmentsController from '../controllers/attachments.controller';
import * as projectImportExportController from '../controllers/projectImportExport.controller';
import * as projectTaskFocusController from '../controllers/projectTaskFocus.controller';
import * as projectPmAssignmentsController from '../controllers/projectPmAssignments.controller';
import { excelUpload } from '../middleware/excelUpload.middleware';
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
// Employees can VIEW projects (GET requests are allowed - filtered to assigned projects in controller)
router.get('/', projectsController.getAllProjects);
router.get('/stats', projectsController.getProjectStats);
router.get('/focused-tasks', projectTaskFocusController.listMyFocusedTasks);
router.get('/pm-assignments/inbox', projectPmAssignmentsController.getPmAssignmentInbox);
router.post('/pm-assignments/acknowledge', projectPmAssignmentsController.acknowledgePmAssignmentsEndpoint);
router.get(
  '/reference-plan-days',
  projectsController.getReferencePlanDays,
);
router.get(
  '/trash/items',
  requirePermission(ResourceType.PROJECT, PermissionAction.READ),
  projectsController.getDeletedItems,
);
router.post(
  '/tasks/restore',
  requirePermission(ResourceType.PROJECT, PermissionAction.UPDATE),
  projectsController.restoreDeletedTasks,
);
router.post(
  '/tasks/permanent-delete',
  requirePermission(ResourceType.PROJECT, PermissionAction.DELETE),
  projectsController.permanentDeleteTasksFromTrash,
);
router.post(
  '/tasks/soft-delete',
  requirePermission(ResourceType.PROJECT, PermissionAction.DELETE),
  projectsController.softDeleteTasksEndpoint,
);
// Excel import/export (must be before /:id)
router.get(
  '/import-export/template',
  requirePermission(ResourceType.PROJECT, PermissionAction.READ),
  projectImportExportController.downloadProjectTemplate,
);
router.get(
  '/import-export/export',
  requirePermission(ResourceType.PROJECT, PermissionAction.READ),
  projectImportExportController.exportProjectsExcel,
);
router.post(
  '/import-export/import',
  requirePermission(ResourceType.PROJECT, PermissionAction.UPDATE),
  excelUpload.single('file'),
  projectImportExportController.importProjectsExcel,
);
router.get('/:id/activity', projectsController.getProjectActivity);
router.get('/:id/focused-task', projectTaskFocusController.getProjectFocusedTask);
router.put('/:id/focused-task', projectTaskFocusController.setProjectFocusedTask);
router.delete('/:id/focused-task', projectTaskFocusController.clearProjectFocusedTask);
router.get('/:id', projectsController.getProjectById);
// Employees CANNOT create or delete projects
router.post('/', requirePermission(ResourceType.PROJECT, PermissionAction.CREATE), projectsController.createProject);
// Employees can UPDATE but only their assigned projects (verified in controller)
router.put('/:id', requirePermission(ResourceType.PROJECT, PermissionAction.UPDATE), projectsController.updateProject);
router.put('/:id/name', requirePermission(ResourceType.PROJECT, PermissionAction.UPDATE), projectsController.updateProjectName);
router.post(
  '/:id/tasks/insert-after',
  requirePermission(ResourceType.PROJECT, PermissionAction.UPDATE),
  projectsController.insertTaskAfterHandler,
);
router.patch('/:id/name', requirePermission(ResourceType.PROJECT, PermissionAction.UPDATE), projectsController.updateProjectName); // Update only project name (persists after refresh)
router.post(
  '/:id/request-deletion-otp',
  requirePermission(ResourceType.PROJECT, PermissionAction.DELETE),
  projectsController.requestProjectDeletionOtp,
);
router.delete('/bulk', requirePermission(ResourceType.PROJECT, PermissionAction.DELETE), projectsController.deleteProjects); // Bulk delete must come before /:id
router.post(
  '/:id/restore',
  requirePermission(ResourceType.PROJECT, PermissionAction.UPDATE),
  projectsController.restoreDeletedProject,
);
router.post(
  '/:id/permanent-delete',
  requirePermission(ResourceType.PROJECT, PermissionAction.DELETE),
  projectsController.permanentDeleteProjectFromTrash,
);
router.delete('/:id', requirePermission(ResourceType.PROJECT, PermissionAction.DELETE), projectsController.deleteProject);

// Project employee assignment
router.post('/:id/assign', projectsController.assignEmployees);

// Project chat participants (alias — same handlers as /api/project-chats/project/:projectId/participants)
const mapProjectRouteIdToChatParam = (req: AuthRequest, _res: Response, next: NextFunction) => {
  req.params.projectId = req.params.id;
  next();
};
router.post(
  '/:id/chat/participants',
  mapProjectRouteIdToChatParam,
  projectChatsController.addProjectChatParticipants,
);
router.delete(
  '/:id/chat/participants/:userId',
  mapProjectRouteIdToChatParam,
  projectChatsController.removeProjectChatParticipant,
);

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



