import { TaskStatus, TaskWorkflowStatus } from '@prisma/client';
import prisma from '../config/database';
import { computeNextStableWorkSeq } from '../utils/project-number';
import {
  assertNoPredecessorCycle,
  type PredecessorEdge,
} from '../utils/task-dependency-graph';
import {
  isPredecessorRowCompleted,
  workflowStatusFromPredecessorChain,
  clampTaskStatusAgainstIncompletePredecessor,
} from '../utils/task-predecessor-unlock';
import {
  allocateNextDecimalSuffix,
  repairInsertedTaskDisplayKeys,
  resolveDisplayAnchorSeq,
} from '../utils/task-display-key';
import { logProjectActivity, userShortLabel } from './projectActivity.service';
import { resolveTaskDisplayIdForTaskId } from './projectActivity.service';

export type InsertDependencyMode = 'keep_existing' | 'insert_into_chain';

export type InsertTaskAfterParams = {
  projectId: string;
  insertAfterTaskId: string;
  title: string;
  dependencyMode?: InsertDependencyMode;
  actorId: string;
  parentTaskId?: string | null;
  category?: string | null;
  priority?: string | null;
  planDays?: number | null;
  assignedEmployeeId?: string | null;
  phase?: string | null;
};

export type InsertTaskAfterResult = {
  task: {
    id: string;
    title: string;
    taskOrder: number | null;
    stableWorkSeq: number | null;
    predecessorId: string | null;
    predecessors: string | null;
    workflowStatus: string;
    status: TaskStatus;
  };
  dependencyChanges: Array<{
    taskId: string;
    oldPredecessorId: string | null;
    newPredecessorId: string | null;
  }>;
};

const TASK_MANAGEMENT_ROLES = new Set([
  'ADMIN',
  'HR',
  'MANAGER',
  'PROJECT_MANAGER',
  'SUPER_ADMIN',
]);

function orderValue(row: { taskOrder: number | null; stableWorkSeq: number | null }): number {
  if (row.taskOrder != null && Number.isFinite(row.taskOrder)) return row.taskOrder;
  if (row.stableWorkSeq != null && Number.isFinite(row.stableWorkSeq)) return row.stableWorkSeq;
  return 0;
}

function isTaskFinished(status: TaskStatus): boolean {
  return status === TaskStatus.COMPLETED || status === TaskStatus.NOT_REQUIRED;
}

/**
 * Insert a work row after an existing sibling using `taskOrder` positioning.
 * Display task numbers (`stableWorkSeq`) stay permanent; list order follows `taskOrder`.
 */
