import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  resolveCompanyForAttendanceUser,
  validateOfficeGeofence,
} from './officeGeofence.service';
import {
  resolveEngineeringRoleSection,
  requiresEngineeringDailyReport,
  createCheckoutToken,
  assertReportSubmittedForDate,
} from './engineeringDailyReport.service';
import {
  applyFacialAttendance,
  detectDeviceInfo,
} from './faceAttendance.service';
import { UserRole } from '@prisma/client';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function dateFromYyyyMmDd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

export function resolveAttendanceDateFromBody(req: AuthRequest): Date {
  const raw = typeof req.body?.date === 'string' ? req.body.date.trim() : '';
  if (raw && YMD.test(raw)) return dateFromYyyyMmDd(raw);
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 12, 0, 0, 0));
}

async function resolveCompanyForUser(user: { company: string | null }) {
  return resolveCompanyForAttendanceUser(user);
}

export async function validateLocationIfProvided(
  user: { attendanceCategory: import('@prisma/client').AttendanceCategory; role: import('@prisma/client').UserRole },
  company: { officeLatitude: number | null; officeLongitude: number | null; attendanceRadius: number | null; requireOfficeGeofence?: boolean; name?: string },
  latitude?: number,
  longitude?: number,
): Promise<{ ok: true; distance: number | null; isWithinRadius: boolean | null } | { ok: false; status: number; message: string; code?: string; distance?: number; allowedRadius?: number }> {
  const result = validateOfficeGeofence(user, company, latitude, longitude);
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      message: result.message,
      code: result.code,
      distance: result.distance,
      allowedRadius: result.allowedRadius,
    };
  }
  return { ok: true, distance: result.distance, isWithinRadius: result.isWithinRadius };
}

export async function validateCheckoutPreconditions(
  userId: string,
  today: Date,
): Promise<{ ok: true; checkInTime: Date } | { ok: false; status: number; message: string }> {
  const existingCheckout = await prisma.attendance.findUnique({
    where: { userId_date_type: { userId, date: today, type: 'CHECK_OUT' } },
  });
  if (existingCheckout) {
    return { ok: false, status: 400, message: 'You have already checked out for today' };
  }

  const checkInToday = await prisma.attendance.findUnique({
    where: { userId_date_type: { userId, date: today, type: 'CHECK_IN' } },
  });
  if (!checkInToday?.checkInTime) {
    return { ok: false, status: 400, message: 'You must check in before checking out' };
  }

  const checkInTime = new Date(checkInToday.checkInTime);
  const now = new Date();
  if (now.getTime() <= checkInTime.getTime()) {
    return { ok: false, status: 400, message: 'Check-out time must be after check-in time' };
  }

  const MIN_DURATION_MS = 5 * 60 * 1000;
  if (now.getTime() - checkInTime.getTime() < MIN_DURATION_MS) {
    return {
      ok: false,
      status: 400,
      message: 'Minimum working duration is 5 minutes. Please wait before checking out.',
    };
  }

  return { ok: true, checkInTime };
}

