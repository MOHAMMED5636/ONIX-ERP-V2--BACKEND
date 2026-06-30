import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  acknowledgePmAssignments,
  isPmInboxRole,
  listUnseenPmAssignments,
} from '../services/projectPmAssignmentNotice.service';

export const getPmAssignmentInbox = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id || !isPmInboxRole(req.user.role)) {
      res.json({ success: true, data: { count: 0, items: [] } });
      return;
    }

    const rows = await listUnseenPmAssignments(req.user.id);
    res.json({
      success: true,
      data: {
        count: rows.length,
        items: rows.map((row) => ({
          projectId: row.projectId,
          referenceNumber: row.project.referenceNumber,
          projectNumber: row.project.projectNumber,
          name: row.project.name,
          status: row.project.status,
          source: row.source,
          assignedAt: row.notifiedAt,
        })),
      },
    });
  } catch (e) {
    console.error('getPmAssignmentInbox:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const acknowledgePmAssignmentsEndpoint = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const projectIds = Array.isArray(req.body?.projectIds)
      ? req.body.projectIds.filter((id: unknown) => typeof id === 'string' && id.trim())
      : undefined;

    await acknowledgePmAssignments(req.user.id, projectIds);
    res.json({ success: true, message: 'Assignments acknowledged' });
  } catch (e) {
    console.error('acknowledgePmAssignments:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
