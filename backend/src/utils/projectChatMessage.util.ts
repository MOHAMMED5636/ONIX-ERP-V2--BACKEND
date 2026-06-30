import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { publicUploadFileUrl } from './employee-response';

export type ChatSenderRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  photo: string | null;
} | null;

export function shapeChatSender(req: Request | undefined, sender: ChatSenderRow) {
  if (!sender) return null;
  const photoUrl = publicUploadFileUrl(req, 'photos', sender.photo);
  return {
    ...sender,
    photoUrl,
  };
}

export function shapeChatParticipant(req: Request | undefined, user: ChatSenderRow) {
  return shapeChatSender(req, user);
}

export type ChatAttachmentMeta = {
  type: 'attachment';
  kind: 'photo' | 'video' | 'document';
  fileName: string;
  fileUrl: string;
  caption?: string;
};

export function parseChatMessageContent(content: string): {
  text: string;
  attachment: ChatAttachmentMeta | null;
} {
  const raw = String(content || '').trim();
  if (!raw.startsWith('{')) {
    return { text: raw, attachment: null };
  }
  try {
    const parsed = JSON.parse(raw) as ChatAttachmentMeta & { type?: string };
    if (parsed?.type === 'attachment' && parsed.fileUrl) {
      return {
        text: parsed.caption || '',
        attachment: {
          type: 'attachment',
          kind: (parsed.kind as ChatAttachmentMeta['kind']) || 'document',
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

export type ProjectMessageRow = {
  id: string;
  content: string;
  createdAt?: Date;
  senderId?: string | null;
  deletedAt?: Date | null;
  sender?: ChatSenderRow;
  _count?: { reads?: number };
  replyTo?: ProjectMessageRow | null;
};

export type ChatReplyPreview = {
  id: string;
  text: string;
  sender: ReturnType<typeof shapeChatSender>;
  deleted: boolean;
  attachment: ChatAttachmentMeta | null;
};

export function shapeChatReplyPreview(
  req: Request | undefined,
  replyTo: ProjectMessageRow | null | undefined,
): ChatReplyPreview | null {
  if (!replyTo?.id) return null;
  const shaped = shapeChatMessage(req, replyTo as { content: string; sender?: ChatSenderRow });
  return {
    id: replyTo.id,
    text: shaped.deleted
      ? 'This message was deleted'
      : shaped.displayContent || shaped.content || (shaped.attachment?.fileName ?? ''),
    sender: shapeChatSender(req, replyTo.sender ?? null),
    deleted: !!shaped.deleted,
    attachment: shaped.attachment,
  };
}

export function shapeChatMessage<T extends { content: string; sender?: ChatSenderRow }>(
  req: Request | undefined,
  message: T,
): T & {
  attachment: ChatAttachmentMeta | null;
  displayContent: string;
  deleted?: boolean;
  seenCount: number;
  replyTo: ChatReplyPreview | null;
} {
  const row = message as unknown as ProjectMessageRow;
  const seenCount = row._count?.reads ?? 0;
  const replyTo = shapeChatReplyPreview(req, row.replyTo);
  if (row.deletedAt) {
    return {
      ...message,
      content: 'This message was deleted',
      displayContent: '',
      attachment: null,
      deleted: true,
      seenCount,
      replyTo,
      sender: shapeChatSender(req, message.sender ?? null),
    } as T & {
      attachment: ChatAttachmentMeta | null;
      displayContent: string;
      deleted: boolean;
      seenCount: number;
      replyTo: ChatReplyPreview | null;
    };
  }
  const { text, attachment } = parseChatMessageContent(message.content);
  return {
    ...message,
    content: text || (attachment ? attachment.fileName : message.content),
    displayContent: text,
    attachment,
    deleted: false,
    seenCount,
    replyTo,
    sender: shapeChatSender(req, message.sender ?? null),
  };
}

export function shapeChatMessages<T extends { content: string; sender?: ChatSenderRow }>(
  req: Request | undefined,
  messages: T[],
): (T & { attachment: ChatAttachmentMeta | null; displayContent: string; deleted?: boolean })[] {
  return messages.map((m) => shapeChatMessage(req, m));
}

/** Prisma filter: exclude messages hidden by this user */
export function projectMessagesVisibleToUser(
  userId: string | undefined,
): Prisma.ProjectMessageWhereInput | undefined {
  if (!userId) return undefined;
  return {
    hides: {
      none: { userId },
    },
  };
}

export const projectMessageInclude = {
  sender: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      photo: true,
    },
  },
  replyTo: {
    include: {
      sender: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          photo: true,
        },
      },
    },
  },
  _count: {
    select: { reads: true },
  },
} as const;
