import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// Get task comments
export const getTaskComments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;

    const comments = await prisma.taskComment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    });

    // Fetch user details for each comment
    const commentsWithUsers = await Promise.all(
      comments.map(async (comment) => {
        if (comment.createdBy) {
          const user = await prisma.user.findUnique({
            where: { id: comment.createdBy },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              photo: true,
            },
          });
          return {
            ...comment,
            user: user || null,
          };
        }
        return {
          ...comment,
          user: null,
        };
      })
    );

    res.json({
      success: true,
      data: commentsWithUsers,
    });
  } catch (error) {
    console.error('Get task comments error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Create task comment
export const createTaskComment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      res.status(400).json({
        success: false,
        message: 'Comment content is required',
      });
      return;
    }

    const comment = await prisma.taskComment.create({
      data: {
        taskId,
        content: content.trim(),
        createdBy: req.user?.id || null,
      },
    });

    // Fetch user details
    let user = null;
    if (comment.createdBy) {
      user = await prisma.user.findUnique({
        where: { id: comment.createdBy },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          photo: true,
        },
      });
    }

    res.status(201).json({
      success: true,
      message: 'Comment created successfully',
      data: {
        ...comment,
        user,
      },
    });
  } catch (error) {
    console.error('Create task comment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Update task comment
export const updateTaskComment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId, commentId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      res.status(400).json({
        success: false,
        message: 'Comment content is required',
      });
      return;
    }

    const comment = await prisma.taskComment.findFirst({
      where: {
        id: commentId,
        taskId,
        createdBy: req.user?.id, // Only allow updating own comments
      },
    });

    if (!comment) {
      res.status(404).json({
        success: false,
        message: 'Comment not found or unauthorized',
      });
      return;
    }

    const updated = await prisma.taskComment.update({
      where: { id: commentId },
      data: { content: content.trim() },
    });

    res.json({
      success: true,
      message: 'Comment updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Update task comment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Delete task comment
export const deleteTaskComment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId, commentId } = req.params;

    const comment = await prisma.taskComment.findFirst({
      where: {
        id: commentId,
        taskId,
        createdBy: req.user?.id, // Only allow deleting own comments (or admin)
      },
    });

    if (!comment && req.user?.role !== 'ADMIN') {
      res.status(404).json({
        success: false,
        message: 'Comment not found or unauthorized',
      });
      return;
    }

    await prisma.taskComment.delete({
      where: { id: commentId },
    });

    res.json({
      success: true,
      message: 'Comment deleted successfully',
    });
  } catch (error) {
    console.error('Delete task comment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

