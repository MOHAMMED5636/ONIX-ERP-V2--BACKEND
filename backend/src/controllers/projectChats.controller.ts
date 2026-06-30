import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  canUserAccessProjectChat,
  fetchProjectChatParticipants,
} from '../services/projectChatParticipants.service';
import { notifyProjectChatMessage } from '../services/projectChatNotify.service';
import {
  getUnreadCountsForUser,
  markProjectChatMessagesSeen,
  markSingleProjectMessageSeen,
} from '../services/projectChatReads.service';
import { publicUploadFileUrl } from '../utils/employee-response';
import {
  shapeChatMessage,
  shapeChatMessages,
  shapeChatParticipant,
  shapeChatSender,
  projectMessagesVisibleToUser,
  projectMessageInclude,
} from '../utils/projectChatMessage.util';

async function resolveReplyToMessageId(
  chatId: string,
  replyToMessageId: unknown,
): Promise<string | null> {
  const raw = String(replyToMessageId ?? '').trim();
  if (!raw) return null;
  const parent = await prisma.projectMessage.findFirst({
    where: { id: raw, chatId },
    select: { id: true },
  });
  return parent?.id ?? null;
}

async function canAccessProjectChat(projectId: string, req: AuthRequest): Promise<boolean> {
  if (!req.user?.id) return false;
  return canUserAccessProjectChat(projectId, req.user.id, String(req.user.role || ''));
}

// Get all project chats (with optional project filter)
export const getAllProjectChats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, search, page = '1', limit = '50' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 50);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (projectId) {
      where.projectId = projectId as string;
    }

    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { project: { name: { contains: search as string, mode: 'insensitive' } } },
      ];
    }

    const [chats, total] = await Promise.all([
      prisma.projectChat.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: {
          updatedAt: 'desc',
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              referenceNumber: true,
              status: true,
            },
          },
          messages: {
            take: 1,
            orderBy: {
              createdAt: 'desc',
            },
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
            select: {
              messages: true,
            },
          },
        },
      }),
      prisma.projectChat.count({ where }),
    ]);

    // Transform data to include last message info
    const chatsWithLastMessage = chats.map((chat) => {
      const lastMessage = chat.messages[0] || null;
      return {
        id: chat.id,
        projectId: chat.projectId,
        project: chat.project,
        title: chat.title || chat.project.name,
        isActive: chat.isActive,
        messageCount: chat._count.messages,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              content: lastMessage.content,
              sender: shapeChatSender(req, lastMessage.sender),
              createdAt: lastMessage.createdAt,
            }
          : null,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      };
    });

    res.json({
      success: true,
      data: {
        chats: chatsWithLastMessage,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching project chats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project chats',
      error: error.message,
    });
  }
};

// Get a single project chat by ID with all messages
export const getProjectChatById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const chat = await prisma.projectChat.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
            status: true,
            projectManager: true, // Plain text string field
          },
        },
        messages: {
          where: projectMessagesVisibleToUser(req.user?.id),
          orderBy: {
            createdAt: 'asc',
          },
          include: projectMessageInclude,
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    if (!chat) {
      res.status(404).json({
        success: false,
        message: 'Project chat not found',
      });
      return;
    }

    const allowed = await canAccessProjectChat(chat.projectId, req);
    if (!allowed) {
      res.status(403).json({ success: false, message: 'Not allowed to access this project chat' });
      return;
    }

    const participants = (await fetchProjectChatParticipants(chat.projectId)).map((p) =>
      shapeChatParticipant(req, p),
    );

    res.json({
      success: true,
      data: {
        id: chat.id,
        projectId: chat.projectId,
        project: chat.project,
        title: chat.title || chat.project.name,
        isActive: chat.isActive,
        messageCount: chat._count.messages,
        messages: shapeChatMessages(req, chat.messages),
        participants,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching project chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project chat',
      error: error.message,
    });
  }
};

