import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import {
  formatWorkItemRef,
  resolveTaskDisplayId,
  type TaskIdChainRow,
} from '../utils/task-display-id';

/** Match assignee fields regardless of casing / spaces / snake_case (stored in activity JSON). */
function isAssigneeChangeField(field: unknown): boolean {
  const raw = String(field ?? '').trim();
  if (!raw) return false;
  const n = raw.replace(/\s+/g, '').replace(/_/g, '').toLowerCase();
  return (
    n === 'assignedemployeeid' ||
    n === 'assignedto' ||
    n === 'assigneeid' ||
    n === 'assignedemployee'
  );
}

const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function collectUserIdsFromChangeValue(v: unknown): string[] {
  if (v == null || v === '') return [];
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return [];
    if (UUID_LIKE.test(s)) return [s];
    // Loose fallback (legacy / non-standard ids)
    if (s.length >= 8 && /^[a-z0-9-]+$/i.test(s)) return [s];
  }
  return [];
}

function hydrateActivityMetadataWithLabelMap(
  metadata: Prisma.JsonValue | null | undefined,
  labelById: (id: string) => string,
  idSet: Set<string>,
): Prisma.JsonValue | null | undefined {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return metadata ?? undefined;
  }
  const m = metadata as Record<string, unknown>;
  const changes = m.changes;
  if (!Array.isArray(changes) || changes.length === 0) {
    return metadata;
  }

  const displayAssignee = (v: unknown): string => {
    if (v == null || v === '') return 'Unassigned';
    if (typeof v !== 'string') return String(v);
    const s = v.trim();
    if (UUID_LIKE.test(s)) return labelById(s);
    if (idSet.has(s) || idSet.has(s.toLowerCase())) return labelById(s);
    return s;
  };

  const newChanges = changes.map((ch) => {
    if (!ch || typeof ch !== 'object') return ch;
    const row = ch as { field: string; from: unknown; to: unknown };
    if (!isAssigneeChangeField(row.field)) return row;
    return {
      field: 'Employee name',
      from: displayAssignee(row.from),
      to: displayAssignee(row.to),
    };
  });

  return { ...m, changes: newChanges } as Prisma.JsonValue;
}

function collectAssigneeIdsFromMetadata(metadata: unknown): string[] {
  const ids: string[] = [];
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return ids;
  }
  const changes = (metadata as Record<string, unknown>).changes;
  if (!Array.isArray(changes)) return ids;
  for (const ch of changes) {
    if (!ch || typeof ch !== 'object') continue;
    const row = ch as { field?: unknown; from?: unknown; to?: unknown };
    if (!isAssigneeChangeField(row.field)) continue;
    for (const id of collectUserIdsFromChangeValue(row.from)) ids.push(id);
    for (const id of collectUserIdsFromChangeValue(row.to)) ids.push(id);
  }
  return ids;
}

/**
 * Batch-resolve assignee user IDs in activity log rows (one DB round-trip).
 */
function enrichActivitySummaryText(
  summary: string,
  taskTitle: string | null,
  taskDisplayId: string | null,
): string {
  if (!taskDisplayId) return summary;
  if (summary.includes(`(${taskDisplayId})`)) return summary;

  if (taskTitle) {
    const ref = formatWorkItemRef(taskTitle, taskDisplayId);
    const escaped = taskTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const quoted = new RegExp(`"${escaped}"(?!\\s*\\()`, 'g');
    if (quoted.test(summary)) {
      return summary.replace(quoted, ref);
    }
  }

  return `${summary} · Task ID ${taskDisplayId}`;
}

export async function resolveTaskDisplayIdForTaskId(
  projectId: string,
  taskId: string,
): Promise<{ displayId: string | null; title: string | null }> {
  const [project, allTasks] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { projectNumber: true } }),
    prisma.task.findMany({
      where: { projectId },
      select: {
        id: true,
        title: true,
        parentTaskId: true,
        stableWorkSeq: true,
        taskOrder: true,
        displayAnchorSeq: true,
        displaySuffix: true,
      },
    }),
  ]);
  const pn = project?.projectNumber;
  const task = allTasks.find((t) => t.id === taskId);
  if (!task || pn == null) {
    return { displayId: null, title: task?.title ?? null };
  }
  const taskById = new Map<string, TaskIdChainRow>(
    allTasks.map((t) => [t.id, t as TaskIdChainRow]),
  );
  return {
    displayId: resolveTaskDisplayId(task as TaskIdChainRow, taskById, pn),
    title: task.title,
  };
}

export async function hydrateProjectActivityItems<
  T extends {
    metadata: Prisma.JsonValue | null;
    taskId?: string | null;
    summary: string;
  },
