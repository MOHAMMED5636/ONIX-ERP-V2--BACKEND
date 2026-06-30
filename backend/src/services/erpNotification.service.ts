import { getSocketIo } from '../utils/socketIo';

export type ErpNotificationPayload = {
  id: string;
  type: string;
  title: string;
  message: string;
  read?: boolean;
  createdAt: string;
  projectId?: string;
  requestId?: string;
  deletionOtp?: string;
  expiresAt?: string;
  status?: string;
  requesterName?: string;
  periodMonth?: number;
  periodYear?: number;
};

export function emitErpNotification(userId: string, payload: ErpNotificationPayload): void {
  const io = getSocketIo();
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit('erp:notification', {
    ...payload,
    read: payload.read ?? false,
    createdAt: payload.createdAt || new Date().toISOString(),
  });
}

export async function notifyActiveAdmins(payload: ErpNotificationPayload): Promise<number> {
  const prisma = (await import('../config/database')).default;
  const admins = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true },
  });
  for (const admin of admins) {
    emitErpNotification(admin.id, payload);
  }
  return admins.length;
}
