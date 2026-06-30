import { getSocketIo } from '../utils/socketIo';
import {
  computeEmployeeWorkload,
  resolveDepartmentIdsForUsers,
} from './workload.service';

export type WorkloadRefreshPayload = {
  userIds: string[];
  departmentIds: string[];
  reason: string;
  at: string;
};

/**
 * Notify connected clients that workload data changed.
 * Frontend workload pages listen for `erp:workload:refresh` and re-fetch the matrix.
 */
export async function emitWorkloadRefresh(params: {
  userIds?: string[];
  departmentIds?: string[];
  reason: string;
}): Promise<void> {
  const io = getSocketIo();
  if (!io) return;

  const userIds = [...new Set((params.userIds ?? []).filter(Boolean))];
  let departmentIds = [...new Set((params.departmentIds ?? []).filter(Boolean))];

  if (!departmentIds.length && userIds.length) {
    departmentIds = await resolveDepartmentIdsForUsers(userIds);
  }

  const payload: WorkloadRefreshPayload = {
    userIds,
    departmentIds,
    reason: params.reason,
    at: new Date().toISOString(),
  };

  io.to('workload:managers').emit('erp:workload:refresh', payload);

  for (const deptId of departmentIds) {
    io.to(`workload:department:${deptId}`).emit('erp:workload:refresh', payload);
  }

  for (const userId of userIds) {
    const workload = await computeEmployeeWorkload(userId);
    if (workload) {
      io.to(`user:${userId}`).emit('erp:workload:update', {
        userId,
        workload,
        reason: params.reason,
        at: payload.at,
      });
    }
  }
}

/** Call after task assignee / status / rating / schedule changes. */
export async function notifyWorkloadForTaskChange(
  assigneeIds: Array<string | null | undefined>,
  reason: string,
): Promise<void> {
  const userIds = [...new Set(assigneeIds.filter((id): id is string => Boolean(id)))];
  if (!userIds.length) return;
  await emitWorkloadRefresh({ userIds, reason });
}
