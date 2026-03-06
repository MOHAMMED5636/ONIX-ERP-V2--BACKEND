import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { uploadEmployeeFiles } from '../middleware/upload.middleware';
import * as employeeController from '../controllers/employee.controller';

const router = Router();

// All employee routes require authentication
router.use(authenticate);

// Debug middleware to log request before multer processes it
const logRequestBeforeMulter = (req: any, res: any, next: any) => {
  console.log('🔍 Request before multer:', {
    method: req.method,
    url: req.url,
    contentType: req.headers['content-type'],
    bodyKeys: Object.keys(req.body || {}),
    hasBody: !!req.body
  });
  next();
};

// Employee CRUD routes
// Create employee - requires ADMIN or HR role + photo and legal documents uploads
router.post('/', requireRole('ADMIN', 'HR'), logRequestBeforeMulter, uploadEmployeeFiles, employeeController.createEmployee);
router.get('/check-availability', requireRole('ADMIN', 'HR'), employeeController.checkEmployeeAvailability);
router.get('/statistics', requireRole('ADMIN', 'HR'), employeeController.getEmployeeStatistics);
// Get employees - accessible by ADMIN, HR, MANAGER, PROJECT_MANAGER, and EMPLOYEE (for assigning tasks)
// Managers and Project Managers use the SAME module as employees - they can see employee list for task assignment
router.get('/', requireRole('ADMIN', 'HR', 'MANAGER', 'PROJECT_MANAGER', 'EMPLOYEE'), employeeController.getEmployees);
// Restore route must come BEFORE /:id route to avoid route conflicts
router.put('/:id/restore', requireRole('ADMIN', 'HR'), employeeController.restoreEmployee);
router.get('/:id', employeeController.getEmployeeById);
router.put('/:id', requireRole('ADMIN', 'HR'), logRequestBeforeMulter, uploadEmployeeFiles, employeeController.updateEmployee);
router.delete('/:id', requireRole('ADMIN', 'HR'), employeeController.deleteEmployee);

export default router;


