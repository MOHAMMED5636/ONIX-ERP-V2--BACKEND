import {
  buildDisplayKeyIndex,
  resolveTaskIdFromDisplayKey,
} from './task-display-key';
import type { PrismaClient } from '@prisma/client';
import { TaskStatus, TaskWorkflowStatus } from '@prisma/client';

/** True when the task row itself is finished (status or workflow). */
export function isPredecessorRowCompleted(
  row: { status: TaskStatus; workflowStatus: string } | null | undefined,
): boolean {
  if (!row) return false;
  return (
    row.status === TaskStatus.COMPLETED ||
    row.status === TaskStatus.NOT_REQUIRED ||
    row.workflowStatus === 'COMPLETED'
  );
}

export type TaskRowForPredecessorResolve = {
  id: string;
  stableWorkSeq: number | null;
  taskOrder: number | null;
  parentTaskId: string | null;
  displayAnchorSeq?: number | null;
  displaySuffix?: string | null;
};

/** Parse UI keys such as `1-1`, `1.1`, or `1` (sub-only). */
export function parsePredecessorDisplayKey(key: string): { mainIndex: number; subIndex: number } | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\./g, '-');
  const parts = normalized
    .split('-')
    .map((p) => parseInt(p, 10))
    .filter((n) => Number.isFinite(n));
  if (parts.length === 0) return null;
  if (parts.length === 1) return { mainIndex: 1, subIndex: parts[0] };
  return { mainIndex: parts[0], subIndex: parts[parts.length - 1] };
}

export function buildPredecessorResolveIndex(
  rows: TaskRowForPredecessorResolve[],
): {
  roots: TaskRowForPredecessorResolve[];
  childrenByParentId: Map<string, TaskRowForPredecessorResolve[]>;
} {
  const roots: TaskRowForPredecessorResolve[] = [];
  const childrenByParentId = new Map<string, TaskRowForPredecessorResolve[]>();
  for (const row of rows) {
    if (!row.parentTaskId) {
      roots.push(row);
    } else {
      const list = childrenByParentId.get(row.parentTaskId) ?? [];
      list.push(row);
      childrenByParentId.set(row.parentTaskId, list);
    }
  }
  const sortRows = (a: TaskRowForPredecessorResolve, b: TaskRowForPredecessorResolve) =>
    (a.taskOrder ?? a.stableWorkSeq ?? 0) - (b.taskOrder ?? b.stableWorkSeq ?? 0);
  roots.sort(sortRows);
  for (const [pid, list] of childrenByParentId) {
    childrenByParentId.set(pid, [...list].sort(sortRows));
  }
  return { roots, childrenByParentId };
}

/** Map display key (e.g. `4-2`, `4-2A`) to a task id within the project tree. */
export function resolvePredecessorIdFromDisplayKey(
  key: string,
  index: ReturnType<typeof buildPredecessorResolveIndex>,
  opts?: {
    allRows?: TaskRowForPredecessorResolve[];
    projectNumber?: number;
  },
): string | null {
  if (opts?.allRows?.length && opts.projectNumber) {
    const taskById = new Map(opts.allRows.map((r) => [r.id, r]));
    const displayIndex = buildDisplayKeyIndex(opts.allRows, taskById, opts.projectNumber);
    const byDisplay = resolveTaskIdFromDisplayKey(key, displayIndex);
    if (byDisplay) return byDisplay;
  }

  const parsed = parsePredecessorDisplayKey(key);
  if (!parsed) return null;
  const { mainIndex, subIndex } = parsed;

  // Prefer work items under the primary main row (the root that has nested subtasks).
  const primaryRoot =
    [...index.roots]
      .sort(
        (a, b) =>
          (index.childrenByParentId.get(b.id)?.length ?? 0) -
          (index.childrenByParentId.get(a.id)?.length ?? 0),
      )
      .find((r) => (index.childrenByParentId.get(r.id)?.length ?? 0) > 0) ??
    index.roots[mainIndex - 1];

  if (primaryRoot) {
    const children = index.childrenByParentId.get(primaryRoot.id) ?? [];
    const sub = children[subIndex - 1];
    if (sub) return sub.id;
  }

  const main = index.roots[mainIndex - 1];
  if (main) {
    const children = index.childrenByParentId.get(main.id) ?? [];
    const sub = children[subIndex - 1];
    if (sub) return sub.id;
  }

  // Flat project-level rows (parentTaskId null): match AUTO # / stableWorkSeq
  const bySeq = index.roots.find(
    (t) => t.stableWorkSeq === subIndex || t.taskOrder === subIndex,
  );
  if (bySeq) return bySeq.id;

  // All work rows may be nested under any root — match by sibling order project-wide
  const allChildren: TaskRowForPredecessorResolve[] = [];
  for (const list of index.childrenByParentId.values()) {
    allChildren.push(...list);
  }
  allChildren.sort(
    (a, b) => (a.taskOrder ?? a.stableWorkSeq ?? 0) - (b.taskOrder ?? b.stableWorkSeq ?? 0),
  );
  return allChildren[subIndex - 1]?.id ?? null;
}

