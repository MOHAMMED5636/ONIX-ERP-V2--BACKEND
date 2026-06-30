import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { publicUploadFileUrl } from './employee-response';

export type TeamChatAttachmentMeta = {
  type: 'attachment';
  kind: 'photo' | 'video' | 'document';
  fileName: string;
  fileUrl: string;
  caption?: string;
};

export function parseTeamChatContent(content: string): {
  text: string;
  attachment: TeamChatAttachmentMeta | null;
} {
  const raw = String(content || '').trim();
  if (!raw.startsWith('{')) {
    return { text: raw, attachment: null };
  }
  try {
    const parsed = JSON.parse(raw) as TeamChatAttachmentMeta & { type?: string };
    if (parsed?.type === 'attachment' && parsed.fileUrl) {
      return {
        text: parsed.caption || '',
        attachment: {
          type: 'attachment',
          kind: (parsed.kind as TeamChatAttachmentMeta['kind']) || 'document',
          fileName: parsed.fileName || 'file',
          fileUrl: parsed.fileUrl,
          caption: parsed.caption,
        },
      };
    }
  } catch {
    /* plain text */
  }
  return { text: raw, attachment: null };
}

type SenderRow = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  photo?: string | null;
} | null;

export function shapeTeamChatSender(req: Request | undefined, sender: SenderRow) {
  if (!sender) return null;
  const name =
    [sender.firstName, sender.lastName].filter(Boolean).join(' ').trim() ||
    sender.email ||
    'User';
  const photoUrl = publicUploadFileUrl(req, 'photos', sender.photo ?? null);
  return {
    id: sender.id,
    email: sender.email,
    name,
    firstName: sender.firstName,
    lastName: sender.lastName,
    photo: sender.photo,
    photoUrl,
  };
}

type TeamMessageRow = {
  id: string;
  content: string;
  createdAt: Date;
  senderId: string | null;
  deletedAt?: Date | null;
  sender?: SenderRow;
};

export const teamChatMessageInclude = {
  sender: {
    select: { id: true, email: true, firstName: true, lastName: true, photo: true },
  },
} as const;

/** Prisma filter: exclude messages hidden by this user */
export function teamMessagesVisibleToUser(
  userId: string | undefined,
): Prisma.TeamChatMessageWhereInput | undefined {
  if (!userId) return undefined;
  return {
    hides: {
      none: { userId },
    },
  };
}

export function shapeTeamChatMessageForClient(
  req: Request | undefined,
  msg: TeamMessageRow,
  roomKey: string,
) {
  const sender = shapeTeamChatSender(req, msg.sender ?? null);

  if (msg.deletedAt) {
    return {
      id: msg.id,
      roomKey,
      text: 'This message was deleted',
      displayContent: '',
      attachment: null,
      sender,
      senderId: msg.senderId,
      senderName: sender?.name || 'User',
      createdAt: msg.createdAt.toISOString(),
      deleted: true,
    };
  }

  const { text, attachment } = parseTeamChatContent(msg.content);
  const attachmentOut = attachment
    ? {
        ...attachment,
        fileUrl:
          attachment.fileUrl.startsWith('http') || attachment.fileUrl.startsWith('/uploads/')
            ? attachment.fileUrl
            : publicUploadFileUrl(req, 'team-chat', attachment.fileUrl) || attachment.fileUrl,
      }
    : null;

  return {
    id: msg.id,
    roomKey,
    text: text || (attachmentOut ? attachmentOut.fileName : msg.content),
    displayContent: text,
    attachment: attachmentOut,
    sender,
    senderId: msg.senderId,
    senderName: sender?.name || 'User',
    createdAt: msg.createdAt.toISOString(),
    deleted: false,
  };
}

export function emitTeamChatMessageToRoom(
  io: import('socket.io').Server,
  roomKey: string,
  message: ReturnType<typeof shapeTeamChatMessageForClient>,
) {
  const payload = {
    ...message,
    scope: roomKey === 'general' ? 'general' : 'dm',
  };
  io.to(roomKey).emit('team:message', payload);
  if (roomKey !== 'general') {
    const parts = roomKey.split(':');
    if (parts.length === 3 && parts[0] === 'dm') {
      const [, a, b] = parts;
      if (a) io.to(`user:${a}`).emit('team:message', payload);
      if (b) io.to(`user:${b}`).emit('team:message', payload);
    }
  }
}

export function buildTeamAttachmentContent(
  req: Request,
  kind: string,
  fileName: string,
  storedFilename: string,
  caption?: string,
): string {
  const fileUrl = publicUploadFileUrl(req, 'team-chat', storedFilename);
  const payload: TeamChatAttachmentMeta = {
    type: 'attachment',
    kind: (kind as TeamChatAttachmentMeta['kind']) || 'document',
    fileName: fileName || storedFilename,
    fileUrl: fileUrl || `/uploads/team-chat/${storedFilename}`,
    ...(caption ? { caption } : {}),
  };
  return JSON.stringify(payload);
}
