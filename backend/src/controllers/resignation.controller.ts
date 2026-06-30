import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  appendResignationLog,
  notifyResignationWorkflow,
  resolveProjectManagerId,
  resignationInclude,
  isHrRole,
  isGeneralManagerUser,
  isFinanceUser,
  canActAsProjectManager,
} from '../services/resignationWorkflow.service';

function parseDateYmd(raw: unknown): Date | null {
  if (!raw || typeof raw !== 'string') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseAttachmentsJson(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const TERMINAL_RESIGNATION_STAGES = [
  'REJECTED_BY_PROJECT_MANAGER',
  'REJECTED_BY_HR',
  'REJECTED_HR_FINAL',
  'RESIGNATION_COMPLETED',
  'WITHDRAWN',
  'FINANCE_CLEARANCE_REJECTED',
] as const;

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function categorizeResignationReason(reason: string): string {
  const text = reason.toLowerCase();
  if (/relocat|moving|abroad|country|city/.test(text)) return 'Relocation';
  if (/salary|compensation|pay|benefit|offer/.test(text)) return 'Compensation';
  if (/family|personal|marriage|child|parent/.test(text)) return 'Personal / Family';
  if (/health|burnout|stress|medical/.test(text)) return 'Health / Burnout';
  if (/career|growth|promotion|learning|study|masters|mba/.test(text)) return 'Career / Growth';
  return 'Other';
}

async function buildResignationAnalytics(baseWhere: Record<string, unknown>) {
  const rows = await prisma.resignationRequest.findMany({
    where: baseWhere,
    select: {
      id: true,
      createdAt: true,
      workflowStage: true,
      intendedLastWorkingDay: true,
      finalExitDate: true,
      reason: true,
      retentionOfferAccepted: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          department: true,
          employeeId: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const now = new Date();
  const monthlyTrend: { label: string; key: string; submissions: number; completed: number }[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthlyTrend.push({
      key: monthKey(d),
      label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      submissions: 0,
      completed: 0,
    });
  }
  const monthIndex = Object.fromEntries(monthlyTrend.map((m, idx) => [m.key, idx]));

  const byDepartment: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  const reasonCategories: Record<string, number> = {
    'Career / Growth': 0,
    'Personal / Family': 0,
    Compensation: 0,
    Relocation: 0,
    'Health / Burnout': 0,
    Other: 0,
  };

  let retentionDecisions = 0;
  let retentionAccepted = 0;
  let noticeDaysTotal = 0;
  let noticeDaysCount = 0;
  let activePipeline = 0;

  for (const row of rows) {
    const createdKey = monthKey(row.createdAt);
    if (monthIndex[createdKey] !== undefined) {
      monthlyTrend[monthIndex[createdKey]].submissions += 1;
    }

    if (row.workflowStage === 'RESIGNATION_COMPLETED') {
      const exitDate = row.finalExitDate || row.intendedLastWorkingDay;
      const exitKey = monthKey(exitDate);
      if (monthIndex[exitKey] !== undefined) {
        monthlyTrend[monthIndex[exitKey]].completed += 1;
      }
    }

    if (!TERMINAL_RESIGNATION_STAGES.includes(row.workflowStage as typeof TERMINAL_RESIGNATION_STAGES[number])) {
      activePipeline += 1;
    }

    const dept = (row.user?.department || 'Unassigned').trim() || 'Unassigned';
    byDepartment[dept] = (byDepartment[dept] || 0) + 1;
    byStage[row.workflowStage] = (byStage[row.workflowStage] || 0) + 1;

    const category = categorizeResignationReason(row.reason || '');
    reasonCategories[category] = (reasonCategories[category] || 0) + 1;

    if (row.retentionOfferAccepted != null) {
      retentionDecisions += 1;
      if (row.retentionOfferAccepted) retentionAccepted += 1;
    }

    const noticeMs = row.intendedLastWorkingDay.getTime() - row.createdAt.getTime();
    const noticeDays = Math.round(noticeMs / 86400000);
    if (noticeDays > 0 && noticeDays <= 365) {
      noticeDaysTotal += noticeDays;
      noticeDaysCount += 1;
    }
  }

  const recentCompleted = rows
    .filter((r) => r.workflowStage === 'RESIGNATION_COMPLETED')
    .slice(0, 8)
    .map((r) => ({
      id: r.id,
      name: [r.user?.firstName, r.user?.lastName].filter(Boolean).join(' ').trim() || '—',
      employeeId: r.user?.employeeId ?? null,
      department: r.user?.department || '—',
      exitDate: (r.finalExitDate || r.intendedLastWorkingDay).toISOString(),
      reason: r.reason?.slice(0, 100) || '',
    }));

  const upcomingExits = rows
    .filter(
      (r) =>
        !TERMINAL_RESIGNATION_STAGES.includes(r.workflowStage as typeof TERMINAL_RESIGNATION_STAGES[number]),
    )
    .sort((a, b) => a.intendedLastWorkingDay.getTime() - b.intendedLastWorkingDay.getTime())
    .slice(0, 8)
    .map((r) => ({
      id: r.id,
      name: [r.user?.firstName, r.user?.lastName].filter(Boolean).join(' ').trim() || '—',
      employeeId: r.user?.employeeId ?? null,
      department: r.user?.department || '—',
      lastWorkingDay: r.intendedLastWorkingDay.toISOString(),
      stage: r.workflowStage,
    }));

  const thisMonthKey = monthKey(now);
  const submissionsThisMonth = monthlyTrend.find((m) => m.key === thisMonthKey)?.submissions ?? 0;

  return {
    totalRequests: rows.length,
    activePipeline,
    submissionsThisMonth,
    avgNoticePeriodDays: noticeDaysCount ? Math.round(noticeDaysTotal / noticeDaysCount) : null,
    retentionSuccessRate:
      retentionDecisions > 0 ? Math.round((retentionAccepted / retentionDecisions) * 100) : null,
    monthlyTrend,
    byDepartment: Object.entries(byDepartment)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    byStage: Object.entries(byStage)
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count),
    reasonCategories: Object.entries(reasonCategories)
      .map(([name, count]) => ({ name, count }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count),
    recentCompleted,
    upcomingExits,
  };
}

/** POST /api/resignations — submit resignation (multipart handled in route) */
export const submitResignation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { intendedLastWorkingDay, reason, comments } = req.body;
    const lastDay = parseDateYmd(intendedLastWorkingDay);
    if (!lastDay) {
      res.status(400).json({ success: false, message: 'Intended last working day is required' });
      return;
    }
    if (!reason || !String(reason).trim()) {
      res.status(400).json({ success: false, message: 'Resignation reason is required' });
      return;
    }

    const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
    const contractFile = files?.employmentContract?.[0];
    if (!contractFile) {
      res.status(400).json({ success: false, message: 'Employment contract upload is mandatory' });
      return;
    }

    const open = await prisma.resignationRequest.findFirst({
      where: {
        userId,
        status: { in: ['PENDING', 'ON_HOLD'] },
        workflowStage: {
          notIn: [
            'REJECTED_BY_PROJECT_MANAGER',
            'REJECTED_BY_HR',
            'REJECTED_HR_FINAL',
            'RESIGNATION_COMPLETED',
            'WITHDRAWN',
            'FINANCE_CLEARANCE_REJECTED',
          ],
        },
      },
    });
    if (open) {
      res.status(400).json({ success: false, message: 'You already have an active resignation request' });
      return;
    }

    const contractPath = `/uploads/resignation-documents/${contractFile.filename}`;
    const supporting = (files?.supportingDocuments || []).map((f) => ({
      path: `/uploads/resignation-documents/${f.filename}`,
      fileName: f.originalname,
      uploadedAt: new Date().toISOString(),
    }));

    const pmId = await resolveProjectManagerId(userId);

    const resignation = await prisma.resignationRequest.create({
      data: {
        userId,
        intendedLastWorkingDay: lastDay,
        reason: String(reason).trim(),
        comments: comments ? String(comments).trim() : null,
        employmentContractPath: contractPath,
        supportingDocuments: supporting.length ? JSON.stringify(supporting) : null,
        assignedProjectManagerId: pmId,
        workflowStage: 'PENDING_PROJECT_MANAGER',
        status: 'PENDING',
      },
      include: resignationInclude,
    });

    await appendResignationLog({
      resignationId: resignation.id,
      actorId: userId,
      action: 'EMPLOYEE_SUBMIT',
      previousStage: null,
      newStage: 'PENDING_PROJECT_MANAGER',
      comment: comments ? String(comments).trim() : null,
    });

    await notifyResignationWorkflow({
      resignationId: resignation.id,
      event: 'submitted',
      employeeUserId: userId,
      projectManagerId: pmId,
    });

    res.status(201).json({ success: true, message: 'Resignation submitted', data: resignation });
  } catch (e) {
    console.error('submitResignation:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** GET /api/resignations/mine */
export const listMyResignations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const rows = await prisma.resignationRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: resignationInclude,
    });
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('listMyResignations:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** GET /api/resignations/dashboard */
export const getResignationDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const baseWhere: Record<string, unknown> = {};
    if (!isHrRole(role)) {
      baseWhere.userId = userId;
    }

    const [
      pending,
      underReview,
      retentionCases,
      pendingFinance,
      pendingHrFinal,
      completed,
      rejected,
    ] = await Promise.all([
      prisma.resignationRequest.count({
        where: { ...baseWhere, workflowStage: 'PENDING_PROJECT_MANAGER' },
      }),
      prisma.resignationRequest.count({
        where: {
          ...baseWhere,
          workflowStage: {
            in: ['PENDING_HR_REVIEW', 'DISCUSSION_REQUESTED', 'PENDING_GM_RETENTION_REVIEW'],
          },
        },
      }),
      prisma.resignationRequest.count({
        where: {
          ...baseWhere,
          workflowStage: {
            in: ['PENDING_GM_RETENTION_REVIEW', 'PENDING_EMPLOYEE_RETENTION_RESPONSE'],
          },
        },
      }),
      prisma.resignationRequest.count({
        where: { ...baseWhere, workflowStage: 'PENDING_FINANCE_CLEARANCE' },
      }),
      prisma.resignationRequest.count({
        where: {
          ...baseWhere,
          workflowStage: { in: ['PENDING_HR_FINAL_CLEARANCE', 'HR_FINAL_ON_HOLD'] },
        },
      }),
      prisma.resignationRequest.count({
        where: { ...baseWhere, workflowStage: 'RESIGNATION_COMPLETED' },
      }),
      prisma.resignationRequest.count({
        where: {
          ...baseWhere,
          workflowStage: {
            in: [
              'REJECTED_BY_PROJECT_MANAGER',
              'REJECTED_BY_HR',
              'REJECTED_HR_FINAL',
              'FINANCE_CLEARANCE_REJECTED',
            ],
          },
        },
      }),
    ]);

    const payload: Record<string, unknown> = {
      pendingResignations: pending,
      resignationsUnderReview: underReview,
      retentionCases,
      pendingFinanceClearance: pendingFinance,
      pendingHrClearance: pendingHrFinal,
      completedResignations: completed,
      rejectedResignations: rejected,
    };

    if (isHrRole(role)) {
      payload.analytics = await buildResignationAnalytics(baseWhere);
    }

    res.json({
      success: true,
      data: payload,
    });
  } catch (e) {
    console.error('getResignationDashboard:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** GET /api/resignations/:id */
export const getResignationById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const row = await prisma.resignationRequest.findUnique({
      where: { id },
      include: resignationInclude,
    });
    if (!row) {
      res.status(404).json({ success: false, message: 'Resignation not found' });
      return;
    }

    const isOwner = row.userId === userId;
    const isHr = isHrRole(role);
    const isPm = await canActAsProjectManager(row.userId, userId, row.assignedProjectManagerId);
    const isFinance = await isFinanceUser(userId);
    const isGm = await isGeneralManagerUser(userId);

    if (!isOwner && !isHr && !isPm && !isFinance && !isGm) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    res.json({
      success: true,
      data: {
        ...row,
        supportingDocuments: parseAttachmentsJson(row.supportingDocuments),
      },
    });
  } catch (e) {
    console.error('getResignationById:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** GET /api/resignations — HR list all */
export const listAllResignations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    if (!isHrRole(role)) {
      res.status(403).json({ success: false, message: 'HR access required' });
      return;
    }
    const { status, stage, search } = req.query;
    const where: Record<string, unknown> = {};
    if (status && typeof status === 'string') where.status = status;
    if (stage && typeof stage === 'string') where.workflowStage = stage;
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
    const rows = await prisma.resignationRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: resignationInclude,
    });
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('listAllResignations:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