/**
 * Project save payloads often omit `predecessorId` on unchanged rows; use the DB value
 * when the field is not present so we do not clear WAITING_FOR_PREDECESSOR by mistake.
 * When only `predecessors` text (e.g. `1-1`) is sent, resolve it via `resolveFromKey`.
 */
export function effectivePredecessorIdForUpdate(
  predecessorIdInPayload: unknown,
  existingPredecessorId: string | null | undefined,
  predecessorsInPayload?: unknown,
  resolveFromKey?: (key: string) => string | null,
): string | null {
  if (predecessorIdInPayload !== undefined) {
    const v = predecessorIdInPayload;
    if (v === null || v === '') return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  }
  if (predecessorsInPayload !== undefined && resolveFromKey) {
    const key =
      predecessorsInPayload != null ? String(predecessorsInPayload).trim() : '';
    if (!key) return null;
    const resolved = resolveFromKey(key);
    if (resolved) return resolved;
  }
  if (existingPredecessorId) return existingPredecessorId;
  return null;
}

/** Resolve predecessor id using payload fields, then persisted row (assignee partial saves). */
export function resolveEffectivePredecessorForTaskRow(
  payload: { predecessorId?: unknown; predecessors?: unknown },
  existingRow: { predecessorId?: string | null; predecessors?: string | null } | null | undefined,
  resolveFromKey?: (key: string) => string | null,
): string | null {
  const predecessorsSource =
    payload.predecessors !== undefined
      ? payload.predecessors
      : existingRow?.predecessors;
  return effectivePredecessorIdForUpdate(
    payload.predecessorId,
    existingRow?.predecessorId,
    predecessorsSource,
    resolveFromKey,
  );
}

/** UI hint: task cannot start until predecessor is done. */
export function isTaskLockedByPredecessor(task: {
  predecessorId?: string | null;
  workflowStatus?: string | null;
  predecessors?: string | null;
  status?: string | null;
}): boolean {
  if (task.workflowStatus === 'WAITING_FOR_PREDECESSOR') return true;
  return false;
}

/** Same label the PM main table uses — assignee views must receive this in `status` too. */
export const WAITING_PREDECESSOR_UI_STATUS =
  'Waiting for predecessor task completion';

export function mapTaskStatusEnumToClientString(status: unknown): string {
  const s = String(status ?? '')
    .trim()
    .toUpperCase();
  if (s === 'IN_PROGRESS') return 'working';
  if (s === 'SUBMITTED_IN_PROGRESS') return 'submitted in progress';
  if (s === 'NOT_REQUIRED') return 'not required';
  if (s === 'COMPLETED') return 'done';
  // Standardize UI label: Kanban expects "Suspended" for ON_HOLD.
  if (s === 'ON_HOLD') return 'suspended';
  if (s === 'CANCELLED') return 'cancelled';
  if (s === 'PENDING') return 'not started';
  return String(status ?? 'not started');
}

/** Ensure assignee and PM APIs expose the same lock label on `status`. */
export function enrichTaskNodeForClient(task: any): any {
  const rowStatus = String(task?.status ?? '').trim().toUpperCase();
  const isSuspended = rowStatus === 'ON_HOLD';
  const locked = isTaskLockedByPredecessor(task) && !isSuspended;
  const nested = task?.subtasks;
  return {
    ...task,
    isLockedByPredecessor: locked,
    canChangeStatus: locked ? false : task?.canChangeStatus,
    status: locked
      ? WAITING_PREDECESSOR_UI_STATUS
      : mapTaskStatusEnumToClientString(task?.status),
    subtasks:
      nested && Array.isArray(nested) && nested.length > 0
        ? nested.map(enrichTaskNodeForClient)
        : nested,
  };
}

