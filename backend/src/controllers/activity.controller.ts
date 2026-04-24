import { Prisma } from '@prisma/client';
import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

function isAdminOrHr(role: string | undefined): boolean {
  return role === 'ADMIN' || role === 'HR';
}

const MAX_MODULE = 512;
const MAX_ACTION = 2000;

/**
 * Admin/HR: list activity events in a time range (for Employee Activity Calendar).
 */
export const listActivityEvents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isAdminOrHr(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Only admin or HR can view employee activity' });
      return;
    }

    const fromRaw = req.query.from as string | undefined;
    const toRaw = req.query.to as string | undefined;
    const userId = typeof req.query.userId === 'string' && req.query.userId.trim() ? req.query.userId.trim() : undefined;

    if (!fromRaw || !toRaw) {
      res.status(400).json({ success: false, message: 'Query parameters from and to (ISO datetimes) are required' });
      return;
    }

    const fromDate = new Date(fromRaw);
    const toDate = new Date(toRaw);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      res.status(400).json({ success: false, message: 'Invalid from or to date' });
      return;
    }

    const events = await prisma.userActivityLog.findMany({
      where: {
        createdAt: { gte: fromDate, lte: toDate },
        ...(userId ? { userId } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 3000,
    });

    res.json({ success: true, data: events });
  } catch (error) {
    console.error('listActivityEvents error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Authenticated users: record navigation / explicit actions (feeds the activity calendar).
 */
export const trackActivity = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const body = req.body as Record<string, unknown> | undefined;
    const eventTypeRaw = typeof body?.eventType === 'string' ? body.eventType : 'PAGE_VIEW';
    if (eventTypeRaw !== 'PAGE_VIEW' && eventTypeRaw !== 'ACTION') {
      res.status(400).json({ success: false, message: 'eventType must be PAGE_VIEW or ACTION' });
      return;
    }

    const moduleStr =
      typeof body?.module === 'string' && body.module.trim()
        ? body.module.trim().slice(0, MAX_MODULE)
        : null;
    const actionStr =
      typeof body?.action === 'string' && body.action.trim()
        ? body.action.trim().slice(0, MAX_ACTION)
        : null;

    let durationSeconds: number | undefined;
    if (typeof body?.durationSeconds === 'number' && Number.isFinite(body.durationSeconds) && body.durationSeconds >= 0) {
      durationSeconds = Math.min(Math.floor(body.durationSeconds), 86400 * 7);
    }

    let metadata: Record<string, unknown> | undefined;
    if (body?.metadata != null && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
      metadata = body.metadata as Record<string, unknown>;
    }

    await prisma.userActivityLog.create({
      data: {
        userId,
        eventType: eventTypeRaw,
        module: moduleStr,
        action: actionStr,
        metadata: metadata != null ? (metadata as Prisma.InputJsonValue) : undefined,
        durationSeconds,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('trackActivity error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
