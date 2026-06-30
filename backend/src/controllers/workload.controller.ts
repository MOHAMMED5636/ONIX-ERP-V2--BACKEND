import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  computeEmployeeWorkload,
  getDepartmentWorkloadMatrix,
  getEmployeeWorkloadProfile,
  getWorkloadMatrix,
  getWorkloadSettings,
} from '../services/workload.service';
import {
  isManagerWorkloadRole,
  listPeerProjectManagersForWorkload,
} from '../services/managerTeam.service';

const HR_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'HR', 'MANAGER', 'PROJECT_MANAGER']);

function isHrOrManager(role: string | undefined): boolean {
  return !!role && HR_ROLES.has(role);
}

function parseIdListParam(raw: unknown): string[] | undefined {
  if (raw == null || raw === '') return undefined;
  const text = Array.isArray(raw) ? raw.join(',') : String(raw);
  const ids = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

/**
 * GET /api/workload/matrix?companyIds=&departmentIds=&projectIds=&viewAsProjectManagerId=
 * Empty filters = all accessible companies / departments / manager projects.
 * Project managers may pass viewAsProjectManagerId to view a peer PM's team (read-only).
 */
export const getMatrix = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isHrOrManager(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }
    const companyIds = parseIdListParam(req.query.companyIds);
    const departmentIds = parseIdListParam(req.query.departmentIds);
    const projectIds = parseIdListParam(req.query.projectIds);
    const viewAsProjectManagerId =
      typeof req.query.viewAsProjectManagerId === 'string'
        ? req.query.viewAsProjectManagerId.trim()
        : undefined;
    const matrix = await getWorkloadMatrix({
      actorUserId: req.user!.id,
      actorRole: req.user?.role,
      companyIds,
      departmentIds,
      projectIds,
      viewAsProjectManagerId,
    });
    res.json({ success: true, data: matrix });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load workload matrix';
    if (message.includes('cannot view')) {
      res.status(403).json({ success: false, message });
      return;
    }
    console.error('getWorkloadMatrix error:', error);
    res.status(500).json({ success: false, message: 'Failed to load workload matrix' });
  }
};

/**
 * GET /api/workload/peer-managers
 * Lists other project managers in the same company (for read-only peer workload view).
 */
export const getPeerProjectManagers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isManagerWorkloadRole(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Project managers only' });
      return;
    }
    const peers = await listPeerProjectManagersForWorkload(req.user!.id);
    res.json({ success: true, data: peers });
  } catch (error) {
    console.error('getPeerProjectManagers error:', error);
    res.status(500).json({ success: false, message: 'Failed to load peer project managers' });
  }
};

/**
 * GET /api/departments/:id/workload
 */
export const getDepartmentWorkload = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isHrOrManager(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }
    const { id } = req.params;
    const matrix = await getDepartmentWorkloadMatrix(id);
    if (!matrix) {
      res.status(404).json({ success: false, message: 'Department not found' });
      return;
    }
    res.json({ success: true, data: matrix });
  } catch (error) {
    console.error('getDepartmentWorkload error:', error);
    res.status(500).json({ success: false, message: 'Failed to load department workload' });
  }
};

/**
 * GET /api/workload/employees/:userId
 */
export const getEmployeeWorkload = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const isSelf = req.user?.id === userId;
    if (!isSelf && !isHrOrManager(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }
    const profile = await getEmployeeWorkloadProfile(userId);
    if (!profile) {
      res.status(404).json({ success: false, message: 'Employee not found' });
      return;
    }
    res.json({ success: true, data: profile });
  } catch (error) {
    console.error('getEmployeeWorkload error:', error);
    res.status(500).json({ success: false, message: 'Failed to load employee workload' });
  }
};

/**
 * GET /api/workload/settings
 */
export const getSettings = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const settings = await getWorkloadSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('getWorkloadSettings error:', error);
    res.status(500).json({ success: false, message: 'Failed to load settings' });
  }
};

