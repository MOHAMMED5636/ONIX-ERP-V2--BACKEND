import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { requireAbility } from '../middleware/abilities.middleware';
import { uploadEmployeeFiles } from '../middleware/upload.middleware';
import { excelUpload } from '../middleware/excelUpload.middleware';
import * as employeeController from '../controllers/employee.controller';
import * as attendanceProgramController from '../controllers/attendanceProgram.controller';
import * as employeeImportExportController from '../controllers/employeeImportExport.controller';
import { AbilityKeys } from '../utils/roleAbilities';

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
router.post('/', requireAbility(AbilityKeys.EMPLOYEE_MANAGE), logRequestBeforeMulter, uploadEmployeeFiles, employeeController.createEmployee);
router.get('/check-availability', requireAbility(AbilityKeys.EMPLOYEE_MANAGE), employeeController.checkEmployeeAvailability);
router.get(
  '/statistics',
  requireRole('ADMIN', 'HR', 'MANAGER', 'PROJECT_MANAGER', 'EMPLOYEE'),
  employeeController.getEmployeeStatistics
);
// Get employees - accessible by ADMIN, HR, MANAGER, PROJECT_MANAGER, and EMPLOYEE (for assigning tasks)
// Managers and Project Managers use the SAME module as employees - they can see employee list for task assignment
router.get('/', requireRole('ADMIN', 'HR', 'MANAGER', 'PROJECT_MANAGER', 'EMPLOYEE'), employeeController.getEmployees);

// Employee Import/Export (Excel) - schema/template/import/export
router.get('/import/template', requireAbility(AbilityKeys.EMPLOYEE_MANAGE), employeeImportExportController.downloadEmployeeTemplate);
router.post('/import', requireAbility(AbilityKeys.EMPLOYEE_MANAGE), excelUpload.single('file'), employeeImportExportController.importEmployeesExcel);
router.get('/export', requireAbility(AbilityKeys.EMPLOYEE_MANAGE), employeeImportExportController.exportEmployeesExcel);

// Bulk rename attendance program label (stored on User.attendanceProgram) — before /:id
router.post(
  '/rename-attendance-program',
  requireAbility(AbilityKeys.EMPLOYEE_MANAGE),
  employeeController.renameAttendanceProgram
);
router.get(
  '/attendance-programs',
  requireRole('ADMIN', 'HR', 'MANAGER', 'PROJECT_MANAGER', 'EMPLOYEE'),
  attendanceProgramController.listAttendancePrograms
);
router.post(
  '/attendance-programs',
  requireAbility(AbilityKeys.EMPLOYEE_MANAGE),
  attendanceProgramController.createAttendanceProgram
);
router.put(
  '/attendance-programs/:programId',
  requireAbility(AbilityKeys.EMPLOYEE_MANAGE),
  attendanceProgramController.updateAttendanceProgram
);
router.delete(
  '/attendance-programs/:programId',
  requireAbility(AbilityKeys.EMPLOYEE_MANAGE),
  attendanceProgramController.deleteAttendanceProgram
);
// Restore route must come BEFORE /:id route to avoid route conflicts
router.put('/:id/restore', requireAbility(AbilityKeys.EMPLOYEE_MANAGE), employeeController.restoreEmployee);
router.get(
  '/:id/change-history',
  requireAbility(AbilityKeys.EMPLOYEE_MANAGE),
  employeeController.getEmployeeChangeHistory
);
router.get(
  '/:id/role-management',
  requireRole('SUPER_ADMIN', 'HR'),
  employeeController.getEmployeeRoleManagement
);
router.patch(
  '/:id/role-management',
  requireRole('SUPER_ADMIN', 'HR'),
  employeeController.updateEmployeeRoleManagement
);
router.post(
  '/:id/position-assignments',
  requireAbility(AbilityKeys.EMPLOYEE_MANAGE),
  employeeController.assignEmployeeToOrgPosition
);
router.delete(
  '/:id/position-assignments/:positionId',
  requireAbility(AbilityKeys.EMPLOYEE_MANAGE),
  employeeController.removeEmployeeOrgPositionAssignment
);
router.get('/:id', employeeController.getEmployeeById);
router.put('/:id', requireAbility(AbilityKeys.EMPLOYEE_MANAGE), logRequestBeforeMulter, uploadEmployeeFiles, employeeController.updateEmployee);
router.delete('/:id', requireAbility(AbilityKeys.EMPLOYEE_MANAGE), employeeController.deleteEmployee);

export default router;


