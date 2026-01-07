import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// Project Attachments

// Get project attachments
export const getProjectAttachments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const attachments = await prisma.projectAttachment.findMany({
      where: { projectId },
      orderBy: { uploadedAt: 'desc' },
    });

    res.json({
      success: true,
      data: attachments,
    });
  } catch (error) {
    console.error('Get project attachments error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Create project attachment (file upload handled by middleware)
export const createProjectAttachment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const file = req.file;

    if (!file) {
      res.status(400).json({
        success: false,
        message: 'File is required',
      });
      return;
    }

    const attachment = await prisma.projectAttachment.create({
      data: {
        projectId,
        fileName: file.originalname,
        filePath: file.path,
        fileUrl: `/uploads/${file.filename}`,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedBy: req.user?.id || null,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Attachment uploaded successfully',
      data: attachment,
    });
  } catch (error) {
    console.error('Create project attachment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Delete project attachment
export const deleteProjectAttachment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, attachmentId } = req.params;

    const attachment = await prisma.projectAttachment.findFirst({
      where: {
        id: attachmentId,
        projectId,
      },
    });

    if (!attachment) {
      res.status(404).json({ success: false, message: 'Attachment not found' });
      return;
    }

    // Delete file from filesystem (optional)
    // const fs = require('fs');
    // if (fs.existsSync(attachment.filePath)) {
    //   fs.unlinkSync(attachment.filePath);
    // }

    await prisma.projectAttachment.delete({
      where: { id: attachmentId },
    });

    res.json({
      success: true,
      message: 'Attachment deleted successfully',
    });
  } catch (error) {
    console.error('Delete project attachment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Task Attachments

// Get task attachments
export const getTaskAttachments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;

    const attachments = await prisma.taskAttachment.findMany({
      where: { taskId },
      orderBy: { uploadedAt: 'desc' },
    });

    res.json({
      success: true,
      data: attachments,
    });
  } catch (error) {
    console.error('Get task attachments error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Create task attachment (file upload handled by middleware)
export const createTaskAttachment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const file = req.file;

    if (!file) {
      res.status(400).json({
        success: false,
        message: 'File is required',
      });
      return;
    }

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId,
        fileName: file.originalname,
        filePath: file.path,
        fileUrl: `/uploads/${file.filename}`,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedBy: req.user?.id || null,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Attachment uploaded successfully',
      data: attachment,
    });
  } catch (error) {
    console.error('Create task attachment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Delete task attachment
export const deleteTaskAttachment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { taskId, attachmentId } = req.params;

    const attachment = await prisma.taskAttachment.findFirst({
      where: {
        id: attachmentId,
        taskId,
      },
    });

    if (!attachment) {
      res.status(404).json({ success: false, message: 'Attachment not found' });
      return;
    }

    // Delete file from filesystem (optional)
    // const fs = require('fs');
    // if (fs.existsSync(attachment.filePath)) {
    //   fs.unlinkSync(attachment.filePath);
    // }

    await prisma.taskAttachment.delete({
      where: { id: attachmentId },
    });

    res.json({
      success: true,
      message: 'Attachment deleted successfully',
    });
  } catch (error) {
    console.error('Delete task attachment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

