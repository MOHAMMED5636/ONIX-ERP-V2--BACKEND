import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { LeaveType, LeaveStatus } from '@prisma/client';

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
 * Create leave request
 */
export const createLeave = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { type, startDate, endDate, reason, attachments } = req.body;

    if (!type || !startDate || !endDate || !reason) {
      res.status(400).json({
        success: false,
        message: 'Leave type, start date, end date and reason are required',
      });
      return;
    }

    const validTypes = ['ANNUAL', 'SICK', 'UNPAID'];
    if (!validTypes.includes(type)) {
      res.status(400).json({
        success: false,
        message: 'Leave type must be ANNUAL, SICK, or UNPAID',
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

    if (type === 'ANNUAL') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { annualLeaveBalance: true },
      });
      const balance = user?.annualLeaveBalance ?? 25;
      const used = await prisma.leave.aggregate({
        where: {
          userId,
          type: 'ANNUAL',
          status: 'APPROVED',
          startDate: { gte: new Date(new Date().getFullYear(), 0, 1) },
          endDate: { lte: new Date(new Date().getFullYear(), 11, 31) },
        },
        _sum: { days: true },
      });
      const usedDays = used._sum.days ?? 0;
      if (usedDays + days > balance) {
        res.status(400).json({
          success: false,
          message: `Insufficient annual leave balance. Remaining: ${balance - usedDays} days`,
        });
        return;
      }
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

    const { status, type, userId: filterUserId, page = '1', limit = '50' } = req.query;
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
 * Get my leave balance (annual + used this year)
 */
export const getMyBalance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { annualLeaveBalance: true },
    });

    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const yearEnd = new Date(new Date().getFullYear(), 11, 31);

    const [annualUsed, sickUsed] = await Promise.all([
      prisma.leave.aggregate({
        where: {
          userId,
          type: 'ANNUAL',
          status: 'APPROVED',
          startDate: { gte: yearStart },
          endDate: { lte: yearEnd },
        },
        _sum: { days: true },
      }),
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
    ]);

    const totalAnnual = user?.annualLeaveBalance ?? 25;
    const usedAnnual = annualUsed._sum.days ?? 0;
    const usedSick = sickUsed._sum.days ?? 0;

    res.json({
      success: true,
      data: {
        annual: {
          total: totalAnnual,
          used: usedAnnual,
          remaining: Math.max(0, totalAnnual - usedAnnual),
        },
        sick: {
          used: usedSick,
          note: 'Sick leave usage tracked; policy may vary',
        },
        unpaid: { note: 'Unpaid leave has no balance limit' },
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

    const updated = await prisma.leave.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: userId,
        approvedAt: new Date(),
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
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