/**
 * PATCH /api/workload/settings — Admin only
 */
export const updateSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, message: 'Admin only' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const data: {
      workloadMonitoringCoefficient?: number;
      workloadSubtaskCoefficient?: number;
      workloadDefaultPlannedDays?: number;
      workloadEmployeeCapacity?: number;
      workloadOverloadUtilizationPercent?: number;
      workloadBalancedUtilizationMin?: number;
      workloadAvailableUtilizationMax?: number;
      workloadOverloadThreshold?: number;
      workloadBalancedMin?: number;
      workloadAvailableMax?: number;
    } = {};

    const numericFields: Array<{
      key: keyof typeof data;
      bodyKey: string;
      label: string;
      integer?: boolean;
    }> = [
      { key: 'workloadMonitoringCoefficient', bodyKey: 'monitoringCoefficient', label: 'monitoringCoefficient' },
      { key: 'workloadSubtaskCoefficient', bodyKey: 'subtaskCoefficient', label: 'subtaskCoefficient' },
      { key: 'workloadDefaultPlannedDays', bodyKey: 'defaultPlannedDays', label: 'defaultPlannedDays', integer: true },
      { key: 'workloadEmployeeCapacity', bodyKey: 'employeeCapacity', label: 'employeeCapacity' },
      {
        key: 'workloadOverloadUtilizationPercent',
        bodyKey: 'overloadUtilizationPercent',
        label: 'overloadUtilizationPercent',
      },
      {
        key: 'workloadBalancedUtilizationMin',
        bodyKey: 'balancedUtilizationMin',
        label: 'balancedUtilizationMin',
      },
      {
        key: 'workloadAvailableUtilizationMax',
        bodyKey: 'availableUtilizationMax',
        label: 'availableUtilizationMax',
      },
      { key: 'workloadOverloadThreshold', bodyKey: 'overloadThreshold', label: 'overloadThreshold' },
      { key: 'workloadBalancedMin', bodyKey: 'balancedMin', label: 'balancedMin' },
      { key: 'workloadAvailableMax', bodyKey: 'availableMax', label: 'availableMax' },
    ];

    for (const field of numericFields) {
      const raw = body[field.bodyKey];
      if (raw == null || raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        res.status(400).json({ success: false, message: `Invalid ${field.label}` });
        return;
      }
      data[field.key] = field.integer ? Math.max(1, Math.round(n)) : n;
    }

    let row = await prisma.organizationPreferences.findFirst();
    if (!row) {
      row = await prisma.organizationPreferences.create({ data: {} });
    }
    await prisma.organizationPreferences.update({
      where: { id: row.id },
      data: {
        ...data,
        updatedBy: req.user?.id ?? null,
      },
    });

    const settings = await getWorkloadSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('updateWorkloadSettings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
};

/**
 * POST /api/workload/reassign-preview — returns updated scores after reassign (used by drag-drop)
 * Body: { taskId, toEmployeeId }
 */
export const previewReassignWorkload = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isHrOrManager(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }
    const taskId = String(req.body?.taskId ?? '').trim();
    const toEmployeeId = String(req.body?.toEmployeeId ?? '').trim();
    if (!taskId || !toEmployeeId) {
      res.status(400).json({ success: false, message: 'taskId and toEmployeeId are required' });
      return;
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { assignedEmployeeId: true },
    });
    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    const fromId = task.assignedEmployeeId;
    const [fromWorkload, toWorkload] = await Promise.all([
      fromId ? computeEmployeeWorkload(fromId) : null,
      computeEmployeeWorkload(toEmployeeId),
    ]);

    res.json({
      success: true,
      data: {
        from: fromWorkload,
        to: toWorkload,
      },
    });
  } catch (error) {
    console.error('previewReassignWorkload error:', error);
    res.status(500).json({ success: false, message: 'Preview failed' });
  }
};
