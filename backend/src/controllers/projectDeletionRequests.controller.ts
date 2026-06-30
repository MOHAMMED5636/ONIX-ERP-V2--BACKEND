import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  approveProjectDeletionRequest,
  getMyActiveDeletionRequest,
  listProjectDeletionRequestsForAdmin,
  regenerateProjectDeletionOtp,
  rejectProjectDeletionRequest,
} from '../services/projectDeletionApproval.service';

function isAdminRole(role: string | undefined): boolean {
  const r = String(role || '').trim().toUpperCase();
  return r === 'ADMIN' || r === 'SUPER_ADMIN';
}

/** GET /api/project-deletion-requests — Admin/Super Admin inbox */
export const listDeletionRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isAdminRole(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Admin access required' });
      return;
    }
    const status = String(req.query.status || 'active').trim();
    const data = await listProjectDeletionRequestsForAdmin(status === 'active' ? undefined : status);
    res.json({ success: true, data });
  } catch (error) {
    console.error('listDeletionRequests error:', error);
    res.status(500).json({ success: false, message: 'Failed to load deletion requests' });
  }
};

/** GET /api/project-deletion-requests/mine — requester status */
export const getMyDeletionRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    const data = await getMyActiveDeletionRequest(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    console.error('getMyDeletionRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to load your deletion request' });
  }
};

/** POST /api/project-deletion-requests/:requestId/approve */
export const approveDeletionRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { requestId } = req.params;
    const result = await approveProjectDeletionRequest(requestId, req);
    if (!result.success) {
      res.status(400).json({ success: false, message: result.message });
      return;
    }
    res.json({ success: true, message: result.message, data: result.data });
  } catch (error) {
    console.error('approveDeletionRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve deletion request' });
  }
};

/** POST /api/project-deletion-requests/:requestId/reject */
export const rejectDeletionRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { requestId } = req.params;
    const reason = String(req.body?.reason || '').trim() || undefined;
    const result = await rejectProjectDeletionRequest(requestId, req, reason);
    if (!result.success) {
      res.status(400).json({ success: false, message: result.message });
      return;
    }
    res.json({ success: true, message: result.message });
  } catch (error) {
    console.error('rejectDeletionRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject deletion request' });
  }
};

/** POST /api/project-deletion-requests/:requestId/regenerate-otp */
export const regenerateDeletionOtp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { requestId } = req.params;
    const result = await regenerateProjectDeletionOtp(requestId, req);
    if (!result.success) {
      res.status(400).json({ success: false, message: result.message });
      return;
    }
    res.json({ success: true, message: result.message, data: result.data });
  } catch (error) {
    console.error('regenerateDeletionOtp error:', error);
    res.status(500).json({ success: false, message: 'Failed to regenerate OTP' });
  }
};