// Get or create a project chat for a project
export const getOrCreateProjectChat = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const userId = req.user?.id;

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        referenceNumber: true,
      },
    });

    if (!project) {
      res.status(404).json({
        success: false,
        message: 'Project not found',
      });
      return;
    }

    const allowed = await canAccessProjectChat(projectId, req);
    if (!allowed) {
      res.status(403).json({ success: false, message: 'Not allowed to access this project chat' });
      return;
    }

    // Try to find existing chat
    let chat = await prisma.projectChat.findFirst({
      where: { projectId },
      include: {
        messages: {
          where: projectMessagesVisibleToUser(req.user?.id),
          orderBy: {
            createdAt: 'asc',
          },
          include: projectMessageInclude,
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    // Create chat if it doesn't exist
    if (!chat) {
      chat = await prisma.projectChat.create({
        data: {
          projectId,
          title: project.name,
          isActive: true,
        },
        include: {
          messages: {
            where: projectMessagesVisibleToUser(req.user?.id),
            orderBy: {
              createdAt: 'asc',
            },
            include: projectMessageInclude,
          },
          _count: {
            select: {
              messages: true,
            },
          },
        },
      });
    }

    const participants = (await fetchProjectChatParticipants(projectId)).map((p) =>
      shapeChatParticipant(req, p),
    );

    res.json({
      success: true,
      data: {
        id: chat.id,
        projectId: chat.projectId,
        project: {
          id: project.id,
          name: project.name,
          referenceNumber: project.referenceNumber,
        },
        title: chat.title || project.name,
        isActive: chat.isActive,
        messageCount: chat._count.messages,
        messages: shapeChatMessages(req, chat.messages),
        participants,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('❌ Error getting/creating project chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get or create project chat',
      error: error.message,
    });
  }
};

// Create a new message in a project chat
export const createProjectMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const { content, replyToMessageId } = req.body;
    const userId = req.user?.id;

    if (!content || !content.trim()) {
      res.status(400).json({
        success: false,
        message: 'Message content is required',
      });
      return;
    }

    // Verify chat exists
    const chat = await prisma.projectChat.findUnique({
      where: { id: chatId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
          },
        },
      },
    });

    if (!chat) {
      res.status(404).json({
        success: false,
        message: 'Project chat not found',
      });
      return;
    }

    const allowed = await canAccessProjectChat(chat.project.id, req);
    if (!allowed) {
      res.status(403).json({ success: false, message: 'Not allowed to post in this project chat' });
      return;
    }

    const resolvedReplyId = await resolveReplyToMessageId(chatId, replyToMessageId);
    if (replyToMessageId && !resolvedReplyId) {
      res.status(400).json({
        success: false,
        message: 'Reply target message not found in this chat',
      });
      return;
    }

    // Create message
    const message = await prisma.projectMessage.create({
      data: {
        chatId,
        senderId: userId || null,
        content: content.trim(),
        replyToMessageId: resolvedReplyId,
      },
      include: projectMessageInclude,
    });

    // Update chat's updatedAt timestamp
    await prisma.projectChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    const messageForClient = shapeChatMessage(req, message);

    void notifyProjectChatMessage({
      projectId: chat.project.id,
      projectName: chat.project.name,
      projectReferenceNumber: chat.project.referenceNumber,
      chatId: chat.id,
      message: messageForClient,
    });

    res.status(201).json({
      success: true,
      data: messageForClient,
      message: 'Message created successfully',
    });
  } catch (error: any) {
    console.error('❌ Error creating project message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create message',
      error: error.message,
    });
  }
};

/** Upload photo / video / document and post as a chat message */
export const createProjectChatAttachment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const userId = req.user?.id;
    const kind = String((req.body as { kind?: string })?.kind || 'document').toLowerCase();
    const caption = String((req.body as { caption?: string })?.caption || '').trim();
    const replyToMessageId = (req.body as { replyToMessageId?: string })?.replyToMessageId;
    const file = req.file;

    if (!file) {
      res.status(400).json({ success: false, message: 'File is required' });
      return;
    }

    if (!['photo', 'video', 'document'].includes(kind)) {
      res.status(400).json({ success: false, message: 'Invalid attachment kind' });
      return;
    }

    const chat = await prisma.projectChat.findUnique({
      where: { id: chatId },
      include: {
        project: {
          select: { id: true, name: true, referenceNumber: true },
        },
      },
    });

    if (!chat) {
      res.status(404).json({ success: false, message: 'Project chat not found' });
      return;
    }

    const allowed = await canAccessProjectChat(chat.project.id, req);
    if (!allowed) {
      res.status(403).json({ success: false, message: 'Not allowed to post in this project chat' });
      return;
    }

    const resolvedReplyId = await resolveReplyToMessageId(chatId, replyToMessageId);
    if (replyToMessageId && !resolvedReplyId) {
      res.status(400).json({
        success: false,
        message: 'Reply target message not found in this chat',
      });
      return;
    }

    const fileUrl = publicUploadFileUrl(req, 'project-chat', file.filename);
    if (!fileUrl) {
      res.status(500).json({ success: false, message: 'Failed to build file URL' });
      return;
    }

    const payload = {
      type: 'attachment',
      kind,
      fileName: file.originalname || file.filename,
      fileUrl,
      ...(caption ? { caption } : {}),
    };

    const message = await prisma.projectMessage.create({
      data: {
        chatId,
        senderId: userId || null,
        content: JSON.stringify(payload),
        replyToMessageId: resolvedReplyId,
      },
      include: projectMessageInclude,
    });

    await prisma.projectChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    const messageForClient = shapeChatMessage(req, message);

    void notifyProjectChatMessage({
      projectId: chat.project.id,
      projectName: chat.project.name,
      projectReferenceNumber: chat.project.referenceNumber,
      chatId: chat.id,
      message: messageForClient,
    });

    res.status(201).json({
      success: true,
      data: messageForClient,
      message: 'Attachment sent successfully',
    });
  } catch (error: any) {
    console.error('❌ Error creating project chat attachment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload attachment',
      error: error.message,
    });
  }
};

