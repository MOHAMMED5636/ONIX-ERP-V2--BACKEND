import prisma from '../config/database';

export function getDmRoomKey(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `dm:${x}:${y}`;
}

export function normalizeRoomKey(scope: string, userId: string, peerId?: string): string | undefined {
  if (scope === 'general') return 'general';
  if (scope === 'dm' && peerId) return getDmRoomKey(userId, peerId);
  return undefined;
}

export function parseDmRoomKey(roomKey: string): { a: string; b: string } | null {
  if (!roomKey?.startsWith('dm:')) return null;
  const parts = roomKey.split(':');
  if (parts.length !== 3) return null;
  const [, a, b] = parts;
  if (!a || !b) return null;
  return { a, b };
}

export async function ensureTeamChatRoom(roomKey: string, type: 'DM' | 'GENERAL') {
  const existing = await prisma.teamChatRoom.findUnique({ where: { roomKey } });
  if (existing) return existing;
  return prisma.teamChatRoom.create({
    data: { roomKey, type: type as 'DM' | 'GENERAL' },
  });
}

export async function ensureTeamChatParticipants(roomId: string, userId: string, peerId?: string) {
  await prisma.teamChatParticipant.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: { roomId, userId },
    update: {},
  });
  if (peerId) {
    await prisma.teamChatParticipant.upsert({
      where: { roomId_userId: { roomId, userId: peerId } },
      create: { roomId, userId: peerId },
      update: {},
    });
  }
}

export async function assertUserCanAccessTeamRoom(
  roomKey: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (roomKey === 'general') return { ok: true };
  const dm = parseDmRoomKey(roomKey);
  if (!dm) return { ok: false, status: 400, message: 'Invalid room' };
  if (dm.a !== userId && dm.b !== userId) {
    return { ok: false, status: 403, message: 'Not allowed in this chat' };
  }
  return { ok: true };
}
