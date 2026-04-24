import { Prisma } from '@prisma/client';
import prisma from '../config/database';

export type ActivityEventType = 'LOGIN' | 'LOGOUT' | 'PAGE_VIEW' | 'ACTION';

export async function logUserActivity(params: {
  userId: string;
  eventType: ActivityEventType;
  module?: string | null;
  action?: string | null;
  metadata?: Record<string, unknown>;
  durationSeconds?: number | null;
}): Promise<void> {
  try {
    await prisma.userActivityLog.create({
      data: {
        userId: params.userId,
        eventType: params.eventType,
        module: params.module != null ? String(params.module).slice(0, 512) : null,
        action: params.action != null ? String(params.action).slice(0, 2000) : null,
        metadata: params.metadata != null ? (params.metadata as Prisma.InputJsonValue) : undefined,
        durationSeconds:
          params.durationSeconds != null &&
          Number.isFinite(params.durationSeconds) &&
          params.durationSeconds >= 0
            ? Math.min(Math.floor(params.durationSeconds), 86400 * 7)
            : undefined,
      },
    });
  } catch (e) {
    console.error('logUserActivity failed', e);
  }
}
