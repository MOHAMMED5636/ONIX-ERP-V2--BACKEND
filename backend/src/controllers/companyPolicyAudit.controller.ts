import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  getAuditDashboardStats,
  getPerEmployeeCompliance,
  getPerPolicyCompliance,
  materializePolicyAssignments,
  publishCompanyPolicy,
} from '../services/companyPolicyAssignment.service';
import {
  logPolicyAuditFromRequest,
  POLICY_AUDIT_ACTIONS,
  refreshOverdueAssignments,
} from '../services/companyPolicyAudit.service';
import { CompanyPolicyStatus } from '@prisma/client';
import ExcelJS from 'exceljs';

const MANAGE_ROLES = ['ADMIN', 'HR', 'SUPER_ADMIN'];

function requirePolicyManager(role: string | undefined): boolean {
  return !!role && MANAGE_ROLES.includes(role);
}

export const getPolicyAuditDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requirePolicyManager(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    await refreshOverdueAssignments();
    const stats = await getAuditDashboardStats();
    res.json({ success: true, data: { stats } });
  } catch (e) {
    console.error('getPolicyAuditDashboard', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getPolicyAuditByPolicy = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requirePolicyManager(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 25;
    const result = await getPerPolicyCompliance({ search, page, limit });
    res.json({ success: true, data: result });
  } catch (e) {
    console.error('getPolicyAuditByPolicy', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getPolicyAuditByEmployee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requirePolicyManager(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const department = typeof req.query.department === 'string' ? req.query.department : undefined;
    const policyId = typeof req.query.policyId === 'string' ? req.query.policyId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 25;
    const result = await getPerEmployeeCompliance({
      search,
      department,
      policyId,
      status,
      page,
      limit,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    console.error('getPolicyAuditByEmployee', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getPolicyAuditLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requirePolicyManager(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    const policyId = typeof req.query.policyId === 'string' ? req.query.policyId : undefined;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const where: { policyId?: string; userId?: string; action?: string } = {};
    if (policyId) where.policyId = policyId;
    if (userId) where.userId = userId;
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.companyPolicyAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.companyPolicyAuditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        logs: logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
        total,
        page,
        limit,
      },
    });
  } catch (e) {
    console.error('getPolicyAuditLogs', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const exportPolicyAuditReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requirePolicyManager(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    const format = String(req.query.format || 'csv').toLowerCase();
    const report = String(req.query.report || 'employee').toLowerCase();

    if (report === 'policy') {
      const { rows } = await getPerPolicyCompliance({ page: 1, limit: 10000 });
      if (format === 'xlsx') {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Policy Compliance');
        ws.columns = [
          { header: 'Policy', key: 'title', width: 40 },
          { header: 'Status', key: 'status', width: 14 },
          { header: 'Publish Date', key: 'publishDate', width: 14 },
          { header: 'Assigned', key: 'totalAssigned', width: 10 },
          { header: 'Viewed', key: 'totalViewed', width: 10 },
          { header: 'Acknowledged', key: 'totalAcknowledged', width: 14 },
          { header: 'Pending', key: 'totalPending', width: 10 },
          { header: 'Overdue', key: 'totalOverdue', width: 10 },
          { header: 'Compliance %', key: 'compliancePercent', width: 14 },
        ];
        rows.forEach((r) => ws.addRow(r));
        const buffer = await wb.xlsx.writeBuffer();
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader('Content-Disposition', 'attachment; filename="policy-compliance.xlsx"');
        res.send(Buffer.from(buffer as ArrayBuffer));
        return;
      }
      const header =
        'Policy,Status,Publish Date,Assigned,Viewed,Acknowledged,Pending,Overdue,Compliance %\n';
      const body = rows
        .map(
          (r) =>
            `"${r.title.replace(/"/g, '""')}",${r.status},${r.publishDate || ''},${r.totalAssigned},${r.totalViewed},${r.totalAcknowledged},${r.totalPending},${r.totalOverdue},${r.compliancePercent}`,
        )
        .join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="policy-compliance.csv"');
      res.send(header + body);
      return;
    }

    const { rows } = await getPerEmployeeCompliance({ page: 1, limit: 10000 });
    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Employee Compliance');
      ws.columns = [
        { header: 'Employee', key: 'employeeName', width: 28 },
        { header: 'Employee ID', key: 'employeeId', width: 14 },
        { header: 'Department', key: 'department', width: 18 },
        { header: 'Policy', key: 'policyTitle', width: 36 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Assigned', key: 'assignedAt', width: 22 },
        { header: 'Viewed', key: 'viewedAt', width: 22 },
        { header: 'Downloaded', key: 'downloadedAt', width: 22 },
        { header: 'Acknowledged', key: 'acknowledgedAt', width: 22 },
      ];
      rows.forEach((r) => ws.addRow(r));
      const buffer = await wb.xlsx.writeBuffer();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', 'attachment; filename="employee-compliance.xlsx"');
      res.send(Buffer.from(buffer as ArrayBuffer));
      return;
    }

    const header =
      'Employee,Employee ID,Department,Policy,Status,Assigned,Viewed,Downloaded,Acknowledged\n';
    const body = rows
      .map(
        (r) =>
          `"${(r.employeeName || '').replace(/"/g, '""')}","${r.employeeId || ''}","${r.department || ''}","${(r.policyTitle || '').replace(/"/g, '""')}",${r.status},${r.assignedAt},${r.viewedAt || ''},${r.downloadedAt || ''},${r.acknowledgedAt || ''}`,
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="employee-compliance.csv"');
    res.send(header + body);
  } catch (e) {
    console.error('exportPolicyAuditReport', e);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
};

export const publishPolicyHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requirePolicyManager(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    const { id } = req.params;
    await publishCompanyPolicy(id, req.user!.id);
    res.json({ success: true, message: 'Policy published and assignments created' });
  } catch (e) {
    console.error('publishPolicyHandler', e);
    res.status(500).json({ success: false, message: 'Failed to publish policy' });
  }
};

export const archivePolicyHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requirePolicyManager(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    const { id } = req.params;
    const policy = await prisma.companyPolicy.update({
      where: { id },
      data: { status: CompanyPolicyStatus.ARCHIVED, isActive: false },
    });
    await logPolicyAuditFromRequest(req, {
      policyId: id,
      action: POLICY_AUDIT_ACTIONS.POLICY_ARCHIVED,
      policyTitle: policy.title,
    });
    res.json({ success: true, data: { id, status: policy.status } });
  } catch (e) {
    console.error('archivePolicyHandler', e);
    res.status(500).json({ success: false, message: 'Failed to archive policy' });
  }
};

export const backfillPolicyAssignmentsHandler = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!requirePolicyManager(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    const policies = await prisma.companyPolicy.findMany({
      where: { status: CompanyPolicyStatus.PUBLISHED, isActive: true },
      select: { id: true },
    });
    let total = 0;
    for (const p of policies) {
      total += await materializePolicyAssignments(p.id);
    }
    res.json({
      success: true,
      data: { policiesProcessed: policies.length, assignmentsTouched: total },
    });
  } catch (e) {
    console.error('backfillPolicyAssignmentsHandler', e);
    res.status(500).json({ success: false, message: 'Backfill failed' });
  }
};

export const sendPolicyRemindersHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requirePolicyManager(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    const { id } = req.params;
    const pending = await prisma.companyPolicyAssignment.findMany({
      where: {
        policyId: id,
        acknowledgedAt: null,
      },
      select: { id: true, userId: true, reminderCount: true },
    });
    const now = new Date();
    for (const row of pending) {
      await prisma.companyPolicyAssignment.update({
        where: { id: row.id },
        data: {
          reminderCount: row.reminderCount + 1,
          lastReminderAt: now,
        },
      });
      await logPolicyAuditFromRequest(req, {
        policyId: id,
        userId: row.userId,
        action: POLICY_AUDIT_ACTIONS.REMINDER_SENT,
        metadata: { reminderNumber: row.reminderCount + 1 },
      });
    }
    res.json({ success: true, data: { remindersSent: pending.length } });
  } catch (e) {
    console.error('sendPolicyRemindersHandler', e);
    res.status(500).json({ success: false, message: 'Failed to send reminders' });
  }
};

export const recordPolicyViewHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const { id } = req.params;
    const { updateAssignmentOnView } = await import('../services/companyPolicyAssignment.service');
    await updateAssignmentOnView(id, userId);
    const policy = await prisma.companyPolicy.findUnique({ where: { id }, select: { title: true } });
    await logPolicyAuditFromRequest(req, {
      policyId: id,
      userId,
      action: POLICY_AUDIT_ACTIONS.POLICY_VIEWED,
      policyTitle: policy?.title ?? null,
    });
    res.json({ success: true });
  } catch (e) {
    console.error('recordPolicyViewHandler', e);
    res.status(500).json({ success: false, message: 'Failed to record view' });
  }
};

export const getMyPolicyHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const rows = await prisma.companyPolicyAssignment.findMany({
      where: { userId },
      orderBy: { assignedAt: 'desc' },
      include: { policy: { select: { id: true, title: true, publishDate: true } } },
    });
    res.json({
      success: true,
      data: {
        history: rows.map((r) => ({
          policyId: r.policyId,
          policyTitle: r.policy.title,
          status: r.status,
          assignedAt: r.assignedAt.toISOString(),
          viewedAt: r.viewedAt?.toISOString() ?? null,
          downloadedAt: r.downloadedAt?.toISOString() ?? null,
          acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
        })),
      },
    });
  } catch (e) {
    console.error('getMyPolicyHistory', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
