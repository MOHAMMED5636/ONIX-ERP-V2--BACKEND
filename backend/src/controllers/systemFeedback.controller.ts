import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { config } from '../config/env';
import { Prisma, SystemFeedbackStatus } from '@prisma/client';

const feedbackInclude = {
  submitter: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      photo: true,
    },
  },
  reviewedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
} as const;

function publicScreenshotUrl(filename: string | null | undefined): string | null {
  if (!filename) return null;
  return `${config.apiPublicUrl}/uploads/feedback/${filename}`;
}

/**
 * POST /api/system-feedback (multipart: message, optional category, pageUrl, screenshot file field "screenshot")
 */
export const submitSystemFeedback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const messageRaw = req.body?.message ?? req.body?.body;
    const message = typeof messageRaw === 'string' ? messageRaw.trim() : '';
    if (!message || message.length < 3) {
      res.status(400).json({
        success: false,
        message: 'message is required (at least 3 characters)',
      });
      return;
    }
    if (message.length > 20000) {
      res.status(400).json({ success: false, message: 'message is too long (max 20000 characters)' });
      return;
    }

    const categoryRaw = req.body?.category;
    const category =
      typeof categoryRaw === 'string' && categoryRaw.trim() ? categoryRaw.trim().slice(0, 80) : null;
    const pageUrlRaw = req.body?.pageUrl;
    const pageUrl =
      typeof pageUrlRaw === 'string' && pageUrlRaw.trim() ? pageUrlRaw.trim().slice(0, 2000) : null;

    const file = req.file as Express.Multer.File | undefined;
    const screenshotFilename = file?.filename ?? null;

    const row = await prisma.systemFeedback.create({
      data: {
        submitterId: userId,
        message,
        category,
        pageUrl,
        screenshotFilename,
      },
      include: feedbackInclude,
    });

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully.',
      data: formatFeedbackRow(row),
    });
  } catch (error) {
    console.error('submitSystemFeedback error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit feedback' });
  }
};

function formatFeedbackRow(row: {
  id: string;
  message: string;
  category: string | null;
  pageUrl: string | null;
  screenshotFilename: string | null;
  status: SystemFeedbackStatus;
  adminNotes: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  submitter: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    photo: string | null;
  };
  reviewedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}) {
  return {
    id: row.id,
    message: row.message,
    category: row.category,
    pageUrl: row.pageUrl,
    screenshotUrl: publicScreenshotUrl(row.screenshotFilename),
    screenshotFilename: row.screenshotFilename,
    status: row.status,
    adminNotes: row.adminNotes,
    reviewedAt: row.reviewedAt,
    reviewedBy: row.reviewedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    submitter: row.submitter,
  };
}

/**
 * GET /api/system-feedback — ADMIN only
 */
export const listSystemFeedback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.SystemFeedbackWhereInput = {};
    if (status && ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'].includes(status)) {
      where.status = status as SystemFeedbackStatus;
    }

    const [total, rows] = await Promise.all([
      prisma.systemFeedback.count({ where }),
      prisma.systemFeedback.findMany({
        where,
        include: feedbackInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    res.json({
      success: true,
      data: rows.map(formatFeedbackRow),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    console.error('listSystemFeedback error:', error);
    res.status(500).json({ success: false, message: 'Failed to list feedback' });
  }
};

/**
 * GET /api/system-feedback/:id — ADMIN only
 */
export const getSystemFeedback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const row = await prisma.systemFeedback.findUnique({
      where: { id },
      include: feedbackInclude,
    });
    if (!row) {
      res.status(404).json({ success: false, message: 'Feedback not found' });
      return;
    }
    res.json({ success: true, data: formatFeedbackRow(row) });
  } catch (error) {
    console.error('getSystemFeedback error:', error);
    res.status(500).json({ success: false, message: 'Failed to load feedback' });
  }
};

/**
 * PATCH /api/system-feedback/:id — ADMIN only (status, adminNotes)
 */
export const updateSystemFeedback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = req.user?.id;
    const statusRaw = req.body?.status;
    const notesRaw = req.body?.adminNotes;

    const existing = await prisma.systemFeedback.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Feedback not found' });
      return;
    }

    const data: Prisma.SystemFeedbackUpdateInput = {};

    if (typeof statusRaw === 'string' && statusRaw.trim()) {
      const s = statusRaw.trim().toUpperCase();
      if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'].includes(s)) {
        res.status(400).json({ success: false, message: 'Invalid status' });
        return;
      }
      data.status = s as SystemFeedbackStatus;
      data.reviewedAt = new Date();
      if (adminId) {
        data.reviewedBy = { connect: { id: adminId } };
      }
    }

    if (typeof notesRaw === 'string') {
      data.adminNotes = notesRaw.trim() ? notesRaw.trim().slice(0, 10000) : null;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({
        success: false,
        message: 'Provide status and/or adminNotes to update',
      });
      return;
    }

    const row = await prisma.systemFeedback.update({
      where: { id },
      data,
      include: feedbackInclude,
    });

    res.json({ success: true, message: 'Feedback updated', data: formatFeedbackRow(row) });
  } catch (error) {
    console.error('updateSystemFeedback error:', error);
    res.status(500).json({ success: false, message: 'Failed to update feedback' });
  }
};
