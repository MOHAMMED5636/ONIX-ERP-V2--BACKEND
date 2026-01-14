import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// Project Checklists

// Get project checklists
export const getProjectChecklists = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const checklists = await prisma.projectChecklist.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });

    res.json({
      success: true,
      data: checklists,
    });
  } catch (error) {
    console.error('Get project checklists error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Create project checklist item
export const createProjectChecklist = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { title, description, order } = req.body;

    if (!title) {
      res.status(400).json({
        success: false,
        message: 'Title is required',
      });
      return;
    }

    const checklist = await prisma.projectChecklist.create({
      data: {
        projectId,
        title,
        description: description || null,
        order: order || 0,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Checklist item created successfully',
      data: checklist,
    });
  } catch (error) {
    console.error('Create project checklist error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Update project checklist item
export const updateProjectChecklist = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, checklistId } = req.params;
    const { title, description, isCompleted, order } = req.body;

    const checklist = await prisma.projectChecklist.findFirst({
      where: {
        id: checklistId,
        projectId,
      },
    });

    if (!checklist) {
      res.status(404).json({ success: false, message: 'Checklist item not found' });
      return;
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (order !== undefined) updateData.order = order;
    if (isCompleted !== undefined) {
      updateData.isCompleted = isCompleted;
      updateData.completedAt = isCompleted ? new Date() : null;
      updateData.completedBy = isCompleted ? req.user?.id || null : null;
    }

    const updated = await prisma.projectChecklist.update({
      where: { id: checklistId },
      data: updateData,
    });

    res.json({
      success: true,
      message: 'Checklist item updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Update project checklist error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Delete project checklist item
export const deleteProjectChecklist = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, checklistId } = req.params;

    const checklist = await prisma.projectChecklist.findFirst({
      where: {
        id: checklistId,
        projectId,
      },
    });

    if (!checklist) {
      res.status(404).json({ success: false, message: 'Checklist item not found' });
      return;
    }

    await prisma.projectChecklist.delete({
      where: { id: checklistId },
    });

    res.json({
      success: true,
      message: 'Checklist item deleted successfully',
    });
  } catch (error) {
    console.error('Delete project checklist error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Task Checklists

// Get task checklists
export const getTaskChecklists = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;

    const checklists = await prisma.taskChecklist.findMany({
      where: { taskId },
      orderBy: { order: 'asc' },
    });

    res.json({
      success: true,
      data: checklists,
    });
  } catch (error) {
    console.error('Get task checklists error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Create task checklist item
export const createTaskChecklist = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const { title, order } = req.body;

    if (!title) {
      res.status(400).json({
        success: false,
        message: 'Title is required',
      });
      return;
    }

    const checklist = await prisma.taskChecklist.create({
      data: {
        taskId,
        title,
        order: order || 0,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Checklist item created successfully',
      data: checklist,
    });
  } catch (error) {
    console.error('Create task checklist error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Update task checklist item
export const updateTaskChecklist = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId, checklistId } = req.params;
    const { title, isCompleted, order } = req.body;

    const checklist = await prisma.taskChecklist.findFirst({
      where: {
        id: checklistId,
        taskId,
      },
    });

    if (!checklist) {
      res.status(404).json({ success: false, message: 'Checklist item not found' });
      return;
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (order !== undefined) updateData.order = order;
    if (isCompleted !== undefined) {
      updateData.isCompleted = isCompleted;
      updateData.completedAt = isCompleted ? new Date() : null;
      updateData.completedBy = isCompleted ? req.user?.id || null : null;
    }

    const updated = await prisma.taskChecklist.update({
      where: { id: checklistId },
      data: updateData,
    });

    res.json({
      success: true,
      message: 'Checklist item updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Update task checklist error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Delete task checklist item
export const deleteTaskChecklist = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId, checklistId } = req.params;

    const checklist = await prisma.taskChecklist.findFirst({
      where: {
        id: checklistId,
        taskId,
      },
    });

    if (!checklist) {
      res.status(404).json({ success: false, message: 'Checklist item not found' });
      return;
    }

    await prisma.taskChecklist.delete({
      where: { id: checklistId },
    });

    res.json({
      success: true,
      message: 'Checklist item deleted successfully',
    });
  } catch (error) {
    console.error('Delete task checklist error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};



