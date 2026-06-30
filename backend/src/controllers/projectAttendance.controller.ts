import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  ProjectAttendanceError,
  formatSiteLog,
  getProjectLaborCost,
  listOpenSiteShifts,
  listProjectSiteLogs,
  listActiveSiteProjects,
  listLaborWorkersForSite,
  sitePunchIn,
  sitePunchOut,
} from '../services/projectAttendance.service';

function handleError(res: Response, err: unknown): void {
  if (err instanceof ProjectAttendanceError) {
    res.status(err.status).json({
      success: false,
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }
  console.error('[projectAttendance]', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
}

/** POST /api/attendance/site/punch-in */
export async function punchInSite(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { employeeId, projectId, latitude, longitude, faceImage, faceMatchScore } = req.body;

    const result = await sitePunchIn({
      actorId: userId,
      employeeId,
      projectId,
      latitude,
      longitude,
      faceImage,
      faceMatchScore,
    });

    res.status(201).json({
      success: true,
      message: 'Site punch-in recorded',
      data: {
        log: formatSiteLog(result.log),
        site: result.site,
      },
    });
  } catch (err) {
    handleError(res, err);
  }
}

/** POST /api/attendance/site/punch-out */
export async function punchOutSite(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { employeeId, projectId, latitude, longitude } = req.body;

    const result = await sitePunchOut({
      actorId: userId,
      employeeId,
      projectId,
      latitude,
      longitude,
    });

    res.json({
      success: true,
      message: 'Site punch-out recorded',
      data: {
        log: formatSiteLog(result.log),
      },
    });
  } catch (err) {
    handleError(res, err);
  }
}

/** GET /api/attendance/site/projects/:projectId/cost */
export async function getSiteProjectCost(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { projectId } = req.params;
    const data = await getProjectLaborCost(projectId);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
}

/** GET /api/attendance/site/projects/:projectId/logs */
export async function getSiteProjectLogs(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { projectId } = req.params;
    const limit = parseInt(String(req.query.limit ?? '100'), 10);
    const logs = await listProjectSiteLogs(projectId, limit);
    res.json({
      success: true,
      data: logs.map(formatSiteLog),
    });
  } catch (err) {
    handleError(res, err);
  }
}

/** GET /api/attendance/site/open */
export async function getOpenSiteShifts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const logs = await listOpenSiteShifts(projectId);
    res.json({
      success: true,
      data: logs.map(formatSiteLog),
    });
  } catch (err) {
    handleError(res, err);
  }
}

/** GET /api/attendance/site/projects */
export async function getActiveSiteProjects(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await listActiveSiteProjects();
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
}

/** GET /api/attendance/site/labor-workers */
export async function getLaborWorkersForSite(req: AuthRequest, res: Response): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const data = await listLaborWorkersForSite(search);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
}