export function enrichTaskTreeForClient(tasks: any[] | undefined): any[] {
  if (!tasks || !Array.isArray(tasks)) return [];
  return tasks.map(enrichTaskNodeForClient);
}

/**
 * Main Table / employee tasks UI reads `childSubtasks` (not Prisma's `subtasks`).
 * Mirror nested tasks under both keys and expose explicit lock fields for the frontend.
 */
export function mapTaskNodeForMainTableClient(task: any): any {
  const enriched = enrichTaskNodeForClient(task);
  const nestedRaw = enriched.subtasks ?? enriched.childSubtasks;
  const nested =
    nestedRaw && Array.isArray(nestedRaw)
      ? nestedRaw.map(mapTaskNodeForMainTableClient)
      : [];

  const locked = !!enriched.isLockedByPredecessor;

  return {
    ...enriched,
    subtasks: nested,
    childSubtasks: nested,
    locked,
    predecessorLocked: locked,
    statusLabel: enriched.status,
    displayStatus: enriched.status,
    uiStatus: enriched.status,
  };
}

export function mapProjectTasksForMainTableClient(tasks: any[] | undefined): any[] {
  if (!tasks || !Array.isArray(tasks)) return [];
  return tasks.map(mapTaskNodeForMainTableClient);
}

/** `workflowStatus` for a row given whether its linked predecessor is already completed. */
export function workflowStatusFromPredecessorChain(
  rowStatus: TaskStatus,
  predecessorId: string | null,
  predecessorIsCompleted: boolean,
): TaskWorkflowStatus {
  if (rowStatus === TaskStatus.COMPLETED || rowStatus === TaskStatus.NOT_REQUIRED) {
    return TaskWorkflowStatus.COMPLETED;
  }
  if (!predecessorId) {
    return TaskWorkflowStatus.NOT_STARTED;
  }
  return predecessorIsCompleted
    ? TaskWorkflowStatus.NOT_STARTED
    : TaskWorkflowStatus.WAITING_FOR_PREDECESSOR;
}

/**
 * Match tasks.controller: do not advance to IN_PROGRESS/COMPLETED while predecessor is incomplete.
 * Used when saving via PUT project (bulk) so assignees cannot bypass the lock.
 */
export function clampTaskStatusAgainstIncompletePredecessor(
  status: TaskStatus,
  predecessorId: string | null,
  predecessorIsCompleted: boolean,
): TaskStatus {
  if (!predecessorId || predecessorIsCompleted) return status;
  // Never downgrade rows that are already finished (sync/save must not reset predecessors).
  if (status === TaskStatus.COMPLETED || status === TaskStatus.NOT_REQUIRED) {
    return status;
  }
  if (
    status === TaskStatus.IN_PROGRESS ||
    status === TaskStatus.SUBMITTED_IN_PROGRESS
  ) {
    return TaskStatus.PENDING;
  }
  return status;
}

/** True when the UI sent a stale label and we must not overwrite a completed DB row. */
export function shouldPreserveCompletedTaskStatusOnSave(
  existingRow: { status: TaskStatus; workflowStatus?: string | null } | null | undefined,
  rawStatusLabel: unknown,
  mappedStatus: TaskStatus,
): boolean {
  if (
    !existingRow ||
    !isPredecessorRowCompleted({
      status: existingRow.status,
      workflowStatus: existingRow.workflowStatus ?? '',
    })
  ) {
    return false;
  }
  if (
    mappedStatus === TaskStatus.COMPLETED ||
    mappedStatus === TaskStatus.NOT_REQUIRED
  ) {
    return false;
  }
  const raw =
    rawStatusLabel != null ? String(rawStatusLabel).trim().toLowerCase() : '';
  if (raw.startsWith('done') || raw === 'completed' || raw === 'not required') {
    return false;
  }
  return true;
}

/** Keep `workflowStatus` aligned with `status` after a status change. */
export function workflowStatusForSavedTaskStatus(
  status: TaskStatus,
  predecessorId: string | null,
  predecessorIsCompleted: boolean,
): TaskWorkflowStatus {
  if (status === TaskStatus.COMPLETED || status === TaskStatus.NOT_REQUIRED) {
    return TaskWorkflowStatus.COMPLETED;
  }
  // Explicit Suspended must persist across reload (do not keep WAITING_FOR_PREDECESSOR).
  if (status === TaskStatus.ON_HOLD) {
    return TaskWorkflowStatus.NOT_STARTED;
  }
  return workflowStatusFromPredecessorChain(
    status,
    predecessorId,
    predecessorIsCompleted,
  );
}

