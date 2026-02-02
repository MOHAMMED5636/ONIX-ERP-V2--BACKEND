import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

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
              sender: lastMessage.sender,
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
            projectManager: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: 'asc',
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
    });

    if (!chat) {
      res.status(404).json({
        success: false,
        message: 'Project chat not found',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: chat.id,
        projectId: chat.projectId,
        project: chat.project,
        title: chat.title || chat.project.name,
        isActive: chat.isActive,
        messageCount: chat._count.messages,
        messages: chat.messages,
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

    // Try to find existing chat
    let chat = await prisma.projectChat.findFirst({
      where: { projectId },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc',
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
            orderBy: {
              createdAt: 'asc',
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
      });
    }

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
        messages: chat.messages,
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
    const { content } = req.body;
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

    // Create message
    const message = await prisma.projectMessage.create({
      data: {
        chatId,
        senderId: userId || null,
        content: content.trim(),
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
    });

    // Update chat's updatedAt timestamp
    await prisma.projectChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    res.status(201).json({
      success: true,
      data: message,
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

// Delete a message
export const deleteProjectMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;

    const message = await prisma.projectMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      res.status(404).json({
        success: false,
        message: 'Message not found',
      });
      return;
    }

    // Only allow sender or admin to delete
    if (message.senderId !== userId && req.user?.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this message',
      });
      return;
    }

    await prisma.projectMessage.delete({
      where: { id: messageId },
    });

    res.json({
      success: true,
      message: 'Message deleted successfully',
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
