import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  DailyReportPayload,
  normalizeDailyReportPayload,
  requiresEngineeringDailyReport,
  resolveEngineeringRoleSection,
  validateDailyReportPayload,
} from '../services/engineeringDailyReport.service';
import { dateFromYyyyMmDd, resolveAttendanceDateFromBody } from '../services/attendanceCheckout.service';
import { AbilityKeys, roleCanDefault } from '../utils/roleAbilities';
import { UserRole } from '@prisma/client';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

async function userCanViewAllAttendance(role: UserRole | undefined): Promise<boolean> {
  if (!role) return false;
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return true;
  const row = await prisma.roleAbility.findUnique({
    where: { role_ability: { role, ability: AbilityKeys.ATTENDANCE_VIEW_ALL } },
    select: { enabled: true },
  });
  return row?.enabled ?? roleCanDefault(role, AbilityKeys.ATTENDANCE_VIEW_ALL);
}

function resolveReportDate(req: AuthRequest): Date {
  const raw = typeof req.query?.date === 'string' ? req.query.date.trim() : '';
  if (raw && YMD.test(raw)) return dateFromYyyyMmDd(raw);
  return resolveAttendanceDateFromBody(req);
}

async function loadSessionForUser(sessionToken: string | undefined, userId: string) {
  if (!sessionToken) return null;
  const session = await prisma.checkoutSession.findUnique({ where: { token: sessionToken } });
  if (!session || session.userId !== userId) return null;
  if (session.expiresAt < new Date()) return null;
  if (session.completedAt) return null;
  return session;
}

export const getTodayDailyReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, department: true, position: true, jobTitle: true },
    });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const reportDate = resolveReportDate(req);
    const report = await prisma.engineeringDailyReport.findUnique({
      where: { userId_reportDate: { userId, reportDate } },
    });

    res.json({
      success: true,
      data: {
        reportRequired: requiresEngineeringDailyReport(user),
        roleSection: resolveEngineeringRoleSection(user),
        report: report
          ? {
              id: report.id,
              status: report.status,
              payload: report.payload,
              submittedAt: report.submittedAt,
              roleSection: report.roleSection,
            }
          : null,
      },
    });
  } catch (e) {
    console.error('getTodayDailyReport:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const saveDailyReportDraft = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, department: true, position: true, jobTitle: true },
    });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    if (!requiresEngineeringDailyReport(user)) {
      res.status(403).json({ success: false, message: 'Daily report not required for your role' });
      return;
    }

    const reportDate = resolveAttendanceDateFromBody(req);
    const payload = normalizeDailyReportPayload((req.body?.payload || {}) as DailyReportPayload);
    const roleSection = resolveEngineeringRoleSection(user);

    const existing = await prisma.engineeringDailyReport.findUnique({
      where: { userId_reportDate: { userId, reportDate } },
    });
    if (existing?.status === 'SUBMITTED') {
      res.status(400).json({ success: false, message: 'Report already submitted and locked for today' });
      return;
    }

    const report = await prisma.engineeringDailyReport.upsert({
      where: { userId_reportDate: { userId, reportDate } },
      create: {
        userId,
        reportDate,
        status: 'DRAFT',
        roleSection,
        payload: payload as Prisma.InputJsonValue,
      },
      update: { payload: payload as Prisma.InputJsonValue, roleSection },
    });

    const { sessionToken } = req.body;
    const session = await loadSessionForUser(sessionToken, userId);
    if (session) {
      await prisma.checkoutSession.update({
        where: { id: session.id },
        data: { reportId: report.id },
      });
    }

    res.json({ success: true, message: 'Draft saved', data: { id: report.id, payload: report.payload } });
  } catch (e) {
    console.error('saveDailyReportDraft:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const submitDailyReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, department: true, position: true, jobTitle: true },
    });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    if (!requiresEngineeringDailyReport(user)) {
      res.status(403).json({ success: false, message: 'Daily report not required for your role' });
      return;
    }

    const reportDate = resolveAttendanceDateFromBody(req);
    const roleSection = resolveEngineeringRoleSection(user);
    const payload = normalizeDailyReportPayload((req.body?.payload || {}) as DailyReportPayload);

    const existing = await prisma.engineeringDailyReport.findUnique({
      where: { userId_reportDate: { userId, reportDate } },
    });
    if (existing?.status === 'SUBMITTED') {
      res.json({
        success: true,
        message: 'Report already submitted for today',
        data: { id: existing.id, submittedAt: existing.submittedAt, alreadySubmitted: true },
      });
      return;
    }

    const errors = validateDailyReportPayload(payload, roleSection, false);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: 'Validation failed', errors });
      return;
    }

    const now = new Date();
    const report = await prisma.engineeringDailyReport.upsert({
      where: { userId_reportDate: { userId, reportDate } },
      create: {
        userId,
        reportDate,
        status: 'SUBMITTED',
        roleSection,
        payload: payload as Prisma.InputJsonValue,
        submittedAt: now,
      },
      update: {
        status: 'SUBMITTED',
        roleSection,
        payload: payload as Prisma.InputJsonValue,
        submittedAt: now,
      },
    });

    const { sessionToken } = req.body;
    const session = await loadSessionForUser(sessionToken, userId);
    if (session) {
      await prisma.checkoutSession.update({
        where: { id: session.id },
        data: { reportId: report.id, dailyReportSubmitted: true },
      });
    }

    res.json({
      success: true,
      message: 'Daily report submitted',
      data: {
        id: report.id,
        submittedAt: report.submittedAt,
        dailyReportSubmitted: true,
      },
    });
  } catch (e) {
    console.error('submitDailyReport:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Admin/HR: list submitted daily engineering reports */
export const listDailyReports = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { date, status, search, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(String(limit), 10) || 50), 100);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.EngineeringDailyReportWhereInput = {};

    if (date && typeof date === 'string' && YMD.test(date.trim())) {
      where.reportDate = dateFromYyyyMmDd(date.trim());
    }
    if (status === 'DRAFT' || status === 'SUBMITTED') {
      where.status = status;
    }
    if (search && String(search).trim()) {
      const term = String(search).trim();
      where.user = {
        OR: [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      };
    }

    const [reports, total] = await Promise.all([
      prisma.engineeringDailyReport.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: [{ reportDate: 'desc' }, { submittedAt: 'desc' }],
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              department: true,
              position: true,
            },
          },
        },
      }),
      prisma.engineeringDailyReport.count({ where }),
    ]);

    res.json({
      success: true,
      data: reports,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (e) {
    console.error('listDailyReports:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Get one daily report — owner or admin with attendance view */
export const getDailyReportById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const report = await prisma.engineeringDailyReport.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            department: true,
            position: true,
            jobTitle: true,
          },
        },
      },
    });

    if (!report) {
      res.status(404).json({ success: false, message: 'Report not found' });
      return;
    }

    const isOwner = report.userId === userId;
    if (!isOwner) {
      const canViewAll = await userCanViewAllAttendance(req.user?.role as UserRole | undefined);
      if (!canViewAll) {
        res.status(403).json({ success: false, message: 'Forbidden' });
        return;
      }
    }

    res.json({ success: true, data: report });
  } catch (e) {
    console.error('getDailyReportById:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
