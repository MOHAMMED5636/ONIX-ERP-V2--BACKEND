import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  clearUserProjectTaskFocus,
  getUserProjectTaskFocus,
  listUserProjectTaskFocus,
  setUserProjectTaskFocus,
} from '../services/projectTaskFocus.service';

export const listMyFocusedTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const data = await listUserProjectTaskFocus(req.user.id);
    res.json({ success: true, data });
  } catch (e) {
    console.error('listMyFocusedTasks:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getProjectFocusedTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const data = await getUserProjectTaskFocus(req.user.id, req.params.id);
    res.json({ success: true, data });
  } catch (e) {
    console.error('getProjectFocusedTask:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const setProjectFocusedTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const { selectedTaskId, taskId } = req.body || {};
    const resolvedTaskId = selectedTaskId || taskId;
    if (!resolvedTaskId) {
      res.status(400).json({ success: false, message: 'selectedTaskId is required' });
      return;
    }
    const data = await setUserProjectTaskFocus(req.user.id, req.params.id, String(resolvedTaskId));
    res.json({ success: true, data });
  } catch (e: any) {
    console.error('setProjectFocusedTask:', e);
    res.status(400).json({ success: false, message: e?.message || 'Failed to save focus' });
  }
};

export const clearProjectFocusedTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    await clearUserProjectTaskFocus(req.user.id, req.params.id);
    res.json({ success: true, message: 'Task selection cleared' });
  } catch (e) {
    console.error('clearProjectFocusedTask:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