// Update a project chat (e.g., title, isActive)
export const updateProjectChat = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, isActive } = req.body;

    const chat = await prisma.projectChat.findUnique({
      where: { id },
    });

    if (!chat) {
      res.status(404).json({
        success: false,
        message: 'Project chat not found',
      });
      return;
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedChat = await prisma.projectChat.update({
      where: { id },
      data: updateData,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: updatedChat,
      message: 'Project chat updated successfully',
    });
  } catch (error: any) {
    console.error('❌ Error updating project chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update project chat',
      error: error.message,
    });
  }
};

// Delete a project chat (and all its messages)
export const deleteProjectChat = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const chat = await prisma.projectChat.findUnique({
      where: { id },
    });

    if (!chat) {
      res.status(404).json({
        success: false,
        message: 'Project chat not found',
      });
      return;
    }

    // Delete chat (messages will be cascade deleted)
    await prisma.projectChat.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Project chat deleted successfully',
    });
  } catch (error: any) {
    console.error('❌ Error deleting project chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete project chat',
      error: error.message,
    });
  }
};

/** Add employees to project chat (persists access; does not replace project assignments). */
export const addProjectChatParticipants = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const userIds = (req.body as { userIds?: string[] })?.userIds;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ success: false, message: 'userIds array is required' });
      return;
    }

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    const allowed = await canAccessProjectChat(projectId, req);
    if (!allowed) {
      res.status(403).json({ success: false, message: 'Not allowed to manage this project chat' });
      return;
    }

    const uniqueIds = [...new Set(userIds.map((id) => String(id).trim()).filter(Boolean))];
    const validUsers = await prisma.user.findMany({
      where: { id: { in: uniqueIds }, isActive: true },
      select: { id: true },
    });
    const validIds = validUsers.map((u) => u.id);
    if (validIds.length === 0) {
      res.status(400).json({ success: false, message: 'No valid active users to add' });
      return;
    }

    await prisma.projectChatParticipant.createMany({
      data: validIds.map((userId) => ({
        projectId,
        userId,
        addedById: req.user?.id || null,
      })),
      skipDuplicates: true,
    });

    const participants = (await fetchProjectChatParticipants(projectId)).map((p) =>
      shapeChatParticipant(req, p),
    );

    res.json({
      success: true,
      message: 'Participants added to project chat',
      data: { participants },
    });
  } catch (error: any) {
    console.error('❌ Error adding project chat participants:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add participants',
      error: error.message,
    });
  }
};

/** Remove an explicit project chat member (does not unassign from project/tasks). */
export const removeProjectChatParticipant = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, userId } = req.params;

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    const allowed = await canAccessProjectChat(projectId, req);
    if (!allowed) {
      res.status(403).json({ success: false, message: 'Not allowed to manage this project chat' });
      return;
    }

    await prisma.projectChatParticipant.deleteMany({
      where: { projectId, userId },
    });

    const participants = (await fetchProjectChatParticipants(projectId)).map((p) =>
      shapeChatParticipant(req, p),
    );

    res.json({
      success: true,
      message: 'Participant removed from project chat',
      data: { participants },
    });
  } catch (error: any) {
    console.error('❌ Error removing project chat participant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove participant',
      error: error.message,
    });
  }
};

/**
 * Bulk mark all unread messages in a chat as seen by the current user.
 * Body (optional): { upToMessageId } — last visible message optimization.
 */
