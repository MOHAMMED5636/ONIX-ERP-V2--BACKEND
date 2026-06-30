import { Response } from 'express';
import { ProjectManagerTransferStatus } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  completeProjectManagerTransfer,
  createProjectManagerTransfers,
  isPmTransferAdmin,
  listProjectManagerTransfers,
  listProjectManagersForTransfer,
  listProjectsForManager,
} from '../services/projectManagerTransfer.service';

export const listManagers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isPmTransferAdmin(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Only ERP Admin can manage PM transfers' });
      return;
    }
    const managers = await listProjectManagersForTransfer();
    res.json({ success: true, data: managers });
  } catch (e) {
    console.error('listManagers:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const listManagerProjects = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isPmTransferAdmin(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Only ERP Admin can manage PM transfers' });
      return;
    }
    const { managerId } = req.params;
    const projects = await listProjectsForManager(managerId);
    res.json({ success: true, data: projects });
  } catch (e) {
    console.error('listManagerProjects:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const listTransfers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isPmTransferAdmin(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Only ERP Admin can manage PM transfers' });
      return;
    }
    const statusRaw = req.query.status as string | undefined;
    const managerId = req.query.managerId as string | undefined;
    const status =
      statusRaw === 'ACTIVE' || statusRaw === 'COMPLETED'
        ? (statusRaw as ProjectManagerTransferStatus)
        : undefined;
    const rows = await listProjectManagerTransfers({ status, managerId });
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('listTransfers:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const createTransfers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isPmTransferAdmin(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Only ERP Admin can transfer Project Managers' });
      return;
    }
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const {
      projectIds,
      oldProjectManagerId,
      newProjectManagerId,
      startDate,
      endDate,
      transferReason,
      confirm,
    } = req.body;

    if (confirm !== true && confirm !== 'true') {
      res.status(400).json({
        success: false,
        message: 'Confirmation required. Set confirm: true to proceed with the transfer.',
        code: 'CONFIRMATION_REQUIRED',
      });
      return;
    }

    const created = await createProjectManagerTransfers({
      projectIds: Array.isArray(projectIds) ? projectIds : [],
      oldProjectManagerId,
      newProjectManagerId,
      startDate,
      endDate: endDate || null,
      transferReason,
      transferredById: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: `${created.length} project(s) reassigned successfully`,
      data: created,
    });
  } catch (e: any) {
    console.error('createTransfers:', e);
    res.status(400).json({ success: false, message: e?.message || 'Transfer failed' });
  }
};

export const completeTransfer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isPmTransferAdmin(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Only ERP Admin can return projects' });
      return;
    }
    const { id } = req.params;
    await completeProjectManagerTransfer(id, req.user?.id ?? null);
    res.json({ success: true, message: 'Projects returned to the original Project Manager' });
  } catch (e: any) {
    console.error('completeTransfer:', e);
    res.status(400).json({ success: false, message: e?.message || 'Return failed' });
  }
};
