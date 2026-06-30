import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { getSocketIo } from '../utils/socketIo';
import {
  assertUserCanAccessTeamRoom,
  ensureTeamChatParticipants,
  ensureTeamChatRoom,
  normalizeRoomKey,
  parseDmRoomKey,
} from '../services/teamChat.service';
import {
  buildTeamAttachmentContent,
  emitTeamChatMessageToRoom,
  shapeTeamChatMessageForClient,
  teamChatMessageInclude,
} from '../utils/teamChatMessage.util';

export const uploadTeamChatAttachment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'File is required' });
      return;
    }

    const kind = String((req.body as { kind?: string })?.kind || 'document').toLowerCase();
    if (!['photo', 'video', 'document'].includes(kind)) {
      res.status(400).json({ success: false, message: 'Invalid attachment kind' });
      return;
    }

    const scope = String((req.body as { scope?: string })?.scope || 'general');
    const peerId = (req.body as { peerId?: string })?.peerId;
    const roomKey =
      String((req.body as { roomKey?: string })?.roomKey || '').trim() ||
      normalizeRoomKey(scope, userId, peerId);

    if (!roomKey) {
      res.status(400).json({ success: false, message: 'Invalid room' });
      return;
    }

    const access = await assertUserCanAccessTeamRoom(roomKey, userId);
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message });
      return;
    }

    const caption = String((req.body as { caption?: string })?.caption || '').trim();
    const content = buildTeamAttachmentContent(
      req,
      kind,
      file.originalname || file.filename,
      file.filename,
      caption,
    );

    const room = await ensureTeamChatRoom(roomKey, roomKey === 'general' ? 'GENERAL' : 'DM');
    if (roomKey !== 'general') {
      const dm = parseDmRoomKey(roomKey);
      const other = dm ? (dm.a === userId ? dm.b : dm.a) : peerId;
      await ensureTeamChatParticipants(room.id, userId, other);
    }

    const msg = await prisma.teamChatMessage.create({
      data: {
        roomId: room.id,
        senderId: userId,
        content,
      },
      include: teamChatMessageInclude,
    });

    await prisma.teamChatRoom.update({
      where: { id: room.id },
      data: { updatedAt: msg.createdAt },
    });

    const messageForClient = shapeTeamChatMessageForClient(req, msg, roomKey);

    const io = getSocketIo();
    if (io) {
      emitTeamChatMessageToRoom(io, roomKey, messageForClient);
    }

    res.status(201).json({
      success: true,
      data: messageForClient,
      message: 'Attachment sent',
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('team chat attachment upload failed:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to upload attachment',
    });
  }
};

/** scope: "me" (hide for current user) or "everyone" (soft-delete for all) */
export const deleteTeamChatMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;
    const scope = String((req.body as { scope?: string })?.scope || 'everyone').toLowerCase();

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const message = await prisma.teamChatMessage.findUnique({
      where: { id: messageId },
      include: {
        room: { select: { roomKey: true } },
        sender: teamChatMessageInclude.sender,
      },
    });

    if (!message) {
      res.status(404).json({ success: false, message: 'Message not found' });
      return;
    }

    const roomKey = message.room.roomKey;
    const access = await assertUserCanAccessTeamRoom(roomKey, userId);
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message });
      return;
    }

    const role = String(req.user?.role || '').toUpperCase();
    const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
    const isSender = message.senderId === userId;

    if (scope === 'me') {
      await prisma.teamChatMessageHide.upsert({
        where: {
          messageId_userId: { messageId, userId },
        },
        create: { messageId, userId },
        update: {},
      });

      res.json({
        success: true,
        scope: 'me',
        roomKey,
        message: 'Message removed for you',
      });
      return;
    }

    if (scope !== 'everyone') {
      res.status(400).json({ success: false, message: 'Invalid delete scope' });
      return;
    }

    if (!isSender && !isAdmin) {
      res.status(403).json({
        success: false,
        message: 'Only the sender or an admin can delete this message for everyone',
      });
      return;
    }

    const updated = await prisma.teamChatMessage.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        deletedById: userId,
      },
      include: teamChatMessageInclude,
    });

    const messageForClient = shapeTeamChatMessageForClient(req, updated, roomKey);

    const io = getSocketIo();
    if (io) {
      emitTeamChatMessageToRoom(io, roomKey, messageForClient);
    }

    res.json({
      success: true,
      scope: 'everyone',
      roomKey,
      data: messageForClient,
      message: 'Message deleted for everyone',
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('team chat message delete failed:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete message',
    });
  }
};