export async function performCheckOut(
  req: AuthRequest,
  userId: string,
  today: Date,
  companyId: string,
  latitude?: number | null,
  longitude?: number | null,
  accuracy?: number | null,
  distance?: number | null,
  isWithinRadius?: boolean | null,
  faceFields?: {
    facePhotoPath?: string | null;
    faceMatchScore?: number | null;
    faceVerified?: boolean;
  },
) {
  const attendanceData = {
    userId,
    companyId,
    type: 'CHECK_OUT' as const,
    employeeLatitude: latitude ?? null,
    employeeLongitude: longitude ?? null,
    distanceFromOffice: distance ?? null,
    isWithinRadius: isWithinRadius !== null && isWithinRadius !== undefined ? isWithinRadius : true,
    date: today,
    locationAccuracy: accuracy ?? null,
    ipAddress: req.ip || req.socket.remoteAddress || null,
    userAgent: req.get('user-agent') || null,
    deviceInfo: detectDeviceInfo(req.get('user-agent')),
    status: 'PRESENT' as const,
    checkOutTime: new Date(),
    facePhotoPath: faceFields?.facePhotoPath ?? null,
    faceMatchScore: faceFields?.faceMatchScore ?? null,
    faceVerified: faceFields?.faceVerified ?? false,
  };

  const attendance = await prisma.attendance.create({
    data: attendanceData,
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  await prisma.attendance.update({
    where: { userId_date_type: { userId, date: today, type: 'CHECK_IN' } },
    data: { checkOutTime: new Date() },
  });

  return attendance;
}

export async function startCheckoutHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, attendanceCategory: true, department: true, position: true, jobTitle: true, company: true },
    });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const today = resolveAttendanceDateFromBody(req);
    const pre = await validateCheckoutPreconditions(userId, today);
    if (!pre.ok) {
      res.status(pre.status).json({ success: false, message: pre.message });
      return;
    }

    const { latitude, longitude, accuracy } = req.body;
    const company = await resolveCompanyForUser(user);
    if (!company) {
      res.status(500).json({ success: false, message: 'Company configuration not found' });
      return;
    }

    const loc = await validateLocationIfProvided(user, company, latitude, longitude);
    if (!loc.ok) {
      res.status(loc.status).json({
        success: false,
        message: loc.message,
        distance: loc.distance,
        allowedRadius: loc.allowedRadius,
      });
      return;
    }

    const roleSection = resolveEngineeringRoleSection(user);
    const reportRequired = requiresEngineeringDailyReport(user);
    const submitted = reportRequired ? await assertReportSubmittedForDate(userId, today) : true;

    const existingDraft = reportRequired
      ? await prisma.engineeringDailyReport.findUnique({
          where: { userId_reportDate: { userId, reportDate: today } },
        })
      : null;

    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const token = createCheckoutToken();

    const session = await prisma.checkoutSession.create({
      data: {
        userId,
        reportDate: today,
        token,
        dailyReportSubmitted: submitted,
        reportId: existingDraft?.status === 'SUBMITTED' ? existingDraft.id : existingDraft?.id ?? null,
        expiresAt,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        accuracy: accuracy ?? null,
      },
    });

    res.json({
      success: true,
      data: {
        sessionToken: session.token,
        reportRequired,
        reportAlreadySubmitted: submitted,
        roleSection,
        employee: {
          id: user.id,
          role: user.role,
          department: user.department,
          position: user.position,
        },
        draftPayload: existingDraft?.status === 'DRAFT' ? existingDraft.payload : null,
        expiresAt: session.expiresAt,
      },
    });
  } catch (e) {
    console.error('startCheckout:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

export async function completeCheckoutHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { sessionToken } = req.body;
    if (!sessionToken || typeof sessionToken !== 'string') {
      res.status(400).json({ success: false, message: 'sessionToken is required' });
      return;
    }

    const session = await prisma.checkoutSession.findUnique({ where: { token: sessionToken } });
    if (!session || session.userId !== userId) {
      res.status(404).json({ success: false, message: 'Checkout session not found' });
      return;
    }
    if (session.completedAt) {
      res.status(400).json({ success: false, message: 'Checkout already completed for this session' });
      return;
    }
    if (session.expiresAt < new Date()) {
      res.status(400).json({ success: false, message: 'Checkout session expired. Please start again.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, attendanceCategory: true, department: true, position: true, company: true, photo: true },
    });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (requiresEngineeringDailyReport(user)) {
      const submitted = await assertReportSubmittedForDate(userId, session.reportDate);
      if (!submitted && !session.dailyReportSubmitted) {
        res.status(403).json({
          success: false,
          code: 'DAILY_REPORT_REQUIRED',
          message: 'Submit your Engineering Daily Report before completing check-out.',
        });
        return;
      }
    }

    const pre = await validateCheckoutPreconditions(userId, session.reportDate);
    if (!pre.ok) {
      res.status(pre.status).json({ success: false, message: pre.message });
      return;
    }

    const company = await resolveCompanyForUser(user);
    if (!company) {
      res.status(500).json({ success: false, message: 'Company configuration not found' });
      return;
    }

    const loc = await validateLocationIfProvided(
      user,
      company,
      session.latitude ?? undefined,
      session.longitude ?? undefined,
    );
    if (!loc.ok) {
      res.status(loc.status).json({ success: false, message: loc.message });
      return;
    }

    const facial = applyFacialAttendance(
      userId,
      req.get('user-agent'),
      user.role as UserRole,
      company,
      user,
      'CHECK_OUT',
      { faceImage: req.body.faceImage, faceMatchScore: req.body.faceMatchScore },
    );
    if (!facial.ok) {
      res.status(facial.status).json({
        success: false,
        code: facial.code,
        message: facial.message,
      });
      return;
    }

    const attendance = await performCheckOut(
      req,
      userId,
      session.reportDate,
      company.id,
      session.latitude,
      session.longitude,
      session.accuracy,
      loc.distance,
      loc.isWithinRadius,
      {
        facePhotoPath: facial.facePhotoPath,
        faceMatchScore: facial.faceMatchScore,
        faceVerified: facial.faceVerified,
      },
    );

    await prisma.checkoutSession.update({
      where: { id: session.id },
      data: { completedAt: new Date(), dailyReportSubmitted: true },
    });

    res.json({
      success: true,
      message: 'Check-out recorded successfully',
      data: { attendance, dailyReportSubmitted: true },
    });
  } catch (e) {
    console.error('completeCheckout:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
