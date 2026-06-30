import prisma from '../config/database';
import { getSocketIo } from '../utils/socketIo';

export type MarkSeenResult = {
  markedCount: number;
  messageIds: string[];
  seenAt: string;
};

/** Messages eligible for read receipts: visible, not deleted, not sent by the reader. */
function unreadMessagesWhere(chatId: string, userId: string, upToCreatedAt?: Date | null) {
  return {
    chatId,
    deletedAt: null,
    OR: [{ senderId: null }, { senderId: { not: userId } }],
    ...(upToCreatedAt ? { createdAt: { lte: upToCreatedAt } } : {}),
    reads: { none: { userId } },
    hides: { none: { userId } },
  };
}

/**
 * Bulk-mark all unread messages in a chat as seen by `userId`.
 *
 * Single SELECT (ids only) + single INSERT (createMany, skipDuplicates) — no row-per-scroll
 * writes, no N+1. `upToMessageId` lets clients use the last-visible-message optimization.
 */
export async function markProjectChatMessagesSeen(params: {
  chatId: string;
  projectId: string;
  userId: string;
  upToMessageId?: string | null;
}): Promise<MarkSeenResult> {
  const { chatId, projectId, userId, upToMessageId } = params;

  let upToCreatedAt: Date | null = null;
  if (upToMessageId) {
    const ceiling = await prisma.projectMessage.findUnique({
      where: { id: upToMessageId },
      select: { createdAt: true, chatId: true },
    });
    if (ceiling && ceiling.chatId === chatId) upToCreatedAt = ceiling.createdAt;
  }

  const unread = await prisma.projectMessage.findMany({
    where: unreadMessagesWhere(chatId, userId, upToCreatedAt),
    select: { id: true },
  });

  const seenAt = new Date();
  if (unread.length > 0) {
    await prisma.projectMessageRead.createMany({
      data: unread.map((m) => ({ messageId: m.id, userId, seenAt })),
      skipDuplicates: true,
    });
  }

  const messageIds = unread.map((m) => m.id);
  if (messageIds.length > 0) {
    emitMessagesSeen(projectId, chatId, userId, messageIds, seenAt);
  }

  return { markedCount: messageIds.length, messageIds, seenAt: seenAt.toISOString() };
}

/** Mark a single message seen (used for live messages while the chat is open). */
export async function markSingleProjectMessageSeen(params: {
  messageId: string;
  chatId: string;
  projectId: string;
  userId: string;
  senderId: string | null;
}): Promise<boolean> {
  const { messageId, chatId, projectId, userId, senderId } = params;
  if (senderId && senderId === userId) return false; // senders never "see" their own messages

  const result = await prisma.projectMessageRead.createMany({
    data: [{ messageId, userId }],
    skipDuplicates: true,
  });

  if (result.count > 0) {
    emitMessagesSeen(projectId, chatId, userId, [messageId], new Date());
  }
  return result.count > 0;
}

/** Per-chat unread counts for one user, computed in a single grouped query. */
export async function getUnreadCountsForUser(
  userId: string,
): Promise<{ chatId: string; projectId: string; unreadCount: number }[]> {
  const grouped = await prisma.projectMessage.groupBy({
    by: ['chatId'],
    where: {
      deletedAt: null,
      OR: [{ senderId: null }, { senderId: { not: userId } }],
      reads: { none: { userId } },
      hides: { none: { userId } },
    },
    _count: { _all: true },
  });

  if (grouped.length === 0) return [];

  const chats = await prisma.projectChat.findMany({
    where: { id: { in: grouped.map((g) => g.chatId) } },
    select: { id: true, projectId: true },
  });
  const projectByChat = new Map(chats.map((c) => [c.id, c.projectId]));

  return grouped
    .map((g) => ({
      chatId: g.chatId,
      projectId: projectByChat.get(g.chatId) || '',
      unreadCount: g._count._all,
    }))
    .filter((row) => row.projectId);
}

function emitMessagesSeen(
  projectId: string,
  chatId: string,
  userId: string,
  messageIds: string[],
  seenAt: Date,
): void {
  const io = getSocketIo();
  if (!io) return;
  const payload = {
    projectId,
    chatId,
    userId,
    messageIds,
    seenAt: seenAt.toISOString(),
  };
  // Everyone with the chat open gets live double-tick updates.
  io.to(`project:${projectId}`).emit('project:message-seen', payload);
  // Chat list / badge consumers (sender may not have the room joined).
  io.emit('project:chatroom-updated', {
    projectId,
    chatId,
    reason: 'seen',
    userId,
    seenAt: payload.seenAt,
  });
}
