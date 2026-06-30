import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAbility } from '../middleware/abilities.middleware';
import * as attendanceController from '../controllers/attendance.controller';
import * as engineeringDailyReportController from '../controllers/engineeringDailyReport.controller';
import * as attendanceImportExportController from '../controllers/attendanceImportExport.controller';
import * as attendanceManualEntryController from '../controllers/attendanceManualEntry.controller';
import * as attendanceManualEntryExcelController from '../controllers/attendanceManualEntryExcel.controller';
import * as projectAttendanceController from '../controllers/projectAttendance.controller';
import { excelUpload } from '../middleware/excelUpload.middleware';
import { AbilityKeys } from '../utils/roleAbilities';

const router = Router();

// All attendance routes require authentication
router.use(authenticate);

// Admin: all employees' attendance (date filter, working hours)
router.get('/all', requireAbility(AbilityKeys.ATTENDANCE_VIEW_ALL), attendanceController.getAllAttendanceForAdmin);

// Excel import/export for attendance list
router.get(
  '/import-export/template',
  requireAbility(AbilityKeys.ATTENDANCE_VIEW_ALL),
  attendanceImportExportController.downloadAttendanceTemplate,
);
router.get(
  '/import-export/export',
  requireAbility(AbilityKeys.ATTENDANCE_VIEW_ALL),
  attendanceImportExportController.exportAttendanceExcel,
);
router.post(
  '/import-export/import',
  requireAbility(AbilityKeys.ATTENDANCE_VIEW_ALL),
  excelUpload.single('file'),
  attendanceImportExportController.importAttendanceExcel,
);

// Manual attendance entry (Al Ansari–style grid below Import/Export)
router.get(
  '/manual-entry/employees',
  requireAbility(AbilityKeys.ATTENDANCE_VIEW_ALL),
  attendanceManualEntryController.getManualEntryEmployees,
);
router.post(
  '/manual-entry/save',
  requireAbility(AbilityKeys.ATTENDANCE_VIEW_ALL),
  attendanceManualEntryController.saveManualEntryAttendance,
);

router.get(
  '/manual-entry/excel/template',
  requireAbility(AbilityKeys.ATTENDANCE_VIEW_ALL),
  attendanceManualEntryExcelController.downloadMonthlyManualEntryTemplate,
);
router.get(
  '/manual-entry/excel/export',
  requireAbility(AbilityKeys.ATTENDANCE_VIEW_ALL),
  attendanceManualEntryExcelController.exportMonthlyManualEntryExcel,
);
router.post(
  '/manual-entry/excel/import',
  requireAbility(AbilityKeys.ATTENDANCE_VIEW_ALL),
  excelUpload.single('file'),
  attendanceManualEntryExcelController.importMonthlyManualEntryExcel,
);

// Get office location (for frontend proximity check)
router.get('/office-location', attendanceController.getOfficeLocation);

// Facial attendance config (mobile selfie check-in/out)
router.get('/face-config', attendanceController.getFaceAttendanceConfig);

// Get today's attendance status
router.get('/today', attendanceController.getTodayAttendance);

// Get attendance statistics
router.get('/stats', attendanceController.getAttendanceStats);

// Get employee's attendance records
router.get('/', attendanceController.getMyAttendance);

// Mark attendance (check-in or check-out)
router.post('/', attendanceController.markAttendance);

// Smart site attendance (project geofence + labor cost)
router.get('/site/projects', projectAttendanceController.getActiveSiteProjects);
router.get('/site/labor-workers', projectAttendanceController.getLaborWorkersForSite);
router.post('/site/punch-in', projectAttendanceController.punchInSite);
router.post('/site/punch-out', projectAttendanceController.punchOutSite);
router.get('/site/open', projectAttendanceController.getOpenSiteShifts);
router.get('/site/projects/:projectId/cost', projectAttendanceController.getSiteProjectCost);
router.get('/site/projects/:projectId/logs', projectAttendanceController.getSiteProjectLogs);

// Engineering daily report checkout flow
router.post('/checkout/start', attendanceController.startCheckout);
router.post('/checkout/complete', attendanceController.completeCheckout);
router.get('/daily-report/today', engineeringDailyReportController.getTodayDailyReport);
router.post('/daily-report/draft', engineeringDailyReportController.saveDailyReportDraft);
router.post('/daily-report/submit', engineeringDailyReportController.submitDailyReport);
router.get(
  '/daily-reports',
  requireAbility(AbilityKeys.ATTENDANCE_VIEW_ALL),
  engineeringDailyReportController.listDailyReports,
);
router.get('/daily-reports/:id', engineeringDailyReportController.getDailyReportById);

export default router;
