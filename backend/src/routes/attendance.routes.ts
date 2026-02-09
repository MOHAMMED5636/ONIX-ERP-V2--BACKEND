import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as attendanceController from '../controllers/attendance.controller';

const router = Router();

// All attendance routes require authentication
router.use(authenticate);

// Get office location (for frontend proximity check)
router.get('/office-location', attendanceController.getOfficeLocation);

// Get today's attendance status
router.get('/today', attendanceController.getTodayAttendance);

// Get attendance statistics
router.get('/stats', attendanceController.getAttendanceStats);

// Get employee's attendance records
router.get('/', attendanceController.getMyAttendance);

// Mark attendance (check-in or check-out)
router.post('/', attendanceController.markAttendance);

export default router;