/**
 * Any task that waits on this predecessor and whose predecessor row is already
 * finished (status or workflow) should leave WAITING — fixes missed unlocks when
 * completion was saved with a non‑enum label (e.g. "Done - Open Next Phase").
 */
/**
 * Link `predecessors` display keys (e.g. `1-1`) to `predecessorId` and set WAITING_FOR_PREDECESSOR
 * when the predecessor row is not finished yet.
 */
export async function syncProjectPredecessorLinksFromDisplayKeys(
  db: Pick<PrismaClient, 'task' | 'project'>,
  projectId: string,
): Promise<number> {
  const [projectMeta, allRows] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { projectNumber: true } }),
    db.task.findMany({
      where: { projectId, deletedAt: null },
      select: {
        id: true,
        parentTaskId: true,
        stableWorkSeq: true,
        taskOrder: true,
        displayAnchorSeq: true,
        displaySuffix: true,
      },
    }),
  ]);
  const projectNumber = projectMeta?.projectNumber ?? 1;

  const rows = await db.task.findMany({
    where: {
      projectId,
      predecessors: { not: null },
    },
    select: {
      id: true,
      predecessors: true,
      predecessorId: true,
      status: true,
      workflowStatus: true,
      parentTaskId: true,
      stableWorkSeq: true,
      taskOrder: true,
      displayAnchorSeq: true,
      displaySuffix: true,
    },
  });
  if (rows.length === 0) return 0;

  const index = buildPredecessorResolveIndex(allRows);
  const resolveOpts = { allRows, projectNumber };
  let updated = 0;

  for (const row of rows) {
    const key = row.predecessors?.trim();
    if (!key) continue;

    const resolvedId =
      row.predecessorId ??
      resolvePredecessorIdFromDisplayKey(key, index, resolveOpts);
    if (!resolvedId || resolvedId === row.id) continue;

    const predRow = await db.task.findUnique({
      where: { id: resolvedId },
      select: { status: true, workflowStatus: true },
    });
    const predDone = isPredecessorRowCompleted(predRow);
    const nextWorkflow = workflowStatusFromPredecessorChain(
      row.status,
      resolvedId,
      predDone,
    );
    const nextStatus = clampTaskStatusAgainstIncompletePredecessor(
      row.status,
      resolvedId,
      predDone,
    );

    if (
      row.predecessorId !== resolvedId ||
      row.workflowStatus !== nextWorkflow ||
      row.status !== nextStatus
    ) {
      await db.task.update({
        where: { id: row.id },
        data: {
          predecessorId: resolvedId,
          workflowStatus: nextWorkflow,
          status: nextStatus,
        },
      });
      updated++;
    }
  }

  return updated;
}

export type UnlockedDependentRow = { id: string; projectId: string; title: string };

/**
 * When a predecessor finishes, unblock dependents still in WAITING_FOR_PREDECESSOR.
 * Returns rows that were actually updated so callers can write `project_activity_logs` after commit.
 */
export async function unlockDependentsWaitingOnFinishedPredecessor(
  db: Pick<PrismaClient, 'task'>,
  predecessorTaskId: string,
): Promise<UnlockedDependentRow[]> {
  const candidates = await db.task.findMany({
    where: {
      predecessorId: predecessorTaskId,
      predecessor: {
        OR: [{ status: 'COMPLETED' }, { workflowStatus: 'COMPLETED' }],
      },
    },
    select: {
      id: true,
      projectId: true,
      title: true,
      workflowStatus: true,
      status: true,
    },
  });
  const toUnblock = candidates.filter(
    (r) => r.workflowStatus === TaskWorkflowStatus.WAITING_FOR_PREDECESSOR,
  );
  if (toUnblock.length === 0) {
    return [];
  }
  await db.task.updateMany({
    where: { id: { in: toUnblock.map((r) => r.id) } },
    // IMPORTANT: also reset main `status` so UI "active" views don't treat it as completed.
    // `workflowStatus` alone controls edit-locking, but the UI visibility often uses `status`.
    data: { workflowStatus: 'NOT_STARTED', status: TaskStatus.PENDING },
  });
  return toUnblock.map((r) => ({ id: r.id, projectId: r.projectId, title: r.title }));
}