>(items: T[], projectId?: string): Promise<
  (T & {
    taskDisplayId?: string | null;
    taskTitle?: string | null;
    displaySummary?: string;
  })[]
> {
  if (items.length === 0) return items;

  const allIds = new Set<string>();
  for (const row of items) {
    for (const id of collectAssigneeIdsFromMetadata(row.metadata)) {
      allIds.add(id);
    }
  }

  let labelById = (id: string): string => id;
  if (allIds.size > 0) {
    const idList = [...allIds];
    const users = await prisma.user.findMany({
      where: { id: { in: idList } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const map = new Map<string, string>();
    for (const u of users) {
      const n = `${u.firstName || ''} ${u.lastName || ''}`.trim();
      const label = n || u.email || u.id;
      map.set(u.id, label);
      map.set(u.id.toLowerCase(), label);
    }
    labelById = (id: string): string =>
      map.get(id) ?? map.get(id.trim().toLowerCase()) ?? 'Unknown user';
  }

  let taskById = new Map<string, TaskIdChainRow>();
  let projectNumber: number | null = null;
  const pid =
    projectId ??
    (items.find((r) => r.taskId)?.taskId
      ? (
          await prisma.task.findFirst({
            where: { id: items.find((r) => r.taskId)!.taskId! },
            select: { projectId: true },
          })
        )?.projectId
      : null);

  if (pid) {
    const [project, allTasks] = await Promise.all([
      prisma.project.findUnique({ where: { id: pid }, select: { projectNumber: true } }),
      prisma.task.findMany({
        where: { projectId: pid },
        select: {
          id: true,
          title: true,
          parentTaskId: true,
          stableWorkSeq: true,
          taskOrder: true,
          displayAnchorSeq: true,
          displaySuffix: true,
        },
      }),
    ]);
    projectNumber = project?.projectNumber ?? null;
    taskById = new Map(allTasks.map((t) => [t.id, t as TaskIdChainRow]));
  }

  return items.map((row) => {
    const metadata = hydrateActivityMetadataWithLabelMap(
      row.metadata,
      labelById,
      allIds,
    );
    const metaObj =
      metadata != null && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : {};
    const metaTitle =
      typeof metaObj.taskTitle === 'string' ? metaObj.taskTitle.trim() : '';

    let taskTitle: string | null = metaTitle || null;
    let taskDisplayId: string | null =
      typeof metaObj.taskDisplayId === 'string' ? metaObj.taskDisplayId : null;

    if (row.taskId && projectNumber != null) {
      const t = taskById.get(row.taskId);
      if (t) {
        taskTitle = taskTitle || t.title;
        taskDisplayId =
          taskDisplayId ?? resolveTaskDisplayId(t, taskById, projectNumber);
      }
    }

    const displaySummary = enrichActivitySummaryText(
      row.summary,
      taskTitle,
      taskDisplayId,
    );

    const nextMetadata =
      taskDisplayId || taskTitle
        ? ({
            ...metaObj,
            ...(taskTitle ? { taskTitle } : {}),
            ...(taskDisplayId ? { taskDisplayId } : {}),
          } as Prisma.JsonValue)
        : metadata;

    return {
      ...row,
      metadata: nextMetadata,
      taskDisplayId,
      taskTitle,
      displaySummary,
    };
  });
}

/**
 * The task row itself plus every descendant under it (same `projectId`).
 * Used to scope project activity to one Main Table row / subtask brief.
 */
const ACTIVITY_FIELD_LABELS: Record<string, string> = {
  title: 'Task name',
  status: 'State',
  workflowStatus: 'Workflow state',
  priority: 'Priority',
  startDate: 'Start date',
  dueDate: 'Planned deadline',
  completedAt: 'Completed at',
  assignedEmployeeId: 'Assignee',
  remarks: 'Remarks',
  assigneeNotes: 'Assignee notes',
  predecessors: 'Predecessors',
  predecessorId: 'Predecessor',
  referenceNumber: 'Reference',
  planDays: 'Plan days',
  category: 'Category',
  reversionReason: 'Reopen reason',
  statusChangeReason: 'Reason',
};

function formatActivityChangeValue(field: string, v: unknown): string {
  if (v == null || v === '') return '—';
  if (field === 'status' || field === 'workflowStatus') {
    return String(v).replace(/_/g, ' ');
  }
  if (v instanceof Date) return v.toLocaleDateString();
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
  }
  return s;
}

/** Human-readable lines for drawer Task History (from `metadata.changes`). */
export function formatActivityChangeLines(metadata: unknown): string[] {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const changes = (metadata as Record<string, unknown>).changes;
  if (!Array.isArray(changes)) return [];
  const lines: string[] = [];
  for (const ch of changes) {
    if (!ch || typeof ch !== 'object') continue;
    const row = ch as { field?: unknown; from?: unknown; to?: unknown };
    const fieldKey = String(row.field ?? '');
    const label = ACTIVITY_FIELD_LABELS[fieldKey] || fieldKey || 'Field';
    const from = formatActivityChangeValue(fieldKey, row.from);
    const to = formatActivityChangeValue(fieldKey, row.to);
    lines.push(`${label} changed from (${from}) to (${to})`);
  }
  return lines;
}

export async function collectTaskSubtreeTaskIds(rootTaskId: string, projectId: string): Promise<string[]> {
  const ids = new Set<string>([rootTaskId]);
  let frontier: string[] = [rootTaskId];
  while (frontier.length > 0) {
    const children = await prisma.task.findMany({
      where: { projectId, parentTaskId: { in: frontier } },
      select: { id: true },
    });
    frontier = [];
    for (const c of children) {
      if (!ids.has(c.id)) {
        ids.add(c.id);
        frontier.push(c.id);
      }
    }
  }
  return [...ids];
}

export async function logProjectActivity(params: {
  projectId: string;
  actorId: string | null | undefined;
  action: string;
  taskId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.projectActivityLog.create({
      data: {
        projectId: params.projectId,
        actorId: params.actorId ?? null,
        action: params.action.slice(0, 64),
        taskId: params.taskId ?? null,
        summary: params.summary.slice(0, 600),
        metadata: params.metadata != null ? (params.metadata as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (e) {
    console.error('logProjectActivity failed', e);
  }
}

export async function userShortLabel(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, email: true },
  });
  if (!u) return null;
  const n = `${u.firstName || ''} ${u.lastName || ''}`.trim();
  return n || u.email || userId;
}

/** Compare persisted task row to Prisma update payload; returns human-readable field changes. */
export function collectTaskChanges(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): { field: string; from: unknown; to: unknown }[] {
  const changes: { field: string; from: unknown; to: unknown }[] = [];
  const skip = new Set(['updatedAt', 'tags']);
  for (const key of Object.keys(patch)) {
    if (skip.has(key)) continue;
    if (patch[key] === undefined) continue;
    let prev: unknown = before[key];
    let next: unknown = patch[key];
    if (prev instanceof Date) prev = prev.toISOString();
    if (next instanceof Date) next = next.toISOString();
    if (prev === next) continue;
    if (prev == null && next == null) continue;
    changes.push({ field: key, from: prev ?? null, to: next ?? null });
  }
  return changes;
}

/**
 * Diff for activity logging after a successful `task.update`: compares `before` to the
 * **persisted** values for every key present in `patch` (avoids false "no change" when request
 * payload types differ from DB/Prisma return types).
 */
export function collectTaskChangesAfterPersist(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
  persisted: Record<string, unknown>,
): { field: string; from: unknown; to: unknown }[] {
  const shaped: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    if (key === 'updatedAt' || key === 'tags') continue;
    if (patch[key] === undefined) continue;
    shaped[key] = persisted[key];
  }
  return collectTaskChanges(before, shaped);
}

type TaskNode = {
  id: string;
  title: string;
  parentTaskId: string | null;
  assignedEmployeeId: string | null;
  subtasks?: TaskNode[];
};

/**
 * Log each row in a nested task tree after createTask API (root + subtasks + children).
 */
export async function logTaskTreeCreated(
  projectId: string,
  actorId: string | null | undefined,
  root: TaskNode,
): Promise<void> {
  async function walk(node: TaskNode, parentIsRoot: boolean): Promise<void> {
    let action: string;
    if (node.parentTaskId == null) {
      action = 'MAIN_TASK_ROW_CREATED';
    } else if (parentIsRoot) {
      action = 'SUBTASK_CREATED';
    } else {
      action = 'CHILD_TASK_CREATED';
    }
    const assigneeName = await userShortLabel(node.assignedEmployeeId);
    const assigneePart = assigneeName ? ` · Assignee: ${assigneeName}` : '';
    const { displayId, title } = await resolveTaskDisplayIdForTaskId(projectId, node.id);
    await logProjectActivity({
      projectId,
      actorId,
      action,
      taskId: node.id,
      summary: `Added ${formatWorkItemRef(title ?? node.title, displayId)}${assigneePart}`,
      metadata: {
        taskTitle: title ?? node.title,
        taskDisplayId: displayId ?? undefined,
        assigneeId: node.assignedEmployeeId,
        assigneeName: assigneeName ?? undefined,
      },
    });
    const nextParentIsRoot = node.parentTaskId == null;
    for (const ch of node.subtasks || []) {
      await walk(ch, nextParentIsRoot);
    }
  }
  await walk(root, false);
}