export async function insertTaskAfter(
  params: InsertTaskAfterParams,
): Promise<InsertTaskAfterResult> {
  const {
    projectId,
    insertAfterTaskId,
    title,
    dependencyMode = 'insert_into_chain',
    actorId,
    parentTaskId = null,
    category,
    priority,
    planDays,
    assignedEmployeeId,
    phase,
  } = params;

  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle) {
    const err = new Error('Task title is required.') as Error & { code: string; statusCode: number };
    err.code = 'VALIDATION_ERROR';
    err.statusCode = 400;
    throw err;
  }

  const afterRow = await prisma.task.findFirst({
    where: { id: insertAfterTaskId, projectId, deletedAt: null },
    select: {
      id: true,
      projectId: true,
      parentTaskId: true,
      taskOrder: true,
      stableWorkSeq: true,
      displayAnchorSeq: true,
      displaySuffix: true,
      status: true,
      workflowStatus: true,
      title: true,
    },
  });

  if (!afterRow) {
    const err = new Error('Reference task not found in this project.') as Error & {
      code: string;
      statusCode: number;
    };
    err.code = 'NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const effectiveParentId = parentTaskId ?? afterRow.parentTaskId ?? null;
  if (String(afterRow.parentTaskId ?? '') !== String(effectiveParentId ?? '')) {
    const err = new Error('Insert position must be within the same task hierarchy level.') as Error & {
      code: string;
      statusCode: number;
    };
    err.code = 'INVALID_INSERT_POSITION';
    err.statusCode = 400;
    throw err;
  }

  const siblings = await prisma.task.findMany({
    where: {
      projectId,
      parentTaskId: effectiveParentId,
      deletedAt: null,
    },
    select: {
      id: true,
      predecessorId: true,
      taskOrder: true,
      stableWorkSeq: true,
      displayAnchorSeq: true,
      displaySuffix: true,
      status: true,
      workflowStatus: true,
      title: true,
    },
    orderBy: [{ taskOrder: 'asc' }, { stableWorkSeq: 'asc' }, { createdAt: 'asc' }],
  });

  const afterOrder = orderValue(afterRow);
  const newTaskOrder = afterOrder + 1;

  const dependencyChanges: InsertTaskAfterResult['dependencyChanges'] = [];
  let newPredecessorId: string | null = null;

  if (dependencyMode === 'insert_into_chain') {
    newPredecessorId = afterRow.id;
    const edges: PredecessorEdge[] = siblings.map((s) => ({
      id: s.id,
      predecessorId: s.predecessorId,
    }));
    edges.push({ id: '__new__', predecessorId: newPredecessorId });
    assertNoPredecessorCycle(
      edges.map((e) => (e.id === '__new__' ? { ...e, id: 'pending-new' } : e)),
      'pending-new',
      newPredecessorId,
    );
  }

  const projectMeta = await prisma.project.findUnique({
    where: { id: projectId },
    select: { projectNumber: true },
  });
  const projectNumber = projectMeta?.projectNumber ?? 1;

  const result = await prisma.$transaction(async (tx) => {
    const toBump = siblings.filter((s) => orderValue(s) >= newTaskOrder);
    for (const row of toBump) {
      await tx.task.update({
        where: { id: row.id },
        data: { taskOrder: orderValue(row) + 1 },
      });
    }

    const stableWorkSeq = await computeNextStableWorkSeq(tx, projectId, effectiveParentId);

    const anchorSeq = resolveDisplayAnchorSeq(projectNumber, afterRow);
    const usedSuffixes = siblings
      .filter(
        (s) =>
          s.displaySuffix &&
          resolveDisplayAnchorSeq(projectNumber, s) === anchorSeq,
      )
      .map((s) => String(s.displaySuffix));
    const displaySuffix = allocateNextDecimalSuffix(usedSuffixes);

    const predDone = isPredecessorRowCompleted(afterRow);
    const initialStatus = TaskStatus.PENDING;
    const initialWorkflow =
      dependencyMode === 'insert_into_chain' && newPredecessorId && !predDone
        ? TaskWorkflowStatus.WAITING_FOR_PREDECESSOR
        : TaskWorkflowStatus.NOT_STARTED;

    const created = await tx.task.create({
      data: {
        projectId,
        parentTaskId: effectiveParentId,
        title: trimmedTitle,
        category: category?.trim() || phase?.trim() || 'Design',
        priority: (priority as any) || 'MEDIUM',
        planDays: planDays != null && Number.isFinite(Number(planDays)) ? Number(planDays) : 1,
        assignedEmployeeId: assignedEmployeeId || null,
        stableWorkSeq,
        displayAnchorSeq: anchorSeq,
        displaySuffix,
        taskOrder: newTaskOrder,
        predecessorId: newPredecessorId,
        predecessors: null,
        status: initialStatus,
        workflowStatus: initialWorkflow,
        createdBy: actorId,
      },
      select: {
        id: true,
        title: true,
        taskOrder: true,
        stableWorkSeq: true,
        displayAnchorSeq: true,
        displaySuffix: true,
        predecessorId: true,
        predecessors: true,
        workflowStatus: true,
        status: true,
      },
    });

    if (dependencyMode === 'insert_into_chain' && newPredecessorId) {
      const directSuccessors = siblings.filter(
        (s) => s.predecessorId === afterRow.id && !isTaskFinished(s.status),
      );

      const allEdges: PredecessorEdge[] = [
        ...siblings.map((s) => ({ id: s.id, predecessorId: s.predecessorId })),
        { id: created.id, predecessorId: created.predecessorId },
      ];

      for (const succ of directSuccessors) {
        assertNoPredecessorCycle(allEdges, succ.id, created.id);
        const predRow = await tx.task.findUnique({
          where: { id: created.id },
          select: { status: true, workflowStatus: true },
        });
        const succPredDone = isPredecessorRowCompleted(predRow);
        const nextWorkflow = workflowStatusFromPredecessorChain(
          succ.status,
          created.id,
          succPredDone,
        );
        const nextStatus = clampTaskStatusAgainstIncompletePredecessor(
          succ.status,
          created.id,
          succPredDone,
        );

        dependencyChanges.push({
          taskId: succ.id,
          oldPredecessorId: succ.predecessorId,
          newPredecessorId: created.id,
        });

        await tx.task.update({
          where: { id: succ.id },
          data: {
            predecessorId: created.id,
            workflowStatus: nextWorkflow,
            status: nextStatus,
          },
        });

        const edge = allEdges.find((e) => e.id === succ.id);
        if (edge) edge.predecessorId = created.id;
      }
    }

    return created;
  });

  await repairInsertedTaskDisplayKeys(prisma, projectId, effectiveParentId, projectNumber);

  const actorLabel = (await userShortLabel(actorId)) || 'User';
  const afterDisplay = await resolveTaskDisplayIdForTaskId(projectId, insertAfterTaskId);
  const newDisplay = await resolveTaskDisplayIdForTaskId(projectId, result.id);

  await logProjectActivity({
    projectId,
    actorId,
    action: 'TASK_INSERTED_BETWEEN',
    taskId: result.id,
    summary: `${actorLabel} inserted task "${result.title}" after ${afterDisplay.displayId || insertAfterTaskId} (${dependencyMode === 'insert_into_chain' ? 'chain updated' : 'dependencies unchanged'})`,
    metadata: {
      dependencyMode,
      insertAfterTaskId,
      insertAfterDisplayId: afterDisplay.displayId,
      insertAfterTitle: afterRow.title,
      newTaskId: result.id,
      newTaskDisplayId: newDisplay.displayId,
      newTaskOrder: result.taskOrder,
      newStableWorkSeq: result.stableWorkSeq,
      newPredecessorId: result.predecessorId,
      dependencyChanges,
      timestamp: new Date().toISOString(),
    },
  });

  for (const change of dependencyChanges) {
    const succDisplay = await resolveTaskDisplayIdForTaskId(projectId, change.taskId);
    await logProjectActivity({
      projectId,
      actorId,
      action: 'DEPENDENCY_REWIRED',
      taskId: change.taskId,
      summary: `${actorLabel} rewired predecessor for task ${succDisplay.displayId || change.taskId}: ${change.oldPredecessorId || 'none'} → ${change.newPredecessorId || 'none'}`,
      metadata: {
        taskId: change.taskId,
        taskDisplayId: succDisplay.displayId,
        oldPredecessorId: change.oldPredecessorId,
        newPredecessorId: change.newPredecessorId,
        reason: 'insert_into_chain',
        insertedTaskId: result.id,
        timestamp: new Date().toISOString(),
      },
    });
  }

  return { task: result, dependencyChanges };
}

export function assertTaskManagementRole(role: string | undefined | null): void {
  const normalized = String(role || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (!TASK_MANAGEMENT_ROLES.has(normalized)) {
    const err = new Error(
      'Only Project Managers and administrators can insert tasks or modify dependencies.',
    ) as Error & { code: string; statusCode: number };
    err.code = 'ACCESS_DENIED';
    err.statusCode = 403;
    throw err;
  }
}