export const markProjectChatSeen = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const chat = await prisma.projectChat.findUnique({
      where: { id: chatId },
      select: { id: true, projectId: true },
    });
    if (!chat) {
      res.status(404).json({ success: false, message: 'Project chat not found' });
      return;
    }

    const allowed = await canAccessProjectChat(chat.projectId, req);
    if (!allowed) {
      res.status(403).json({ success: false, message: 'Not allowed to access this project chat' });
      return;
    }

    const upToMessageId =
      typeof (req.body as { upToMessageId?: string })?.upToMessageId === 'string'
        ? (req.body as { upToMessageId?: string }).upToMessageId
        : null;

    const result = await markProjectChatMessagesSeen({
      chatId,
      projectId: chat.projectId,
      userId,
      upToMessageId,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('❌ Error marking chat seen:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark chat as seen',
      error: error.message,
    });
  }
};

/** Mark a single message as seen by the current user. */
export const markProjectMessageSeen = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const message = await prisma.projectMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        chatId: true,
        senderId: true,
        deletedAt: true,
        chat: { select: { projectId: true } },
      },
    });
    if (!message || message.deletedAt) {
      res.status(404).json({ success: false, message: 'Message not found' });
      return;
    }

    const allowed = await canAccessProjectChat(message.chat.projectId, req);
    if (!allowed) {
      res.status(403).json({ success: false, message: 'Not allowed to access this project chat' });
      return;
    }

    const marked = await markSingleProjectMessageSeen({
      messageId,
      chatId: message.chatId,
      projectId: message.chat.projectId,
      userId,
      senderId: message.senderId,
    });

    res.json({ success: true, data: { marked } });
  } catch (error: any) {
    console.error('❌ Error marking message seen:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark message as seen',
      error: error.message,
    });
  }
};

/** Who has seen a message ("Seen by N" detail list). */
export const getProjectMessageSeenStatus = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { messageId } = req.params;

    const message = await prisma.projectMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        senderId: true,
        createdAt: true,
        chat: { select: { projectId: true } },
        reads: {
          orderBy: { seenAt: 'asc' },
          select: {
            seenAt: true,
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, photo: true },
            },
          },
        },
      },
    });
    if (!message) {
      res.status(404).json({ success: false, message: 'Message not found' });
      return;
    }

    const allowed = await canAccessProjectChat(message.chat.projectId, req);
    if (!allowed) {
      res.status(403).json({ success: false, message: 'Not allowed to access this project chat' });
      return;
    }

    res.json({
      success: true,
      data: {
        messageId: message.id,
        seenCount: message.reads.length,
        seenBy: message.reads.map((r) => ({
          ...shapeChatSender(req, r.user),
          seenAt: r.seenAt,
        })),
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching seen status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch seen status',
      error: error.message,
    });
  }
};

/** Unread message counts per project chat for the current user (chat list badges). */
export const getProjectChatUnreadCounts = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const counts = await getUnreadCountsForUser(userId);
    res.json({ success: true, data: counts });
  } catch (error: any) {
    console.error('❌ Error fetching unread counts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread counts',
      error: error.message,
    });
  }
};

// Delete a message — scope: "me" (hide for current user) or "everyone" (soft-delete for all)
export const deleteProjectMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;
    const scope = String((req.body as { scope?: string })?.scope || 'everyone').toLowerCase();

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const message = await prisma.projectMessage.findUnique({
      where: { id: messageId },
      include: { chat: { select: { projectId: true } } },
    });

    if (!message) {
      res.status(404).json({
        success: false,
        message: 'Message not found',
      });
      return;
    }

    const allowed = await canAccessProjectChat(message.chat.projectId, req);
    if (!allowed) {
      res.status(403).json({ success: false, message: 'Not allowed to access this project chat' });
      return;
    }

    const role = String(req.user?.role || '').toUpperCase();
    const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
    const isSender = message.senderId === userId;

    if (scope === 'me') {
      await prisma.projectMessageHide.upsert({
        where: {
          messageId_userId: { messageId, userId },
        },
        create: { messageId, userId },
        update: {},
      });

      res.json({
        success: true,
        scope: 'me',
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

    const updated = await prisma.projectMessage.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        deletedById: userId,
      },
      include: projectMessageInclude,
    });

    res.json({
      success: true,
      scope: 'everyone',
      data: shapeChatMessage(req, updated),
      message: 'Message deleted for everyone',
    });
  } catch (error: any) {
    console.error('❌ Error deleting message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete message',
      error: error.message,
    });
  }
};
