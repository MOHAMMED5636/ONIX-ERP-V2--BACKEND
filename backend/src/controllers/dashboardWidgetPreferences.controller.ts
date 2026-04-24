import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

function requireUser(req: AuthRequest, res: Response): { id: string } | null {
  if (!req.user?.id) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return null;
  }
  return { id: req.user.id };
}

export const getMyDashboardWidgetPreferences = async (req: AuthRequest, res: Response): Promise<void> => {
  const u = requireUser(req, res);
  if (!u) return;

  const pref = await prisma.dashboardWidgetPreference.findUnique({
    where: { userId: u.id },
    select: { config: true, updatedAt: true },
  });

  res.json({
    success: true,
    data: pref ? { config: pref.config, updatedAt: pref.updatedAt } : null,
  });
};

export const upsertMyDashboardWidgetPreferences = async (req: AuthRequest, res: Response): Promise<void> => {
  const u = requireUser(req, res);
  if (!u) return;

  const { config } = req.body || {};
  if (!config || typeof config !== 'object') {
    res.status(400).json({ success: false, message: 'Invalid config payload' });
    return;
  }

  const saved = await prisma.dashboardWidgetPreference.upsert({
    where: { userId: u.id },
    create: { userId: u.id, config },
    update: { config },
    select: { config: true, updatedAt: true },
  });

  res.json({ success: true, data: saved });
};

export const resetMyDashboardWidgetPreferences = async (req: AuthRequest, res: Response): Promise<void> => {
  const u = requireUser(req, res);
  if (!u) return;

  await prisma.dashboardWidgetPreference.deleteMany({
    where: { userId: u.id },
  });

  res.json({ success: true });
};

