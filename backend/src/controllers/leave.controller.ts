import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { LeaveType, LeaveStatus } from '@prisma/client';
import {
  VALID_LEAVE_TYPES,
  getActivePolicies,
  validateAnnualLeave,
  validateSickLeave,
  validateBereavementLeave,
  validatePaternityLeave,
  validateMaternityLeave,
  getAnnualBalance,
} from '../services/leavePolicy.service';

const LEAVE_DOCUMENTS_DIR = path.join(process.cwd(), 'uploads', 'leave-documents');

function parseAttachments(attachments: string | unknown): { path: string; fileName: string; type?: string; uploadedAt?: string }[] {
  if (!attachments) return [];
  try {
    const parsed = typeof attachments === 'string' ? JSON.parse(attachments) : attachments;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getWorkingDays(start: Date, end: Date): number {
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/**
 * Create leave request (with policy validation and reporting fields)
 */
export const createLeave = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { type, startDate, endDate, reason, attachments, relationOrContext, reportedAbsenceAt } = req.body;

    if (!type || !startDate || !endDate || !reason) {
      res.status(400).json({
        success: false,
        message: 'Leave type, start date, end date and reason are required',
      });
      return;
    }

    if (!VALID_LEAVE_TYPES.includes(type as LeaveType)) {
      res.status(400).json({
        success: false,
        message: `Leave type must be one of: ${VALID_LEAVE_TYPES.join(', ')}`,
      });
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      res.status(400).json({
        success: false,
        message: 'Invalid date range',
      });
      return;
    }

    const days = getWorkingDays(start, end);
    if (days < 1) {
      res.status(400).json({
        success: false,
        message: 'Leave must span at least one working day',
      });
      return;
    }

    switch (type) {
      case 'ANNUAL': {
        const v = await validateAnnualLeave(userId, start, end, days);
        if (!v.valid) {
          res.status(400).json({ success: false, message: v.message });
          return;
        }
        break;
      }
      case 'SICK': {
        const v = await validateSickLeave(userId, start, end, days);
        if (!v.valid) {
          res.status(400).json({ success: false, message: v.message });
          return;
        }
        break;
      }
      case 'BEREAVEMENT': {
        const v = await validateBereavementLeave(days, relationOrContext);
        if (!v.valid) {
          res.status(400).json({ success: false, message: v.message });
          return;
        }
        break;
      }
      case 'PATERNITY': {
        const v = await validatePaternityLeave(days);
        if (!v.valid) {
          res.status(400).json({ success: false, message: v.message });
          return;
        }
        break;
      }
      case 'MATERNITY': {
        const v = await validateMaternityLeave(days, req.body.isExtraUnpaidWithProof);
        if (!v.valid) {
          res.status(400).json({ success: false, message: v.message });
          return;
        }
        break;
      }
      default:
        break;
    }

    const leave = await prisma.leave.create({
      data: {
        userId,
        type: type as LeaveType,
        status: 'PENDING',
        startDate: start,
        endDate: end,
        days,
        reason: String(reason).trim(),
        attachments: attachments ? JSON.stringify(attachments) : null,
        relationOrContext: relationOrContext ? String(relationOrContext).trim() : null,
        reportedAbsenceAt: reportedAbsenceAt ? new Date(reportedAbsenceAt) : null,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Leave request submitted successfully',
      data: leave,
    });
  } catch (error) {
    console.error('Create leave error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * List leave requests (own for employee; admin/HR can see all or filter by userId)
 */
export const listLeaves = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { status, type, userId: filterUserId, page = '1', limit = '50', dateFrom, dateTo, search } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 100);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    const canSeeAll = ['ADMIN', 'HR', 'PROJECT_MANAGER'].includes(role || '');
    if (canSeeAll && filterUserId) {
      where.userId = filterUserId;
    } else if (!canSeeAll) {
      where.userId = userId;
    }

    if (status && status !== 'all') {
      where.status = status as LeaveStatus;
    }
    if (type && type !== 'all') {
      where.type = type as LeaveType;
    }
    if (dateFrom) {
      const from = new Date(dateFrom as string);
      if (!isNaN(from.getTime())) where.startDate = { gte: from };
    }
    if (dateTo) {
      const to = new Date(dateTo as string);
      if (!isNaN(to.getTime())) where.endDate = { lte: to };
    }
    if (canSeeAll && search && String(search).trim()) {
      const term = String(search).trim();
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { firstName: { contains: term, mode: 'insensitive' } },
            { lastName: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);
      if (userIds.length) where.userId = { in: userIds };
      else where.userId = 'no-match';
    }

    const [leaves, total] = await Promise.all([
      prisma.leave.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          rejectedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.leave.count({ where }),
    ]);

    res.json({
      success: true,
      data: leaves,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('List leaves error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get my leave balance (policy-based annual + sick + others)
 */
export const getMyBalance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const yearEnd = new Date(new Date().getFullYear(), 11, 31);

    const [annualBalance, sickUsed, emergencyUsed] = await Promise.all([
      getAnnualBalance(userId),
      prisma.leave.aggregate({
        where: {
          userId,
          type: 'SICK',
          status: 'APPROVED',
          startDate: { gte: yearStart },
          endDate: { lte: yearEnd },
        },
        _sum: { days: true },
      }),
      prisma.leave.aggregate({
        where: {
          userId,
          type: 'EMERGENCY',
          status: 'APPROVED',
          startDate: { gte: yearStart },
          endDate: { lte: yearEnd },
        },
        _sum: { days: true },
      }),
    ]);

    const usedSick = sickUsed._sum.days ?? 0;
    const usedEmergency = emergencyUsed._sum.days ?? 0;

    res.json({
      success: true,
      data: {
        annual: {
          total: annualBalance.total,
          used: annualBalance.used,
          remaining: annualBalance.remaining,
          fromCarryForward: annualBalance.fromCarryForward,
          display: `${annualBalance.used}/${annualBalance.total} days`,
        },
        sick: {
          total: 90,
          used: usedSick,
          remaining: Math.max(0, 90 - usedSick),
          display: `${usedSick}/90 days`,
          note: '15 days full pay, 30 half pay, 45 unpaid. Upload medical certificate within 3 working days.',
        },
        unpaid: { note: 'Unpaid leave has no balance limit' },
        emergency: {
          used: usedEmergency,
          note: 'For urgent family or personal circumstances. Usage tracked.',
        },
        bereavement: { note: '5 days spouse, 3 days first-degree relative. Documentation required.' },
        paternity: { note: '5 paid days within 6 months of childbirth' },
        maternity: { note: '105 days (45+15+45); 45 extra unpaid with proof if needed. Documentation required.' },
      },
    });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get single leave by id (own or admin)
 */
export const getLeaveById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const leave = await prisma.leave.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        rejectedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!leave) {
      res.status(404).json({ success: false, message: 'Leave request not found' });
      return;
    }

    const canSee = leave.userId === userId || ['ADMIN', 'HR', 'PROJECT_MANAGER'].includes(role || '');
    if (!canSee) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    res.json({ success: true, data: leave });
  } catch (error) {
    console.error('Get leave error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Approve leave (admin/HR/manager)
 */
export const approveLeave = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    if (!['ADMIN', 'HR', 'PROJECT_MANAGER'].includes(role || '')) {
      res.status(403).json({ success: false, message: 'Only admin, HR or manager can approve leave' });
      return;
    }

    const leave = await prisma.leave.findUnique({ where: { id } });
    if (!leave) {
      res.status(404).json({ success: false, message: 'Leave request not found' });
      return;
    }
    if (leave.status !== 'PENDING') {
      res.status(400).json({ success: false, message: 'Leave is not pending' });
      return;
    }

    const docsRequired = ['SICK', 'MATERNITY', 'BEREAVEMENT'].includes(leave.type);
    const attachments = parseAttachments(leave.attachments);
    if (docsRequired && attachments.length === 0) {
      res.status(400).json({
        success: false,
        message: leave.type === 'SICK'
          ? 'Medical certificate must be uploaded before approval. Please upload via Leave documents.'
          : 'Supporting documentation must be uploaded before approval.',
      });
      return;
    }

    const updated = await prisma.leave.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: userId,
        approvedAt: new Date(),
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
        ...(docsRequired && attachments.length > 0 ? { documentationReceivedAt: new Date() } : {}),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.json({
      success: true,
      message: 'Leave request approved',
      data: updated,
    });
  } catch (error) {
    console.error('Approve leave error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Reject leave (admin/HR/manager)
 */
export const rejectLeave = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    const { reason } = req.body || {};
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    if (!['ADMIN', 'HR', 'PROJECT_MANAGER'].includes(role || '')) {
      res.status(403).json({ success: false, message: 'Only admin, HR or manager can reject leave' });
      return;
    }

    const leave = await prisma.leave.findUnique({ where: { id } });
    if (!leave) {
      res.status(404).json({ success: false, message: 'Leave request not found' });
      return;
    }
    if (leave.status !== 'PENDING') {
      res.status(400).json({ success: false, message: 'Leave is not pending' });
      return;
    }

    const updated = await prisma.leave.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectedById: userId,
        rejectedAt: new Date(),
        rejectionReason: reason ? String(reason).trim() : null,
        approvedById: null,
        approvedAt: null,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        rejectedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.json({
      success: true,
      message: 'Leave request rejected',
      data: updated,
    });
  } catch (error) {
    console.error('Reject leave error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get leave policies (for UI and compliance)
 */
export const getLeavePolicies = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const policies = await getActivePolicies();
    res.json({
      success: true,
      data: policies,
    });
  } catch (error) {
    console.error('Get leave policies error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Reschedule leave (admin/HR/manager). Max 3 months from original period.
 */
export const rescheduleLeave = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    const { startDate: newStart, endDate: newEnd } = req.body || {};
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    if (!['ADMIN', 'HR', 'PROJECT_MANAGER'].includes(role || '')) {
      res.status(403).json({ success: false, message: 'Only admin, HR or manager can reschedule leave' });
      return;
    }

    const leave = await prisma.leave.findUnique({ where: { id } });
    if (!leave) {
      res.status(404).json({ success: false, message: 'Leave request not found' });
      return;
    }
    if (leave.status !== 'PENDING') {
      res.status(400).json({ success: false, message: 'Only pending leave can be rescheduled' });
      return;
    }

    if (!newStart || !newEnd) {
      res.status(400).json({ success: false, message: 'startDate and endDate are required' });
      return;
    }

    const start = new Date(newStart);
    const end = new Date(newEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      res.status(400).json({ success: false, message: 'Invalid date range' });
      return;
    }

    const maxRescheduleMonths = 3;
    const originalEnd = new Date(leave.endDate);
    const latestAllowed = new Date(originalEnd);
    latestAllowed.setMonth(latestAllowed.getMonth() + maxRescheduleMonths);
    if (end > latestAllowed) {
      res.status(400).json({
        success: false,
        message: `Reschedule period cannot exceed ${maxRescheduleMonths} months from original end date`,
      });
      return;
    }

    const days = getWorkingDays(start, end);
    if (days < 1) {
      res.status(400).json({ success: false, message: 'Rescheduled leave must span at least one working day' });
      return;
    }

    const updated = await prisma.leave.update({
      where: { id },
      data: {
        startDate: start,
        endDate: end,
        rescheduledStartDate: start,
        rescheduledEndDate: end,
        rescheduledAt: new Date(),
        days,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    res.json({
      success: true,
      message: 'Leave rescheduled successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Reschedule leave error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Upload documents (medical certificate, proof) to a leave request. Secure storage under uploads/leave-documents.
 */
export const uploadLeaveDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    const files = req.files as Express.Multer.File[] | undefined;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const leave = await prisma.leave.findUnique({ where: { id } });
    if (!leave) {
      res.status(404).json({ success: false, message: 'Leave request not found' });
      return;
    }
    if (leave.userId !== userId && !['ADMIN', 'HR', 'PROJECT_MANAGER'].includes(role || '')) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    if (leave.status !== 'PENDING') {
      res.status(400).json({ success: false, message: 'Cannot add documents after leave is decided' });
      return;
    }

    const existing = parseAttachments(leave.attachments);
    const newEntries = (files || []).map((f) => ({
      path: `/uploads/leave-documents/${f.filename}`,
      fileName: f.originalname || f.filename,
      type: leave.type === 'SICK' ? 'MEDICAL_CERTIFICATE' : 'SUPPORTING_DOCUMENT',
      uploadedAt: new Date().toISOString(),
    }));
    const combined = [...existing, ...newEntries];
    await prisma.leave.update({
      where: { id },
      data: { attachments: JSON.stringify(combined) },
    });

    res.status(201).json({
      success: true,
      message: 'Documents uploaded successfully',
      data: { documents: combined },
    });
  } catch (error) {
    console.error('Upload leave documents error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * List documents for a leave (requester or HR/Admin).
 */
export const getLeaveDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const leave = await prisma.leave.findUnique({
      where: { id },
      select: { userId: true, attachments: true, type: true },
    });
    if (!leave) {
      res.status(404).json({ success: false, message: 'Leave request not found' });
      return;
    }
    if (leave.userId !== userId && !['ADMIN', 'HR', 'PROJECT_MANAGER'].includes(role || '')) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    const documents = parseAttachments(leave.attachments);
    res.json({ success: true, data: { documents } });
  } catch (error) {
    console.error('Get leave documents error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Download a leave document (secure; only requester or HR/Admin). Filename is the stored filename on disk.
 */
export const downloadLeaveDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id, filename } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const leave = await prisma.leave.findUnique({
      where: { id },
      select: { userId: true, attachments: true },
    });
    if (!leave) {
      res.status(404).json({ success: false, message: 'Leave request not found' });
      return;
    }
    if (leave.userId !== userId && !['ADMIN', 'HR', 'PROJECT_MANAGER'].includes(role || '')) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    const documents = parseAttachments(leave.attachments);
    const doc = documents.find((d) => d.path.includes(filename) || d.fileName === filename);
    if (!doc) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }
    const relativePath = doc.path.replace(/^\/uploads\/leave-documents\//, '').replace(/^uploads\/leave-documents\//, '');
    const filePath = path.join(LEAVE_DOCUMENTS_DIR, path.basename(relativePath));
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: 'File not found on server' });
      return;
    }
    res.download(filePath, doc.fileName || path.basename(filePath));
  } catch (error) {
    console.error('Download leave document error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * HR/Admin: list all leaves with documents (certificates) for view/download.
 */
export const listCertificatesForHR = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    if (!['ADMIN', 'HR', 'PROJECT_MANAGER'].includes(role || '')) {
      res.status(403).json({ success: false, message: 'Only HR or Admin can list all certificates' });
      return;
    }

    const leaves = await prisma.leave.findMany({
      where: { attachments: { not: null } },
      select: {
        id: true,
        type: true,
        status: true,
        startDate: true,
        endDate: true,
        days: true,
        attachments: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const withDocs = leaves.map((l) => ({
      ...l,
      documents: parseAttachments(l.attachments),
    }));
    res.json({ success: true, data: withDocs });
  } catch (error) {
    console.error('List certificates error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Leave reports summary for HR/management (by year, type, status).
 */
export const getLeaveReportsSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    if (!['ADMIN', 'HR', 'PROJECT_MANAGER'].includes(role || '')) {
      res.status(403).json({ success: false, message: 'Only HR or Admin can view reports' });
      return;
    }

    const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);

    const [byType, byStatus, totalRequests, pendingWithoutDocs] = await Promise.all([
      prisma.leave.groupBy({
        by: ['type'],
        where: {
          startDate: { gte: yearStart },
          endDate: { lte: yearEnd },
        },
        _count: { id: true },
        _sum: { days: true },
      }),
      prisma.leave.groupBy({
        by: ['status'],
        where: {
          startDate: { gte: yearStart },
          endDate: { lte: yearEnd },
        },
        _count: { id: true },
      }),
      prisma.leave.count({
        where: {
          startDate: { gte: yearStart },
          endDate: { lte: yearEnd },
        },
      }),
      prisma.leave.findMany({
        where: {
          status: 'PENDING',
          type: { in: ['SICK', 'MATERNITY', 'BEREAVEMENT'] },
          OR: [{ attachments: null }, { attachments: '' }, { attachments: '[]' }],
        },
        select: { id: true, type: true, user: { select: { firstName: true, lastName: true, email: true } } },
      }),
    ]);

    res.json({
      success: true,
      data: {
        year,
        byType,
        byStatus,
        totalRequests,
        pendingWithoutDocs: pendingWithoutDocs.length,
        pendingRequiringDocs: pendingWithoutDocs,
      },
    });
  } catch (error) {
    console.error('Leave reports error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * HR/Admin dashboard: total employees, leave statistics, per-employee balance summary.
 */
export const getHRDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    if (!['ADMIN', 'HR', 'PROJECT_MANAGER'].includes(role || '')) {
      res.status(403).json({ success: false, message: 'Only HR or Admin can access dashboard' });
      return;
    }

    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);

    const [
      totalEmployees,
      approvedLeavesByType,
      pendingCount,
      approvedCount,
      rejectedCount,
      usersPage,
    ] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.leave.groupBy({
        by: ['type'],
        where: {
          status: 'APPROVED',
          startDate: { gte: yearStart },
          endDate: { lte: yearEnd },
        },
        _sum: { days: true },
        _count: { id: true },
      }),
      prisma.leave.count({ where: { status: 'PENDING' } }),
      prisma.leave.count({ where: { status: 'APPROVED' } }),
      prisma.leave.count({ where: { status: 'REJECTED' } }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, firstName: true, lastName: true, email: true },
        take: 100,
        orderBy: { firstName: 'asc' },
      }),
    ]);

    const typeMap: Record<string, { days: number; count: number }> = {};
    approvedLeavesByType.forEach((t) => {
      typeMap[t.type] = { days: t._sum.days ?? 0, count: t._count.id };
    });

    const stats = {
      totalAnnualTaken: typeMap['ANNUAL']?.days ?? 0,
      totalSickTaken: typeMap['SICK']?.days ?? 0,
      sickBreakdown: '15 full pay, 30 half pay, 45 unpaid (max 90 days/year)',
      totalEmergencyTaken: typeMap['EMERGENCY']?.days ?? 0,
      totalBereavementTaken: typeMap['BEREAVEMENT']?.days ?? 0,
      totalPaternityTaken: typeMap['PATERNITY']?.days ?? 0,
      totalMaternityTaken: typeMap['MATERNITY']?.days ?? 0,
      totalUnpaidTaken: typeMap['UNPAID']?.days ?? 0,
      pendingCount,
      approvedCount,
      rejectedCount,
    };

    const employeeBalances: { user: { id: string; firstName: string; lastName: string; email: string }; annual: { used: number; remaining: number; total: number }; sick: { used: number; remaining: number; total: number }; emergencyUsed: number }[] = [];
    for (const u of usersPage.slice(0, 50)) {
      try {
        const [annual, sickUsed, emergencyUsed] = await Promise.all([
          getAnnualBalance(u.id),
          prisma.leave.aggregate({
            where: {
              userId: u.id,
              type: 'SICK',
              status: 'APPROVED',
              startDate: { gte: yearStart },
              endDate: { lte: yearEnd },
            },
            _sum: { days: true },
          }),
          prisma.leave.aggregate({
            where: {
              userId: u.id,
              type: 'EMERGENCY',
              status: 'APPROVED',
              startDate: { gte: yearStart },
              endDate: { lte: yearEnd },
            },
            _sum: { days: true },
          }),
        ]);
        employeeBalances.push({
          user: { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email },
          annual: { used: annual.used, remaining: annual.remaining, total: annual.total },
          sick: { used: sickUsed._sum.days ?? 0, remaining: Math.max(0, 90 - (sickUsed._sum.days ?? 0)), total: 90 },
          emergencyUsed: emergencyUsed._sum.days ?? 0,
        });
      } catch (_) {
        // skip user if balance calc fails
      }
    }

    res.json({
      success: true,
      data: {
        totalEmployees,
        year,
        stats,
        employeeBalances,
      },
    });
  } catch (error) {
    console.error('HR dashboard error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * HR/Admin: paginated employee leave balances (for "per employee" table).
 */
export const getEmployeeBalances = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    if (!['ADMIN', 'HR', 'PROJECT_MANAGER'].includes(role || '')) {
      res.status(403).json({ success: false, message: 'Only HR or Admin can access' });
      return;
    }

    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));
    const skip = (page - 1) * limit;
    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, firstName: true, lastName: true, email: true },
        skip,
        take: limit,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      prisma.user.count({ where: { isActive: true } }),
    ]);

    const employeeBalances: { user: { id: string; firstName: string; lastName: string; email: string }; annual: { used: number; remaining: number; total: number }; sick: { used: number; remaining: number; total: number }; emergencyUsed: number }[] = [];
    for (const u of users) {
      try {
        const [annual, sickUsed, emergencyUsed] = await Promise.all([
          getAnnualBalance(u.id),
          prisma.leave.aggregate({
            where: { userId: u.id, type: 'SICK', status: 'APPROVED', startDate: { gte: yearStart }, endDate: { lte: yearEnd } },
            _sum: { days: true },
          }),
          prisma.leave.aggregate({
            where: { userId: u.id, type: 'EMERGENCY', status: 'APPROVED', startDate: { gte: yearStart }, endDate: { lte: yearEnd } },
            _sum: { days: true },
          }),
        ]);
        employeeBalances.push({
          user: { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email },
          annual: { used: annual.used, remaining: annual.remaining, total: annual.total },
          sick: { used: sickUsed._sum.days ?? 0, remaining: Math.max(0, 90 - (sickUsed._sum.days ?? 0)), total: 90 },
          emergencyUsed: emergencyUsed._sum.days ?? 0,
        });
      } catch (_) {}
    }

    res.json({
      success: true,
      data: employeeBalances,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Employee balances error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * HR/Admin: downloadable leave report (employee summary, history, balance, document status). UAE compliant.
 */
export const getLeaveReportExport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    if (!['ADMIN', 'HR', 'PROJECT_MANAGER'].includes(role || '')) {
      res.status(403).json({ success: false, message: 'Only HR or Admin can export report' });
      return;
    }

    const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);

    const [leaves, users] = await Promise.all([
      prisma.leave.findMany({
        where: { startDate: { gte: yearStart }, endDate: { lte: yearEnd } },
        orderBy: [{ userId: 'asc' }, { startDate: 'asc' }],
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
    ]);

    const leaveHistory = leaves.map((l) => ({
      employeeId: l.userId,
      employeeName: l.user ? `${l.user.firstName} ${l.user.lastName}` : '',
      email: l.user?.email,
      type: l.type,
      status: l.status,
      startDate: l.startDate,
      endDate: l.endDate,
      days: l.days,
      hasDocument: !!(l.attachments && l.attachments !== '' && l.attachments !== '[]'),
      submittedAt: l.createdAt,
    }));

    const balanceRows: { employeeId: string; employeeName: string; email: string; annualUsed: number; annualRemaining: number; annualTotal: number; sickUsed: number; sickRemaining: number; emergencyUsed: number }[] = [];
    for (const u of users.slice(0, 200)) {
      try {
        const [annual, sickUsed, emergencyUsed] = await Promise.all([
          getAnnualBalance(u.id),
          prisma.leave.aggregate({
            where: { userId: u.id, type: 'SICK', status: 'APPROVED', startDate: { gte: yearStart }, endDate: { lte: yearEnd } },
            _sum: { days: true },
          }),
          prisma.leave.aggregate({
            where: { userId: u.id, type: 'EMERGENCY', status: 'APPROVED', startDate: { gte: yearStart }, endDate: { lte: yearEnd } },
            _sum: { days: true },
          }),
        ]);
        balanceRows.push({
          employeeId: u.id,
          employeeName: `${u.firstName} ${u.lastName}`,
          email: u.email,
          annualUsed: annual.used,
          annualRemaining: annual.remaining,
          annualTotal: annual.total,
          sickUsed: sickUsed._sum.days ?? 0,
          sickRemaining: Math.max(0, 90 - (sickUsed._sum.days ?? 0)),
          emergencyUsed: emergencyUsed._sum.days ?? 0,
        });
      } catch (_) {}
    }

    const sickDocumentStatus = leaves
      .filter((l) => l.type === 'SICK')
      .map((l) => ({
        leaveId: l.id,
        employeeName: l.user ? `${l.user.firstName} ${l.user.lastName}` : '',
        status: l.status,
        hasCertificate: !!(l.attachments && l.attachments !== '' && l.attachments !== '[]'),
        submittedAt: l.createdAt,
      }));

    const format = (req.query.format as string) || 'json';
    if (format === 'csv') {
      const header = 'Employee Name,Email,Annual Used,Annual Remaining,Annual Total,Sick Used,Sick Remaining,Emergency Used';
      const rows = balanceRows.map((r) => `"${r.employeeName}","${r.email}",${r.annualUsed},${r.annualRemaining},${r.annualTotal},${r.sickUsed},${r.sickRemaining},${r.emergencyUsed}`);
      const csv = [header, ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="leave-balance-report-${year}.csv"`);
      res.send(csv);
      return;
    }

    res.json({
      success: true,
      data: {
        year,
        generatedAt: new Date().toISOString(),
        summary: { totalEmployees: users.length, totalLeaveRequests: leaves.length },
        employeeLeaveBalance: balanceRows,
        leaveHistory,
        sickLeaveDocumentStatus: sickDocumentStatus,
      },
    });
  } catch (error) {
    console.error('Leave report export error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
