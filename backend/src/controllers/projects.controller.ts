import { Request, Response } from 'express';
import prisma from '../config/database';
import {
  mainTaskVisibleToAssignedEmployeeInProject,
  taskRowAssignedToEmployee,
  isTaskNodeAssignedToEmployee,
} from '../utils/employee-task-involvement';
import { AuthRequest } from '../middleware/auth.middleware';
import { ProjectStatus, TaskStatus, TaskPriority } from '@prisma/client';
import {
  computeTaskPermissions,
  mapTaskTreeWithPermissions,
  MESSAGE_NO_PERMISSION_DELETE_TASK,
} from '../utils/task-permissions';
import { resolveUserManagesProject } from '../utils/project-pm-ownership';
import {
  unlockDependentsWaitingOnFinishedPredecessor,
  workflowStatusFromPredecessorChain,
  clampTaskStatusAgainstIncompletePredecessor,
  isPredecessorRowCompleted,
  buildPredecessorResolveIndex,
  resolvePredecessorIdFromDisplayKey,
  syncProjectPredecessorLinksFromDisplayKeys,
  resolveEffectivePredecessorForTaskRow,
  mapProjectTasksForMainTableClient,
  shouldPreserveCompletedTaskStatusOnSave,
  workflowStatusForSavedTaskStatus,
} from '../utils/task-predecessor-unlock';
import { applyEffortFieldsFromPayload, applyRatingFromPayload } from '../utils/task-effort-fields';
import { loadReferencePlanDaysData, ReferencePlanDays, resolvePlanDaysForTaskTitle, resolveCategoryForTaskTitle, resolvePriorityForTaskTitle, resolveAssigneeIdForTaskTitle, applyReferenceTemplateToTaskRow, applyReferenceTemplateToTaskTree, isReferenceProjectRef, REFERENCE_PROJECT_REF } from '../utils/default-plan-days';
import {
  listRecoverableDeletions,
  purgeExpiredSoftDeletions,
  permanentlyDeleteProjectFromTrash,
  permanentlyDeleteTasksFromTrash,
  restoreProject,
  restoreTask,
  softDeleteProject,
  softDeleteTasks,
} from '../services/deletion-recovery.service';
import { DELETION_RECOVERY_HOURS } from '../utils/deletion-recovery';
import { maybeAwardXpForStatusTransition } from '../services/gamification.service';
import { mapFrontendTaskStatusToEnum } from '../utils/taskStatusMap';
import {
  extractStatusReversionReason,
  isTaskStatusChanged,
  processPmTaskStatusChangeNotification,
} from '../services/taskStatusReversion.service';
import { maybeNotifyTaskNotesFromSave } from '../services/taskNotesNotify.service';
import {
  notifyProjectManagerAssignedEmail,
  resolveProjectManagerUser,
} from '../services/emailDispatch.service';
import { userCanUnlockCompletedTask } from '../utils/task-permissions';
import { notifyPmProjectAssignment } from '../services/projectPmAssignmentNotice.service';

/** Assignee auto-save must not return stale project/task payloads from browser cache. */
function setNoCacheJson(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}
import { computeNextProjectNumber, computeNextStableWorkSeq, computeNextMainDisplaySeq } from '../utils/project-number';
import {
  isProjectSuspendedStatus,
  PROJECT_SUSPENDED_MESSAGE,
  userCanReactivateSuspendedProject,
} from '../utils/project-suspension';
import {
  requiresProjectDeletionOtp,
  managerCanAccessProjectForDeletion,
  requestProjectDeletion as createProjectDeletionRequest,
  validateAndConsumeDeletionOtp as consumeDeletionOtp,
  markDeletionRequestDeleted,
  executeProjectDeletionInTransaction,
} from '../services/projectDeletionApproval.service';
import {
  logProjectActivity,
  collectTaskChanges,
  collectTaskChangesAfterPersist,
  userShortLabel,
  hydrateProjectActivityItems,
  collectTaskSubtreeTaskIds,
  formatActivityChangeLines,
  resolveTaskDisplayIdForTaskId,
} from '../services/projectActivity.service';
import { formatWorkItemRef } from '../utils/task-display-id';
import {
  resolveCompanyAccessScope,
  roleUsesCompanyAccessScope,
} from '../services/companyAccess.service';
import {
  buildProjectWhereForCompanyScope,
  mergeProjectScopeIntoWhere,
  projectMatchesCompanyScope,
} from '../utils/contractBranchFilter';
import { getManagerTransferScope } from '../services/projectManagerTransfer.service';
import { repairInsertedTaskDisplayKeys, compactMainRowStableWorkSeq } from '../utils/task-display-key';
import {
  insertTaskAfter,
  assertTaskManagementRole,
  type InsertDependencyMode,
} from '../services/taskInsert.service';

const projectDebugLog = (...args: unknown[]) => {
  if (process.env.DEBUG_PROJECTS === 'true') console.log(...args);
};

/** Main Table row order: execution order first, then permanent display slot, then creation time. */
const TASK_ORDER_THEN_CREATED_AT = [
  { taskOrder: 'asc' as const },
  { stableWorkSeq: 'asc' as const },
  { createdAt: 'asc' as const },
] as const;

/** User fields for avatar display in Main Table / project chat. */
const USER_AVATAR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  photo: true,
} as const;

function looksLikeUuid(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/** Align JWT / legacy role strings with UserRole-style comparisons (mirrors frontend normalizeErpRole). */
function normalizeErpRole(role: unknown): string {
  if (role == null || role === '') return '';
  const collapsed = String(role).trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (collapsed === 'SUPERADMIN') return 'SUPER_ADMIN';
  // In this ERP, PROJECT_MANAGER should behave like MANAGER for scoping rules.
  if (collapsed === 'PROJECT_MANAGER') return 'MANAGER';
  return collapsed;
}

async function resolveAssigneeUserId(raw: any): Promise<string | null> {
  if (!raw) return null;
  if (looksLikeUuid(raw)) return raw;
  if (typeof raw !== 'string') return null;

  const s = raw.trim();
  if (!s) return null;

  // Email
  if (s.includes('@')) {
    const u = await prisma.user.findUnique({ where: { email: s }, select: { id: true } });
    return u?.id ?? null;
  }

  // "First Last" name
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    const u = await prisma.user.findFirst({
      where: {
        firstName: { equals: firstName, mode: 'insensitive' },
        lastName: { equals: lastName, mode: 'insensitive' },
      },
      select: { id: true },
    });
    return u?.id ?? null;
  }

  return null;
}

// Main Table sends "on hold" for Suspended; keep mapping in sync with taskStatusMap.ts
function mapStatusToTaskStatus(status: unknown): TaskStatus {
  return mapFrontendTaskStatusToEnum(status);
}

function normalizeProjectStatusValue(status: unknown): ProjectStatus | undefined {
  if (status == null) return undefined;
  const raw = String(status).trim();
  if (!raw) return undefined;
  const s = raw.toUpperCase().replace(/[\s-]+/g, '_');
  const statusMap: Record<string, ProjectStatus> = {
    OPEN: ProjectStatus.OPEN,
    IN_PROGRESS: ProjectStatus.IN_PROGRESS,
    SUBMITTED_IN_PROGRESS: ProjectStatus.SUBMITTED_IN_PROGRESS,
    COMPLETED: ProjectStatus.COMPLETED,
    CANCELLED: ProjectStatus.CANCELLED,
    ON_HOLD: ProjectStatus.ON_HOLD,
    SUSPENDED: ProjectStatus.ON_HOLD,
  };
  return statusMap[s] ?? undefined;
}

function isTaskNodeDirectlyVisibleToEmployee(task: any, employeeId: string): boolean {
  return isTaskNodeAssignedToEmployee(task, employeeId);
}

function employeeHasVisibleWorkInProject(project: any, employeeId: string): boolean {
  const projectAssigned =
    Array.isArray(project?.assignedEmployees) &&
    project.assignedEmployees.some(
      (a: any) => a?.employeeId === employeeId || a?.employee?.id === employeeId,
    );
  if (projectAssigned) return true;
  const tasks = Array.isArray(project?.tasks) ? project.tasks : [];
  return tasks.some((task: any) => isTaskNodeDirectlyVisibleToEmployee(task, employeeId));
}

function pruneTaskTreeForEmployee(tasks: any[], employeeId: string): any[] {
  if (!employeeId || !Array.isArray(tasks)) return Array.isArray(tasks) ? tasks : [];

  return tasks
    .map((task: any) => {
      const visibleSubtasks = (Array.isArray(task?.subtasks) ? task.subtasks : [])
        .map((subtask: any) => {
          const visibleChildTasks = (Array.isArray(subtask?.subtasks) ? subtask.subtasks : []).filter(
            (child: any) => isTaskNodeDirectlyVisibleToEmployee(child, employeeId),
          );

          const keepSubtask =
            isTaskNodeDirectlyVisibleToEmployee(subtask, employeeId) || visibleChildTasks.length > 0;

          if (!keepSubtask) return null;

          return {
            ...subtask,
            subtasks: visibleChildTasks,
          };
        })
        .filter(Boolean);

      const keepTask =
        isTaskNodeDirectlyVisibleToEmployee(task, employeeId) || visibleSubtasks.length > 0;

      if (!keepTask) return null;

      return {
        ...task,
        subtasks: visibleSubtasks,
      };
    })
    .filter(Boolean);
}

function buildUserNameVariations(firstName: unknown, lastName: unknown): string[] {
  const first = String(firstName || '').trim().toLowerCase();
  const last = String(lastName || '').trim().toLowerCase();
  const out = new Set<string>();
  if (first && last) {
    out.add(`${first} ${last}`.trim());
    out.add(`${first} ${last.charAt(0)}`.trim());
  } else if (first) {
    out.add(first);
  } else if (last) {
    out.add(last);
  }
  return Array.from(out).filter(Boolean);
}

function projectHasContractAssignedManager(project: { contracts?: unknown[] } | null | undefined): boolean {
  if (!Array.isArray(project?.contracts)) return false;
  return project.contracts.some((contract: any) => {
    return Boolean(contract?.assignedManagerId || contract?.assignedManagerEmail);
  });
}

function managerOwnsProjectAsPm(
  project: any,
  manager: { id?: string | null; email?: string | null; nameVariations?: string[] },
): boolean {
  if (!project || !manager?.id) return false;

  const contractMatch = Array.isArray(project.contracts)
    ? project.contracts.some((contract: any) => {
        return (
          contract?.assignedManagerId === manager.id ||
          contract?.assignedManager?.id === manager.id ||
          (manager.email &&
            contract?.assignedManagerEmail &&
            String(contract.assignedManagerEmail).toLowerCase() === String(manager.email).toLowerCase())
        );
      })
    : false;
  if (contractMatch) return true;

  // When a contract assigns a PM, that assignment is the source of truth (matches UI column).
  if (projectHasContractAssignedManager(project)) return false;

  return projectManagerTextMatches(project.projectManager, manager.nameVariations || []);
}

function buildManagerProjectListWhere(
  userId: string,
  email: string | null | undefined,
  managerNameVariations: string[],
): Record<string, unknown>[] {
  const orConditions: Record<string, unknown>[] = [];

  orConditions.push({ contracts: { some: { assignedManagerId: userId } } });
  if (email) {
    orConditions.push({ contracts: { some: { assignedManagerEmail: email } } });
  }

  if (managerNameVariations.length > 0) {
    orConditions.push({
      AND: [
        {
          NOT: {
            contracts: {
              some: {
                OR: [
                  { assignedManagerId: { not: null } },
                  { assignedManagerEmail: { not: null } },
                ],
              },
            },
          },
        },
        {
          OR: managerNameVariations.map((name) => ({
            projectManager: { contains: name, mode: 'insensitive' as const },
          })),
        },
      ],
    });
  }

  return orConditions;
}

function projectManagerTextMatches(projectManager: unknown, nameVariations: string[]): boolean {
  const pm = String(projectManager || '').trim().toLowerCase();
  if (!pm || !Array.isArray(nameVariations) || nameVariations.length === 0) return false;
  return nameVariations.some((name) => name && pm.includes(name));
}

function managerOwnsProjectForVisibility(
  project: any,
  manager: { id?: string | null; email?: string | null; nameVariations?: string[] },
): boolean {
  return managerOwnsProjectAsPm(project, manager);
}

async function loadManagerTransferScope(managerId: string) {
  try {
    return await getManagerTransferScope(managerId);
  } catch (e) {
    console.error('[projects] loadManagerTransferScope failed:', e);
    return { excludedProjectIds: [] as string[], includedProjectIds: [] as string[] };
  }
}

function mergeManagerTransferScopeIntoListWhere(
  baseWhere: Record<string, unknown>,
  transferScope: { excludedProjectIds: string[]; includedProjectIds: string[] },
  orConditions: Record<string, unknown>[],
): void {
  if (transferScope.includedProjectIds.length > 0) {
    orConditions.push({ id: { in: transferScope.includedProjectIds } });
  }

  const managerFilter: Record<string, unknown> =
    transferScope.excludedProjectIds.length > 0
      ? {
          AND: [
            { OR: orConditions },
            { id: { notIn: transferScope.excludedProjectIds } },
          ],
        }
      : { OR: orConditions };

  if (baseWhere.AND) {
    const existing = baseWhere.AND;
    baseWhere.AND = Array.isArray(existing) ? [...existing, managerFilter] : [existing, managerFilter];
  } else if (baseWhere.OR) {
    baseWhere.AND = [managerFilter];
    delete baseWhere.OR;
  } else {
    Object.assign(baseWhere, managerFilter);
  }
}

async function managerMayAccessProjectWithTransfers(
  projectId: string,
  managerId: string,
  ownsViaAssignment: boolean,
): Promise<boolean> {
  const scope = await loadManagerTransferScope(managerId);
  if (scope.excludedProjectIds.includes(projectId)) return false;
  if (scope.includedProjectIds.includes(projectId)) return true;
  if (ownsViaAssignment) return true;

  const involvedViaTask = await prisma.task.findFirst({
    where: {
      AND: [{ projectId }, taskRowAssignedToEmployee(managerId)],
    },
    select: { id: true },
  });
  return !!involvedViaTask;
}

// Helper function to map frontend priority to TaskPriority enum
function mapPriorityToTaskPriority(priority: string): TaskPriority {
  const priorityMap: Record<string, TaskPriority> = {
    'low': TaskPriority.LOW,
    'medium': TaskPriority.MEDIUM,
    'high': TaskPriority.HIGH,
    'urgent': TaskPriority.URGENT,
  };
  return priorityMap[priority?.toLowerCase()] || TaskPriority.MEDIUM;
}

// Project/parent location fields to inherit into child tasks (plot number, community, project type, etc.)
type ProjectLocationDefaults = {
  location?: string | null;
  makaniNumber?: string | null;
  plotNumber?: string | null;
  community?: string | null;
  projectType?: string | null;
  projectFloor?: string | null;
  developerProject?: string | null;
};

// Helper function to save child subtasks recursively; inherits plot number, community, project type, etc. from project/parent
async function saveChildSubtasks(
  parentTaskId: string,
  projectId: string,
  childSubtasks: any[],
  createdById?: string | null,
  projectDefaults?: ProjectLocationDefaults | null,
  currentUserId?: string | null,
  currentUserRole?: string | null,
  projectCreatedById?: string | null,
  projectStatus?: string | null,
  referencePlanDaysMap?: ReferencePlanDays | Record<string, number> | null,
  syncFromReference = false,
  userManagesProject?: boolean,
): Promise<void> {
  if (!childSubtasks || !Array.isArray(childSubtasks)) {
    return;
  }

  if (childSubtasks.length === 0) {
    const existingCount = await prisma.task.count({
      where: { parentTaskId, projectId, deletedAt: null },
    });
    if (existingCount === 0) return;
  }

  const refPlanDays =
    referencePlanDaysMap ?? (await loadReferencePlanDaysData(prisma));

  console.log(`📝 saveChildSubtasks: Saving ${childSubtasks.length} child tasks under parent ${parentTaskId}`);

  // Get existing child subtasks and parent task (for inheriting location fields)
  const [existingChildSubtasks, parentTask] = await Promise.all([
    prisma.task.findMany({
      where: { parentTaskId, projectId },
      include: {
        assignments: {
          select: { employeeId: true },
        },
        delegations: { select: { originalAssigneeId: true, newAssigneeId: true } },
      },
    }),
    prisma.task.findUnique({
      where: { id: parentTaskId },
      select: {
        title: true,
        location: true,
        makaniNumber: true,
        plotNumber: true,
        community: true,
        projectType: true,
        projectFloor: true,
        developerProject: true,
      },
    }),
  ]);

  console.log(`📝 Found ${existingChildSubtasks.length} existing child tasks for parent ${parentTaskId}`);

  const allProjectTasksForPred = await prisma.task.findMany({
    where: { projectId },
    select: { id: true, stableWorkSeq: true, taskOrder: true, parentTaskId: true, displayAnchorSeq: true, displaySuffix: true },
  });
  const predResolveIndex = buildPredecessorResolveIndex(allProjectTasksForPred);
  const projectMetaForPred = await prisma.project.findUnique({
    where: { id: projectId },
    select: { projectNumber: true },
  });
  const predProjectNumber = projectMetaForPred?.projectNumber ?? 1;
  const resolvePredKey = (key: string) =>
    resolvePredecessorIdFromDisplayKey(key, predResolveIndex, {
      allRows: allProjectTasksForPred,
      projectNumber: predProjectNumber,
    });

  const activityActorId = currentUserId ?? createdById ?? null;
  const parentWorkTitle = parentTask?.title ? String(parentTask.title) : 'Work item';

  const existingChildIds = new Set(existingChildSubtasks.map(cst => cst.id));
  // Filter out null/undefined IDs and create set of incoming IDs
  const incomingChildIds = new Set(
    childSubtasks
      .filter(cst => cst.id && cst.id !== null && cst.id !== undefined && cst.id !== '')
      .map(cst => String(cst.id))
  );

  console.log(`📝 Incoming child task IDs:`, Array.from(incomingChildIds));
  console.log(`📝 Existing child task IDs:`, Array.from(existingChildIds));

  // Delete child subtasks that are no longer in the incoming list.
  // If incoming list is empty, this means "delete all children" (subject to EMPLOYEE creator rule below).
  // IMPORTANT: Only delete if the child task ID is explicitly missing from incoming list
  // This prevents deletion when frontend sends child tasks without IDs due to assignment changes
  const childSubtasksToDelete = existingChildSubtasks.filter((cst) => {
    let shouldDelete = !incomingChildIds.has(cst.id);

    if (shouldDelete && currentUserId && currentUserRole) {
      const delPerms = computeTaskPermissions({
        user: { id: currentUserId, role: currentUserRole as any },
        task: cst as any,
        projectCreatedById: projectCreatedById ?? null,
        projectStatus: projectStatus ?? null,
        userManagesProject,
      });
      if (!delPerms.canDelete) {
        console.log(
          `⛔ Skipping delete of child task ${cst.id}: user ${currentUserId} cannot delete (not task/project creator or admin)`,
        );
        shouldDelete = false;
      }
    }

    if (shouldDelete) {
      console.log(`🗑️ Marking child task ${cst.id} for deletion (not in incoming list)`);
    }
    return shouldDelete;
  });
  
  if (childSubtasksToDelete.length > 0) {
    console.log(`🗑️ Deleting ${childSubtasksToDelete.length} removed child tasks:`, childSubtasksToDelete.map(c => c.id));
    for (const cst of childSubtasksToDelete) {
      await logProjectActivity({
        projectId,
        actorId: activityActorId,
        action: 'CHILD_TASK_DELETED',
        taskId: cst.id,
        summary: `Removed child task "${cst.title}" under "${parentWorkTitle}"`,
        metadata: { parentTaskId, parentTitle: parentWorkTitle, taskTitle: cst.title },
      });
    }
    await softDeleteTasks(childSubtasksToDelete.map((cst) => cst.id));
  }

  // Create or update child subtasks
  let childCreatedCount = 0;
  let childUpdatedCount = 0;
  for (const [childIndex, childSubtask] of childSubtasks.entries()) {
    // Allow child tasks even without explicit title - use default if needed
    // This ensures employees can save child tasks even if title is not provided initially
    let childTitle = (childSubtask.name || childSubtask.title || '').trim();
    if (!childTitle || childTitle === '') {
      console.warn(`⚠️ Child task has empty title, using default title under parent ${parentTaskId}`);
      // Use a default title instead of skipping
      childTitle = `Child Task ${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Normalize child task ID - handle various formats (string, UUID, null, undefined)
    // Use let instead of const because we might update it if we find a match by title
    let childTaskId = childSubtask.id 
      ? String(childSubtask.id).trim() 
      : null;
    
    // Extract assigned employee ID - handle various field names
    const assignedEmpRaw = childSubtask.assignedEmployeeId 
      ?? childSubtask.assignedEmployee 
      ?? childSubtask.assignedTo
      ?? null;
    const referenceChildAssigneeId = resolveAssigneeIdForTaskTitle(
      childTitle,
      assignedEmpRaw,
      refPlanDays,
      childIndex,
    );
    const assignedEmpId = await resolveAssigneeUserId(
      assignedEmpRaw || referenceChildAssigneeId,
    );
    
    console.log(`📝 Processing child task: id=${childTaskId || 'NEW'}, title=${childTitle}, assignedEmployeeId=${assignedEmpId || 'NONE'}`);
    
    // Inherit from parent task then project (manager project list): plot number, community, project type, no. of floors, developer name
    const childSubtaskData: any = {
      title: childTitle,
      projectId: projectId,
      parentTaskId: parentTaskId,
      status: mapStatusToTaskStatus(childSubtask.status),
      priority: mapPriorityToTaskPriority(
        resolvePriorityForTaskTitle(childTitle, childSubtask.priority, refPlanDays, childIndex) ||
          childSubtask.priority,
      ),
      category: resolveCategoryForTaskTitle(
        childTitle,
        childSubtask.category,
        refPlanDays,
        childIndex,
      ),
      referenceNumber: childSubtask.referenceNumber || null,
      planDays: resolvePlanDaysForTaskTitle(childTitle, childSubtask.planDays, refPlanDays, childIndex),
      remarks: childSubtask.remarks || null,
      assigneeNotes: childSubtask.assigneeNotes || null,
      link:
        childSubtask.link != null && String(childSubtask.link).trim() !== ''
          ? String(childSubtask.link).trim()
          : null,
      assignedEmployeeId: assignedEmpId,
      createdBy: createdById ?? null,
      location: childSubtask.location ?? parentTask?.location ?? projectDefaults?.location ?? null,
      makaniNumber: childSubtask.makaniNumber ?? parentTask?.makaniNumber ?? projectDefaults?.makaniNumber ?? null,
      plotNumber: childSubtask.plotNumber ?? parentTask?.plotNumber ?? projectDefaults?.plotNumber ?? null,
      community: childSubtask.community ?? parentTask?.community ?? projectDefaults?.community ?? null,
      projectType: childSubtask.projectType ?? parentTask?.projectType ?? projectDefaults?.projectType ?? null,
      projectFloor: childSubtask.projectFloor ?? parentTask?.projectFloor ?? projectDefaults?.projectFloor ?? null,
      developerProject: childSubtask.developerProject ?? parentTask?.developerProject ?? projectDefaults?.developerProject ?? null,
      description: childSubtask.description || childSubtask.remarks || null,
      tags: Array.isArray(childSubtask.tags) ? childSubtask.tags : [],
    };
    applyEffortFieldsFromPayload(childSubtaskData, childSubtask);
    applyRatingFromPayload(childSubtaskData, childSubtask);
    if (syncFromReference) {
      const refAligned = applyReferenceTemplateToTaskRow(
        {
          title: childTitle,
          planDays: childSubtaskData.planDays,
          category: childSubtaskData.category,
          priority: childSubtask.priority,
          assignedEmployeeId: assignedEmpId,
        },
        refPlanDays as ReferencePlanDays,
        childIndex,
      );
      if (refAligned.category) childSubtaskData.category = refAligned.category;
      if (refAligned.planDays != null && refAligned.planDays > 0) {
        childSubtaskData.planDays = refAligned.planDays;
      }
      if (refAligned.priority) {
        childSubtaskData.priority = mapPriorityToTaskPriority(String(refAligned.priority));
      }
      if (refAligned.assignedEmployeeId) {
        childSubtaskData.assignedEmployeeId = await resolveAssigneeUserId(
          refAligned.assignedEmployeeId,
        );
      }
    }
    const parsedChildTaskOrder =
      childSubtask.taskOrder != null ? parseInt(String(childSubtask.taskOrder), 10) : NaN;
    if (Number.isFinite(parsedChildTaskOrder)) {
      childSubtaskData.taskOrder = parsedChildTaskOrder;
    }
    if (childSubtask.predecessors !== undefined) {
      childSubtaskData.predecessors = (childSubtask.predecessors != null && String(childSubtask.predecessors).trim() !== '') ? String(childSubtask.predecessors).trim() : null;
    }
    // Normalized predecessor link (strict sequencing)
    if (childSubtask.predecessorId !== undefined) {
      childSubtaskData.predecessorId = childSubtask.predecessorId || null;
    }

    // Handle timeline/dates
    if (childSubtask.timeline && Array.isArray(childSubtask.timeline) && childSubtask.timeline.length >= 2) {
      childSubtaskData.startDate = childSubtask.timeline[0] ? new Date(childSubtask.timeline[0]) : null;
      childSubtaskData.dueDate = childSubtask.timeline[1] ? new Date(childSubtask.timeline[1]) : null;
    } else if (childSubtask.startDate || childSubtask.endDate) {
      childSubtaskData.startDate = childSubtask.startDate ? new Date(childSubtask.startDate) : null;
      childSubtaskData.dueDate = childSubtask.endDate ? new Date(childSubtask.endDate) : null;
    }

    // Check if this child task already exists (by ID)
    // Handle both string and UUID formats - normalize for comparison
    let childTaskExists = childTaskId && existingChildIds.has(childTaskId);
    
    // If ID is missing but we have a title, try to match by title + parentTaskId
    // This prevents deletion when frontend sends child tasks without IDs after assignment changes
    if (!childTaskExists && !childTaskId && childTitle) {
      const matchingChildTask = existingChildSubtasks.find(
        cst => cst.title === childTitle && cst.parentTaskId === parentTaskId
      );
      if (matchingChildTask) {
        console.log(`🔍 Found matching child task by title "${childTitle}" - will update instead of create`);
        // Use the found ID for update
        childTaskId = matchingChildTask.id;
        childTaskExists = true;
      }
    }
    
    const existingOneForPred =
      childTaskExists && childTaskId
        ? existingChildSubtasks.find((c: any) => c.id === childTaskId)
        : undefined;
    const effectiveChildPredId = resolveEffectivePredecessorForTaskRow(
      childSubtask,
      existingOneForPred,
      resolvePredKey,
    );
    if (childSubtask.predecessors !== undefined || childSubtask.predecessorId !== undefined) {
      childSubtaskData.predecessorId = effectiveChildPredId;
    }
    let childPredDone = true;
    if (effectiveChildPredId) {
      const predRow = await prisma.task.findUnique({
        where: { id: effectiveChildPredId },
        select: { status: true, workflowStatus: true },
      });
      childPredDone = isPredecessorRowCompleted(predRow);
    }
    const childLockedByPred = !!effectiveChildPredId && !childPredDone;
    childSubtaskData.status = clampTaskStatusAgainstIncompletePredecessor(
      childSubtaskData.status,
      effectiveChildPredId,
      childPredDone,
    );
    childSubtaskData.workflowStatus = workflowStatusFromPredecessorChain(
      childSubtaskData.status,
      effectiveChildPredId,
      childPredDone,
    );

    if (childTaskExists && childTaskId) {
      // Update existing child subtask - preserve ID and createdBy (never overwrite creator)
      const existingOne = existingOneForPred;

      // Permission model: use central helper so assignees (e.g. Khalid) can only
      // change remarks / assignee notes / attachments on child tasks created
      // by someone else (e.g. Ajmal).
      let updateData: any = {};

      if (currentUserId && currentUserRole) {
        const perms = computeTaskPermissions({
          user: { id: currentUserId, role: currentUserRole as any },
          task: existingOne as any,
          projectCreatedById: projectCreatedById ?? null,
          projectStatus: projectStatus ?? null,
          userManagesProject,
        });

        // No permission at all → skip silently
        if (!perms.canEditAssigneeFields && !perms.canEditMainFields) {
          console.log(
            `⛔ Skipping update of child task ${childTaskId} by unauthorised user ${currentUserId}`,
          );
          continue;
        }

        if (perms.canEditMainFields) {
          // Creator / manager / admin / HR – full update
          updateData = {
            ...childSubtaskData,
            createdBy: existingOne?.createdBy ?? null,
          };
        } else if (perms.canEditAssigneeFields) {
          if (childLockedByPred) {
            updateData = {
              workflowStatus: 'WAITING_FOR_PREDECESSOR',
              status: TaskStatus.PENDING,
              remarks: childSubtaskData.remarks,
              assigneeNotes: childSubtaskData.assigneeNotes,
              link: childSubtaskData.link,
            };
          } else {
            updateData = {
              status: childSubtaskData.status,
              workflowStatus: childSubtaskData.workflowStatus,
              remarks: childSubtaskData.remarks,
              assigneeNotes: childSubtaskData.assigneeNotes,
              link: childSubtaskData.link,
            };
          }
        }
      } else {
        // Fallback (no current user context) – preserve previous behaviour
        updateData = {
          ...childSubtaskData,
          createdBy: existingOne?.createdBy ?? null,
        };
      }

      console.log(`🔄 Updating existing child task ${childTaskId}: ${childSubtaskData.title}`);
      try {
        await prisma.task.update({
          where: { id: childTaskId },
          data: updateData,
        });
        if (currentUserId && existingOneForPred) {
          void maybeNotifyTaskNotesFromSave({
            projectId,
            taskId: childTaskId,
            taskTitle: String(existingOneForPred.title ?? childSubtaskData.title ?? ''),
            actorId: currentUserId,
            existing: {
              remarks: existingOneForPred.remarks,
              assigneeNotes: existingOneForPred.assigneeNotes,
            },
            incoming: {
              remarks: childSubtask.remarks,
              assigneeNotes: childSubtask.assigneeNotes,
            },
          });
        }
        const childAssigneeId =
          (updateData.assignedEmployeeId as string | null | undefined) ??
          existingOneForPred?.assignedEmployeeId ??
          null;
        await maybeAwardXpForStatusTransition(
          childTaskId,
          existingOneForPred?.status,
          (updateData.status as TaskStatus | undefined) ?? childSubtaskData.status,
          childAssigneeId,
        );
        const childPersistedStatus =
          (updateData.status as TaskStatus | undefined) ?? childSubtaskData.status;
        if (
          existingOneForPred &&
          currentUserId &&
          currentUserRole &&
          isTaskStatusChanged(existingOneForPred.status as TaskStatus, childPersistedStatus)
        ) {
          await processPmTaskStatusChangeNotification({
            projectId,
            taskId: childTaskId,
            taskTitle: String(existingOneForPred.title ?? childSubtaskData.title ?? ''),
            actor: { id: currentUserId, role: currentUserRole as any },
            projectCreatedById: projectCreatedById ?? null,
            previousStatus: existingOneForPred.status as TaskStatus,
            newStatus: childPersistedStatus,
            assigneeUserId: childAssigneeId,
            reason: extractStatusReversionReason(childSubtask),
          });
        }
        const unlockedChild = await unlockDependentsWaitingOnFinishedPredecessor(
          prisma,
          childTaskId,
        );
        for (const d of unlockedChild) {
          const { displayId } = await resolveTaskDisplayIdForTaskId(projectId, d.id);
          await logProjectActivity({
            projectId: d.projectId,
            actorId: activityActorId,
            action: 'SUCCESSOR_UNBLOCKED_AFTER_PREDECESSOR',
            taskId: d.id,
            summary: `Unblocked ${formatWorkItemRef(d.title, displayId)} — predecessor finished`,
            metadata: {
              taskTitle: d.title,
              taskDisplayId: displayId ?? undefined,
              predecessorTaskId: childTaskId,
            },
          });
        }
        childUpdatedCount++;
        const refreshedChild = await prisma.task.findUnique({
          where: { id: childTaskId },
        });
        const changes = refreshedChild
          ? collectTaskChangesAfterPersist(
              existingOne as Record<string, unknown>,
              updateData as Record<string, unknown>,
              refreshedChild as Record<string, unknown>,
            )
          : collectTaskChanges(
              existingOne as Record<string, unknown>,
              updateData as Record<string, unknown>,
            );
        if (changes.length > 0) {
          const { displayId: childDisplayId } = await resolveTaskDisplayIdForTaskId(
            projectId,
            childTaskId,
          );
          const { displayId: parentDisplayId } = await resolveTaskDisplayIdForTaskId(
            projectId,
            parentTaskId,
          );
          await logProjectActivity({
            projectId,
            actorId: activityActorId,
            action: 'CHILD_TASK_UPDATED',
            taskId: childTaskId,
            summary: `Updated child task ${formatWorkItemRef(childSubtaskData.title, childDisplayId)} under ${formatWorkItemRef(parentWorkTitle, parentDisplayId)} (${changes.length} field(s))`,
            metadata: {
              parentTaskId,
              parentTitle: parentWorkTitle,
              parentTaskDisplayId: parentDisplayId ?? undefined,
              taskTitle: childSubtaskData.title,
              taskDisplayId: childDisplayId ?? undefined,
              changes,
            },
          });
        }
        console.log(`✅ Successfully updated child task ${childTaskId} with new assignment`);
      } catch (updateError: any) {
        console.error(`❌ Error updating child task ${childTaskId}:`, updateError);
        throw updateError;
      }
    } else {
      // Create new child subtask
      console.log(`➕ Creating new child task: ${childSubtaskData.title} (parent: ${parentTaskId}, project: ${projectId})`);
      try {
        const nextChildSeq =
          (childSubtask as any).stableWorkSeq != null
            ? parseInt(String((childSubtask as any).stableWorkSeq), 10)
            : NaN;
        const resolvedChildSeq =
          Number.isFinite(nextChildSeq) && nextChildSeq > 0
            ? nextChildSeq
            : await computeNextStableWorkSeq(prisma, projectId, parentTaskId);
        const newChild = await prisma.task.create({
          data: {
            ...childSubtaskData,
            stableWorkSeq: resolvedChildSeq,
            taskOrder: childSubtaskData.taskOrder ?? resolvedChildSeq,
          },
        });
        console.log(`✅ Created child task ${newChild.id}: ${newChild.title}`);
        childCreatedCount++;
        const assigneeName = await userShortLabel(newChild.assignedEmployeeId);
        const assigneePart = assigneeName ? ` · Assignee: ${assigneeName}` : '';
        await logProjectActivity({
          projectId,
          actorId: activityActorId,
          action: 'CHILD_TASK_CREATED',
          taskId: newChild.id,
          summary: `Added child task "${newChild.title}" under "${parentWorkTitle}"${assigneePart}`,
          metadata: {
            parentTaskId,
            parentTitle: parentWorkTitle,
            taskTitle: newChild.title,
            assigneeId: newChild.assignedEmployeeId,
            assigneeName: assigneeName ?? undefined,
          },
        });
      } catch (createError: any) {
        console.error(`❌ Error creating child task:`, {
          error: createError.message,
          code: createError.code,
          meta: createError.meta,
          childSubtaskData: {
            title: childSubtaskData.title,
            projectId: childSubtaskData.projectId,
            parentTaskId: childSubtaskData.parentTaskId,
          },
        });
        throw createError;
      }
    }
  }
  console.log(`✅ Saved child tasks for parent ${parentTaskId} (${childCreatedCount} created, ${childUpdatedCount} updated)`);
}

// Get all projects with filters
export const getAllProjects = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { 
      status, 
      clientId, 
      projectManager, // Text search filter (not projectManagerId)
      search,
      employeeId: employeeIdQuery,
      page = '1',
      limit = '10',
      // Default ordering should be stable for hierarchical auto-numbering in UI.
      // Using createdAt desc makes the newest project appear as "1" and shifts others.
      sortBy = 'projectNumber',
      sortOrder = 'asc'
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const companyAllRaw = req.query.companyAll;
    const companyAllFirst = Array.isArray(companyAllRaw) ? companyAllRaw[0] : companyAllRaw;
    const companyAllRequested =
      companyAllFirst === 'true' ||
      companyAllFirst === '1' ||
      companyAllFirst === true ||
      String(companyAllFirst ?? '').toLowerCase() === 'true';

    const userRole = normalizeErpRole(req.user?.role);

    /**
     * Skip scoped project filtering when requesting the company-wide list (?companyAll=true).
     * This powers the read-only "View company all projects" table in the UI.
     */
    const skipScopedEmployeeManagerProjects =
      companyAllRequested &&
      ['EMPLOYEE', 'MANAGER', 'PROJECT_MANAGER', 'SUPER_ADMIN'].includes(userRole);

    await purgeExpiredSoftDeletions();

    const where: any = { deletedAt: null };

    if (status) {
      where.status = status;
    }

    if (clientId) {
      where.clientId = clientId;
    }

    // Filter by project manager name (text search)
    if (projectManager) {
      where.projectManager = { contains: projectManager as string, mode: 'insensitive' };
    }

    // Store search filter separately to combine with role-based filters
    const searchFilter: any = search ? {
      OR: [
        { name: { contains: search as string, mode: 'insensitive' } },
        { referenceNumber: { contains: search as string, mode: 'insensitive' } },
        { pin: { contains: search as string, mode: 'insensitive' } },
        { projectManager: { contains: search as string, mode: 'insensitive' } }, // Include projectManager in search
      ]
    } : null;

    // When ?employeeId=XXX is sent (e.g. /employees/30 page), return projects that have tasks assigned to that employee.
    // Allowed when: current user is that employee, or current user is ADMIN/HR/PROJECT_MANAGER viewing that employee.
    const elevatedForEmployeeProjectView = new Set([
      'ADMIN',
      'HR',
      'PROJECT_MANAGER',
      'SUPER_ADMIN',
    ]);
    const canViewOtherEmployee =
      req.user != null && elevatedForEmployeeProjectView.has(userRole);
    let effectiveEmployeeId =
      typeof employeeIdQuery === 'string' && employeeIdQuery.trim() &&
      (canViewOtherEmployee || req.user?.id === employeeIdQuery.trim())
        ? employeeIdQuery.trim()
        : null;

    // Company-wide list must not be narrowed by ?employeeId= (e.g. stray query on tasks URL).
    if (skipScopedEmployeeManagerProjects) {
      effectiveEmployeeId = null;
    }

    if (effectiveEmployeeId) {
      // Project list for this employee: include both
      // (1) direct project assignments, and (2) task/subtask involvement.
      const [employeeTasks, assignedProjects] = await Promise.all([
        prisma.task.findMany({
          where: taskRowAssignedToEmployee(effectiveEmployeeId),
          select: { projectId: true },
          distinct: ['projectId'],
        }),
        prisma.projectAssignment.findMany({
          where: { employeeId: effectiveEmployeeId },
          select: { projectId: true },
          distinct: ['projectId'],
        }),
      ]);
      const employeeProjectIds = Array.from(
        new Set([
          ...employeeTasks
            .map((t: { projectId: string | null }) => t.projectId)
            .filter((pid): pid is string => !!pid),
          ...assignedProjects
            .map((a: { projectId: string | null }) => a.projectId)
            .filter((pid): pid is string => !!pid),
        ])
      );
      if (employeeProjectIds.length === 0) {
        console.log('[getAllProjects] employeeId filter: no tasks for employee → no projects. employeeId=', effectiveEmployeeId);
      }
      if (searchFilter) {
        where.AND = [
          { id: employeeProjectIds.length ? { in: employeeProjectIds } : { in: [] } },
          searchFilter,
        ];
      } else {
        where.id = employeeProjectIds.length ? { in: employeeProjectIds } : { in: [] };
      }
    }
    // Employee/Manager: access is scoped to projects they are actually involved in.
    // Managers use a restricted view of "their" projects, employees see projects that have tasks assigned to them.
    else if (
      !skipScopedEmployeeManagerProjects &&
      (userRole === 'EMPLOYEE' || userRole === 'MANAGER')
    ) {
      if (userRole === 'MANAGER') {
        // Manager: own PM projects + projects where they are assigned on any task/subtask row.
        
        // Fetch manager's full details to get their name for projectManager field matching
        let managerNameVariations: string[] = [];
        try {
          const managerUser = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: { firstName: true, lastName: true },
          });
          
          if (managerUser) {
            const managerFirstName = managerUser.firstName?.trim().toLowerCase() || '';
            const managerLastName = managerUser.lastName?.trim().toLowerCase() || '';
            const managerFullName = `${managerFirstName} ${managerLastName}`.trim();
            
            // Strict PM name match only — full name and "First L" initial (no standalone first/last)
            if (managerFullName) managerNameVariations.push(managerFullName);
            if (managerFirstName && managerLastName) {
              managerNameVariations.push(`${managerFirstName} ${managerLastName.charAt(0)}`);
            }
          }
        } catch (error) {
          console.error('Error fetching manager details for project filtering:', error);
        }
        
        // Manager personal list: match contract-assigned PM (same as UI column). Do not use createdBy —
        // projects created for another PM must not appear in the creator's list.
        const orConditions = buildManagerProjectListWhere(
          req.user!.id,
          req.user!.email,
          managerNameVariations,
        );

        const [transferScope, taskAssignedRows] = await Promise.all([
          loadManagerTransferScope(req.user!.id),
          prisma.task.findMany({
            where: taskRowAssignedToEmployee(req.user!.id),
            select: { projectId: true },
            distinct: ['projectId'],
          }),
        ]);

        const taskAssignedProjectIds = taskAssignedRows
          .map((t) => t.projectId)
          .filter((pid): pid is string => !!pid);
        if (taskAssignedProjectIds.length > 0) {
          orConditions.push({ id: { in: taskAssignedProjectIds } });
        }
        
        // Combine manager filter with search filter if present
        if (searchFilter) {
          where.AND = [
            searchFilter,
          ];
          mergeManagerTransferScopeIntoListWhere(where, transferScope, orConditions);
        } else {
          mergeManagerTransferScopeIntoListWhere(where, transferScope, orConditions);
        }
      } else {
        // EMPLOYEE:
        // Include projects by direct assignment OR task/subtask involvement.
        const [employeeTasks, assignedProjects] = await Promise.all([
          prisma.task.findMany({
            where: taskRowAssignedToEmployee(req.user.id),
            select: {
              projectId: true,
            },
            distinct: ['projectId'],
          }),
          prisma.projectAssignment.findMany({
            where: { employeeId: req.user.id },
            select: { projectId: true },
            distinct: ['projectId'],
          }),
        ]);

        const employeeProjectIds = Array.from(
          new Set([
            ...employeeTasks
              .map((t: { projectId: string | null }) => t.projectId)
              .filter((pid): pid is string => !!pid),
            ...assignedProjects
              .map((a: { projectId: string | null }) => a.projectId)
              .filter((pid): pid is string => !!pid),
          ])
        );

        // Debug: log when employee sees no projects (helps verify Task 2 is assigned to Khalid's user ID in DB)
        if (employeeProjectIds.length === 0) {
          console.log('[getAllProjects] EMPLOYEE has no tasks assigned → no projects. userId=', req.user?.id, 'email=', req.user?.email);
        } else {
          console.log('[getAllProjects] EMPLOYEE project IDs from assigned tasks:', employeeProjectIds.length, employeeProjectIds.slice(0, 5));
        }

        if (employeeProjectIds.length === 0) {
          // No projects linked to this employee's tasks – short‑circuit to empty result
          if (searchFilter) {
            where.AND = [
              { id: { in: [] } }, // impossible condition
              searchFilter,
            ];
          } else {
            where.id = { in: [] };
          }
        } else if (searchFilter) {
          where.AND = [
            { id: { in: employeeProjectIds } },
            searchFilter,
          ];
        } else {
          where.id = { in: employeeProjectIds };
        }
      }
    }

    // Admin/HR: only projects whose contracts belong to assigned branch(es).
    if (req.user?.id && roleUsesCompanyAccessScope(userRole)) {
      const accessScope = await resolveCompanyAccessScope(req.user.id, userRole);
      if (!accessScope.unrestricted) {
        mergeProjectScopeIntoWhere(
          where,
          await buildProjectWhereForCompanyScope(accessScope),
        );
      }
    }

    // EMPLOYEE (or ?employeeId= view): only load main tasks that have assignee-visible work.
    const taskViewerId = skipScopedEmployeeManagerProjects
      ? null
      : effectiveEmployeeId ??
        (userRole === 'EMPLOYEE' && req.user?.id ? req.user.id : null);

    const mainTaskVisibilityForViewer = taskViewerId
      ? mainTaskVisibleToAssignedEmployeeInProject(taskViewerId)
      : null;

    // Predecessor sync + display-key repair run on write paths only (not every list fetch).

    const CONTRACT_MAIN_TABLE_SELECT = {
      id: true,
      projectId: true,
      referenceNumber: true,
      title: true,
      clientContact: true,
      clientName: true,
      assignedManagerId: true,
      assignedManagerEmail: true,
      status: true,
      contractType: true,
      startDate: true,
      endDate: true,
      contractValue: true,
      currency: true,
      builtUpArea: true,
      plotNumber: true,
      community: true,
      numberOfFloors: true,
      makaniNumber: true,
      latitude: true,
      longitude: true,
      developerName: true,
      projectManager: true,
      contractPhases: true,
      createdAt: true,
      updatedAt: true,
      assignedManager: { select: USER_AVATAR_SELECT },
    } as const;

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: {
          [sortBy as string]: sortOrder as 'asc' | 'desc',
        },
        select: {
          // Include all base fields including projectManager
          id: true,
          projectNumber: true,
          name: true,
          referenceNumber: true,
          pin: true,
          clientId: true,
          owner: true,
          description: true,
          status: true,
          projectManager: true, // Explicitly include projectManager field
          startDate: true,
          endDate: true,
          deadline: true,
          planDays: true,
          remarks: true,
          assigneeNotes: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true,
          // Location fields
          location: true,
          makaniNumber: true,
          plotNumber: true,
          community: true,
          projectType: true,
          projectFloor: true,
          developerProject: true,
          // Relations
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          assignedEmployees: {
            include: {
              employee: { select: USER_AVATAR_SELECT },
            },
          },
          contracts: {
            select: CONTRACT_MAIN_TABLE_SELECT,
            orderBy: {
              updatedAt: 'desc',
            },
          },
          tasks: {
            where: {
              parentTaskId: null, // Only parent-level tasks (main tasks)
              deletedAt: null,
              // When taskViewerId is set (EMPLOYEE or ?employeeId=): only main tasks visible to that employee
              ...(mainTaskVisibilityForViewer
                ? { OR: mainTaskVisibilityForViewer }
                : {}),
            },
            orderBy: [...TASK_ORDER_THEN_CREATED_AT],
            select: {
              id: true,
              title: true,
              taskOrder: true,
              createdAt: true,
              description: true,
              status: true,
              workflowStatus: true,
              priority: true,
              startDate: true,
              dueDate: true,
              completedAt: true,
              category: true,
              referenceNumber: true,
              planDays: true,
              remarks: true,
              assigneeNotes: true,
          link: true,
              assignedEmployeeId: true,
              createdBy: true,
              predecessors: true,
              predecessorId: true,
              stableWorkSeq: true,
              displayAnchorSeq: true,
              displaySuffix: true,
              effortType: true,
              taskWeight: true,
              rating: true,
              assignments: { select: { employeeId: true } },
              delegations: { select: { originalAssigneeId: true, newAssigneeId: true } },
              assignedEmployee: { select: USER_AVATAR_SELECT },
              location: true,
              makaniNumber: true,
              plotNumber: true,
              community: true,
              projectType: true,
              projectFloor: true,
              developerProject: true,
              subtasks: {
                where: { deletedAt: null },
                select: {
                  id: true,
                  title: true,
                  description: true,
                  status: true,
                  workflowStatus: true,
                  priority: true,
                  startDate: true,
                  dueDate: true,
                  completedAt: true,
                  category: true,
                  referenceNumber: true,
                  planDays: true,
                  remarks: true,
                  assigneeNotes: true,
          link: true,
                  assignedEmployeeId: true,
                  parentTaskId: true,
                  createdAt: true,
                  createdBy: true,
                  predecessors: true,
                  predecessorId: true,
                  stableWorkSeq: true,
              displayAnchorSeq: true,
              displaySuffix: true,
                  taskOrder: true,
                  effortType: true,
                  taskWeight: true,
                  rating: true,
                  assignments: { select: { employeeId: true } },
                  delegations: { select: { originalAssigneeId: true, newAssigneeId: true } },
                  assignedEmployee: { select: USER_AVATAR_SELECT },
                  location: true,
                  makaniNumber: true,
                  plotNumber: true,
                  community: true,
                  projectType: true,
                  projectFloor: true,
                  developerProject: true,
                  subtasks: {
                    where: { deletedAt: null },
                    select: {
                      id: true,
                      title: true,
                      description: true,
                      status: true,
                      workflowStatus: true,
                      priority: true,
                      startDate: true,
                      dueDate: true,
                      completedAt: true,
                      category: true,
                      referenceNumber: true,
                      planDays: true,
                      remarks: true,
                      assigneeNotes: true,
          link: true,
                      assignedEmployeeId: true,
                      parentTaskId: true,
                      createdAt: true,
                      createdBy: true,
                      predecessors: true,
                      predecessorId: true,
                      stableWorkSeq: true,
              displayAnchorSeq: true,
              displaySuffix: true,
                      taskOrder: true,
                      effortType: true,
                      taskWeight: true,
                      rating: true,
                      assignments: { select: { employeeId: true } },
                      delegations: { select: { originalAssigneeId: true, newAssigneeId: true } },
                      assignedEmployee: { select: USER_AVATAR_SELECT },
                      location: true,
                      makaniNumber: true,
                      plotNumber: true,
                      community: true,
                      projectType: true,
                      projectFloor: true,
                      developerProject: true,
                    },
                    orderBy: [...TASK_ORDER_THEN_CREATED_AT],
                  },
                },
                orderBy: [...TASK_ORDER_THEN_CREATED_AT],
              },
            },
          } as any,
          _count: {
            select: {
              tasks: true,
              documents: true,
              tenders: true,
              contracts: true,
            },
          },
        } as any,
      }),
      prisma.project.count({ where }),
    ]);

    // Attach contracts linked by projectId or matching reference (Load Out may not set projectId immediately)
    const projectsWithContracts = await (async () => {
      const projectRows = projects as any[];
      if (!projectRows.length) return projectRows;
      const projectIds = projectRows.map((p) => p.id as string);
      const refs = [
        ...new Set(
          projectRows
            .map((p) => p.referenceNumber as string | null | undefined)
            .filter((r): r is string => !!r && String(r).trim() !== ''),
        ),
      ];
      const extraContracts = await prisma.contract.findMany({
        where: {
          OR: [
            { projectId: { in: projectIds } },
            ...(refs.length ? [{ referenceNumber: { in: refs } }] : []),
          ],
        },
        select: CONTRACT_MAIN_TABLE_SELECT,
        orderBy: { updatedAt: 'desc' },
      });
      const byProjectId = new Map<string, typeof extraContracts>();
      const byRef = new Map<string, typeof extraContracts>();
      for (const c of extraContracts) {
        if (c.projectId) {
          const list = byProjectId.get(c.projectId) ?? [];
          list.push(c);
          byProjectId.set(c.projectId, list);
        }
        if (c.referenceNumber) {
          const list = byRef.get(c.referenceNumber) ?? [];
          list.push(c);
          byRef.set(c.referenceNumber, list);
        }
      }
      return projectRows.map((p) => {
        const merged: any[] = [];
        const seen = new Set<string>();
        const addList = (list: any[] | undefined) => {
          for (const c of list ?? []) {
            if (seen.has(c.id)) continue;
            seen.add(c.id);
            merged.push(c);
          }
        };
        addList(p.contracts);
        addList(byProjectId.get(p.id));
        if (p.referenceNumber) addList(byRef.get(p.referenceNumber));
        merged.sort(
          (a, b) =>
            new Date(b.updatedAt ?? b.createdAt).getTime() -
            new Date(a.updatedAt ?? a.createdAt).getTime(),
        );
        return { ...p, contracts: merged.length > 0 ? merged : p.contracts };
      });
    })();

    let managerViewContext: { id?: string | null; email?: string | null; nameVariations?: string[] } | null = null;
    if (userRole === 'MANAGER' && req.user?.id) {
      try {
        const managerUser = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: { firstName: true, lastName: true, email: true },
        });
        managerViewContext = {
          id: req.user.id,
          email: req.user.email ?? managerUser?.email ?? null,
          nameVariations: buildUserNameVariations(managerUser?.firstName, managerUser?.lastName),
        };
      } catch (error) {
        console.error('Error building manager view context:', error);
        managerViewContext = { id: req.user.id, email: req.user.email ?? null, nameVariations: [] };
      }
    }

    // Load reference template once (project 2539) for aligning other projects on read
    const referenceTaskTemplate = await loadReferencePlanDaysData(prisma);

    // Use assigned manager name from linked contract for display when available (so PM shows e.g. muffazzal not mohammednazar)
    // Include projectName so main table and details show saved name (e.g. "villa") after refresh, not only reference number
    const projectsWithDisplayManager = projectsWithContracts.map((p: any) => {
      const firstContractWithManager = p.contracts?.find((c: any) => c.assignedManager);
      const displayManager = firstContractWithManager?.assignedManager
        ? `${firstContractWithManager.assignedManager.firstName} ${firstContractWithManager.assignedManager.lastName}`.trim()
        : null;
      const projectManagerUser = firstContractWithManager?.assignedManager || null;
      const displayName = (p.name != null && String(p.name).trim() !== '') ? p.name : p.referenceNumber;
      const shouldRestrictManagerToOwnTree =
        !skipScopedEmployeeManagerProjects &&
        userRole === 'MANAGER' &&
        req.user?.id &&
        managerViewContext &&
        !managerOwnsProjectForVisibility(p, managerViewContext);
      const restrictedManagerViewerId = shouldRestrictManagerToOwnTree ? req.user?.id ?? null : null;
      const tasksForClient = skipScopedEmployeeManagerProjects
        ? p.tasks
        : taskViewerId
          ? pruneTaskTreeForEmployee(p.tasks, taskViewerId)
          : restrictedManagerViewerId
            ? pruneTaskTreeForEmployee(p.tasks, restrictedManagerViewerId)
            : p.tasks;
      const alignedTasks =
        !isReferenceProjectRef(p.referenceNumber) && Array.isArray(tasksForClient)
          ? applyReferenceTemplateToTaskTree(tasksForClient, referenceTaskTemplate)
          : tasksForClient;
      const userManagesProject =
        userRole === 'MANAGER' && managerViewContext
          ? managerOwnsProjectForVisibility(p, managerViewContext)
          : userRole === 'ADMIN' || userRole === 'HR' || userRole === 'SUPER_ADMIN';
      return {
        ...p,
        projectManager: displayManager ?? p.projectManager,
        projectManagerUser,
        projectName: displayName,
        permissions: {
          canEditProjectFields: userManagesProject === true,
        },
        tasks: mapProjectTasksForMainTableClient(
          mapTaskTreeWithPermissions(
            alignedTasks,
            req.user ? { id: req.user.id, role: req.user.role as any } : null,
            p.createdBy ?? null,
            p.status,
            userManagesProject === true,
          ),
        ),
      };
    });

    const projectsForClient = taskViewerId
      ? projectsWithDisplayManager.filter((p) =>
          employeeHasVisibleWorkInProject(p, taskViewerId),
        )
      : projectsWithDisplayManager;

    setNoCacheJson(res);
    res.json({
      success: true,
      data: projectsForClient,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get all projects error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Same visibility as project drawer / getProjectById (manager + employee rules). */
async function loadProjectForDrawerAccess(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      createdBy: true,
      projectManager: true,
      contracts: {
        select: { assignedManagerEmail: true, assignedManagerId: true },
      },
      assignedEmployees: { select: { employeeId: true } },
      tasks: {
        select: {
          assignedEmployeeId: true,
          subtasks: {
            select: {
              assignedEmployeeId: true,
              subtasks: { select: { assignedEmployeeId: true } },
            },
          },
        },
      },
    },
  });
}

async function assertDrawerProjectAccess(
  req: AuthRequest,
  projectId: string,
): Promise<'ok' | '404' | '403'> {
  const project = await loadProjectForDrawerAccess(projectId);
  if (!project) return '404';

  const userRole = normalizeErpRole(req.user?.role);
  if (req.user?.id && roleUsesCompanyAccessScope(userRole)) {
    const accessScope = await resolveCompanyAccessScope(req.user.id, userRole);
    if (!accessScope.unrestricted) {
      const allowed = await projectMatchesCompanyScope(projectId, accessScope);
      if (!allowed) return '403';
    }
  }

  if (userRole !== 'EMPLOYEE' && userRole !== 'MANAGER') {
    return 'ok';
  }

  const projectWithRelations = project as any;
  if (userRole === 'MANAGER') {
    const managerUser = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { firstName: true, lastName: true, email: true },
    });
    const ownsProject = managerOwnsProjectAsPm(projectWithRelations, {
      id: req.user!.id,
      email: managerUser?.email ?? req.user?.email ?? null,
      nameVariations: buildUserNameVariations(managerUser?.firstName, managerUser?.lastName),
    });

    const allowed = await managerMayAccessProjectWithTransfers(projectId, req.user!.id, ownsProject);
    if (!allowed) {
      return '403';
    }
  } else {
    const isAssigned = projectWithRelations.assignedEmployees?.some(
      (a: { employeeId: string }) => a.employeeId === req.user!.id,
    );
    const involvedInProject = await prisma.task.findFirst({
      where: {
        AND: [{ projectId: projectId }, taskRowAssignedToEmployee(req.user!.id)],
      },
      select: { id: true },
    });
    if (!isAssigned && !involvedInProject) {
      return '403';
    }
  }

  return 'ok';
}

// Get single project by ID
export const getProjectById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        assignedEmployees: {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, email: true, photo: true, role: true } },
          },
        },
        tasks: {
          where: { parentTaskId: null },
          include: {
            assignments: {
              include: {
                employee: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            delegations: { select: { originalAssigneeId: true, newAssigneeId: true } },
            assignedEmployee: { select: USER_AVATAR_SELECT },
            subtasks: {
              include: {
                assignments: { select: { employeeId: true } },
                delegations: { select: { originalAssigneeId: true, newAssigneeId: true } },
                assignedEmployee: { select: USER_AVATAR_SELECT },
                subtasks: {
                  include: {
                    assignments: { select: { employeeId: true } },
                    delegations: { select: { originalAssigneeId: true, newAssigneeId: true } },
                    assignedEmployee: { select: USER_AVATAR_SELECT },
                  },
                  orderBy: [...TASK_ORDER_THEN_CREATED_AT],
                },
              },
              orderBy: [...TASK_ORDER_THEN_CREATED_AT],
            },
            _count: {
              select: {
                checklists: true,
                attachments: true,
              },
            },
          },
          orderBy: [...TASK_ORDER_THEN_CREATED_AT],
        },
        checklists: {
          orderBy: {
            order: 'asc',
          },
        },
        attachments: {
          orderBy: {
            uploadedAt: 'desc',
          },
        },
        documents: {
          orderBy: {
            uploadedAt: 'desc',
          },
        },
        tenders: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
            status: true,
          },
        },
        contracts: {
          select: {
            id: true,
            referenceNumber: true,
            title: true,
            status: true,
            contractType: true,
            startDate: true,
            endDate: true,
            contractValue: true,
            currency: true,
            builtUpArea: true,
            developerName: true,
            plotNumber: true,
            community: true,
            numberOfFloors: true,
            makaniNumber: true,
            assignedManagerId: true as any,
            assignedManagerEmail: true as any,
            assignedManager: { select: USER_AVATAR_SELECT },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        _count: {
          select: {
            tasks: true,
            documents: true,
            tenders: true,
            checklists: true,
            attachments: true,
            contracts: true,
          },
        },
      },
    });

    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    const userRole = normalizeErpRole(req.user?.role);
    if (req.user?.id && roleUsesCompanyAccessScope(userRole)) {
      const accessScope = await resolveCompanyAccessScope(req.user.id, userRole);
      if (!accessScope.unrestricted) {
        const allowed = await projectMatchesCompanyScope(id, accessScope);
        if (!allowed) {
          res.status(403).json({
            success: false,
            message: 'Forbidden: this project belongs to a branch outside your access',
          });
          return;
        }
      }
    }

    // Employee/Manager: Check access (managers see PM-owned projects + task-assigned projects)
    // Note: PROJECT_MANAGER is normalized to MANAGER in normalizeErpRole().
    let managerOwnsProject = false;
    if (normalizeErpRole(req.user?.role) === 'EMPLOYEE' || normalizeErpRole(req.user?.role) === 'MANAGER') {
      const projectWithRelations = project as any;
      if (normalizeErpRole(req.user?.role) === 'MANAGER') {
        const managerUser = await prisma.user.findUnique({
          where: { id: req.user!.id },
          select: { firstName: true, lastName: true, email: true },
        });
        managerOwnsProject = managerOwnsProjectAsPm(projectWithRelations, {
          id: req.user!.id,
          email: managerUser?.email ?? req.user?.email ?? null,
          nameVariations: buildUserNameVariations(managerUser?.firstName, managerUser?.lastName),
        });

        const allowed = await managerMayAccessProjectWithTransfers(id, req.user!.id, managerOwnsProject);
        if (!allowed) {
          res.status(403).json({ success: false, message: 'You do not have access to this project' });
          return;
        }
      } else {
        // Employee: project assignment, or any task/subtask row (incl. delegation) in this project
        const isAssigned = projectWithRelations.assignedEmployees?.some(
          (a: { employeeId: string }) => a.employeeId === req.user!.id
        );
        const involvedInProject = await prisma.task.findFirst({
          where: {
            AND: [{ projectId: id }, taskRowAssignedToEmployee(req.user!.id)],
          },
          select: { id: true },
        });
        if (!isAssigned && !involvedInProject) {
          res.status(403).json({ success: false, message: 'You do not have access to this project' });
          return;
        }
      }
    }

    // Use assigned manager name from linked contract for display when available
    const projectWithRelationsForManager = project as any;
    const firstContractWithManager = projectWithRelationsForManager.contracts?.find((c: any) => c.assignedManager);
    const displayManager = firstContractWithManager?.assignedManager
      ? `${firstContractWithManager.assignedManager.firstName} ${firstContractWithManager.assignedManager.lastName}`.trim()
      : null;
    const projectWithDisplayManager = {
      ...projectWithRelationsForManager,
      projectManager: displayManager ?? projectWithRelationsForManager.projectManager,
      // So Project Details panel shows editable name (e.g. "villa") not only reference number
      projectName: (projectWithRelationsForManager.name != null && projectWithRelationsForManager.name !== '')
        ? projectWithRelationsForManager.name
        : projectWithRelationsForManager.referenceNumber,
      permissions: {
        canEditProjectFields:
          normalizeErpRole(req.user?.role) === 'ADMIN' ||
          normalizeErpRole(req.user?.role) === 'HR' ||
          normalizeErpRole(req.user?.role) === 'SUPER_ADMIN' ||
          managerOwnsProject,
      },
      tasks: mapProjectTasksForMainTableClient(
        mapTaskTreeWithPermissions(
          (normalizeErpRole(req.user?.role) === 'EMPLOYEE' ||
            (normalizeErpRole(req.user?.role) === 'MANAGER' && !managerOwnsProject)) &&
          req.user?.id
            ? pruneTaskTreeForEmployee(projectWithRelationsForManager.tasks, req.user.id)
            : projectWithRelationsForManager.tasks,
          req.user ? { id: req.user.id, role: req.user.role as any } : null,
          projectWithRelationsForManager.createdBy ?? null,
          projectWithRelationsForManager.status,
          managerOwnsProject,
        ),
      ),
    };

    setNoCacheJson(res);
    res.json({
      success: true,
      data: projectWithDisplayManager,
    });
  } catch (error) {
    console.error('Get project by ID error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Project drawer — History / All (system events): subtasks, assignees, child tasks, etc.
 * Query: limit (default 50, max 100), offset (default 0).
 * Optional `taskId`: restrict to that single work-item row (subtask brief).
 * Optional `includeSubtree=true`: also include child tasks under `taskId` (default false).
 */
export const getProjectActivity = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset ?? '0'), 10) || 0);
    const includeSubtree =
      String(req.query.includeSubtree ?? 'false').toLowerCase() === 'true';
    const rawTaskId = req.query.taskId;
    const rawTaskRef = req.query.taskIdByRef ?? req.query.referenceNumber;
    let taskIdFilter =
      typeof rawTaskId === 'string' && rawTaskId.trim().length > 0 ? rawTaskId.trim() : null;
    if (!taskIdFilter && typeof rawTaskRef === 'string' && rawTaskRef.trim().length > 0) {
      const ref = rawTaskRef.trim();
      const byRef = await prisma.task.findFirst({
        where: { projectId: id, referenceNumber: ref },
        select: { id: true },
      });
      taskIdFilter = byRef?.id ?? null;
    }

    const access = await assertDrawerProjectAccess(req, id);
    if (access === '404') {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }
    if (access === '403') {
      res.status(403).json({ success: false, message: 'You do not have access to this project' });
      return;
    }

    let activityWhere: {
      projectId: string;
      taskId?: string | { in: string[] };
    } = { projectId: id };
    if (taskIdFilter) {
      const root = await prisma.task.findFirst({
        where: { id: taskIdFilter, projectId: id },
        select: { id: true },
      });
      if (!root) {
        res.status(404).json({ success: false, message: 'Task not found in this project' });
        return;
      }
      if (includeSubtree) {
        const scopeIds = await collectTaskSubtreeTaskIds(taskIdFilter, id);
        activityWhere = { projectId: id, taskId: { in: scopeIds } };
      } else {
        activityWhere = { projectId: id, taskId: taskIdFilter };
      }
    }

    const [rawItems, total] = await Promise.all([
      prisma.projectActivityLog.findMany({
        where: activityWhere,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          actor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              photo: true,
            },
          },
        },
      }),
      prisma.projectActivityLog.count({ where: activityWhere }),
    ]);

    const hydrated = await hydrateProjectActivityItems(rawItems, id);
    const items = hydrated.map((row) => {
      const detailLines = formatActivityChangeLines(row.metadata);
      return {
        ...row,
        detailLines,
        displaySummary: row.displaySummary ?? row.summary,
      };
    });

    res.json({
      success: true,
      data: {
        items,
        pagination: { total, limit, offset, hasMore: offset + items.length < total },
      },
    });
  } catch (error) {
    console.error('Get project activity error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Create new project
export const createProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Employee/Manager role: Cannot create projects (only project managers/admins can create)
    // Managers use the SAME module as employees - they cannot create projects
    if (req.user?.role === 'EMPLOYEE' || req.user?.role === 'MANAGER') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to create projects. Only project managers and admins can create projects.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    const {
      name,
      referenceNumber,
      pin,
      clientId,
      owner,
      description,
      status,
      projectManager, // Plain text string (not projectManagerId)
      startDate,
      endDate,
      deadline,
      planDays,
      remarks,
      assigneeNotes,
      employeeIds, // Array of employee IDs to assign
      contractReferenceNumber, // Contract reference number for auto-population
      // Location & Project Details
      location,
      makaniNumber,
      plotNumber,
      community,
      projectType,
      projectFloor,
      developerProject,
    } = req.body;

    // If contract reference number is provided, fetch contract and auto-populate fields
    let contractData: any = null;
    let contractId: string | null = null;
    
    // Use let for fields that might be auto-populated from contract
    let finalClientId = clientId;
    let finalStartDate = startDate;
    let finalEndDate = endDate;
    let finalDescription = description;
    let finalLocation = location;
    let finalMakaniNumber = makaniNumber;
    let finalPlotNumber = plotNumber;
    let finalCommunity = community;
    let finalProjectType = projectType;
    let finalProjectFloor = projectFloor;
    let finalDeveloperProject = developerProject;
    
    if (contractReferenceNumber) {
      try {
        const contract = await prisma.contract.findUnique({
          where: { referenceNumber: contractReferenceNumber },
          include: {
            client: true,
          },
        });

        if (contract) {
          contractData = contract;
          contractId = contract.id;
          
          // Auto-populate fields from contract if not provided
          if (!finalClientId && contract.clientId) {
            finalClientId = contract.clientId;
          }
          if (!finalStartDate && contract.startDate) {
            finalStartDate = contract.startDate.toISOString();
          }
          if (!finalEndDate && contract.endDate) {
            finalEndDate = contract.endDate.toISOString();
          }
          if (!finalDescription && contract.description) {
            finalDescription = contract.description;
          }
          // Auto-populate location fields from contract if not provided
          if (!finalMakaniNumber && contract.makaniNumber) {
            finalMakaniNumber = contract.makaniNumber;
          }
          if (!finalPlotNumber && contract.plotNumber) {
            finalPlotNumber = contract.plotNumber;
          }
          if (!finalCommunity && contract.community) {
            finalCommunity = contract.community;
          }
          if (!finalProjectType && contract.contractType) {
            finalProjectType = contract.contractType;
          }
          if (!finalProjectFloor && contract.numberOfFloors) {
            finalProjectFloor = contract.numberOfFloors.toString();
          }
          if (!finalDeveloperProject && contract.developerName) {
            finalDeveloperProject = contract.developerName;
          }
          // Build location string from coordinates only (not Makani)
          if (!finalLocation && contract.latitude && contract.longitude) {
            finalLocation = `${contract.latitude}, ${contract.longitude}`;
          }
        } else {
          console.warn(`⚠️ Contract with reference number ${contractReferenceNumber} not found`);
        }
      } catch (contractError) {
        console.error('Error fetching contract for auto-population:', contractError);
        // Continue with project creation even if contract lookup fails
      }
    }

    // Validate required fields - reference number is required, name is optional
    if (!referenceNumber) {
      res.status(400).json({
        success: false,
        message: 'Reference number is required',
      });
      return;
    }
    
    // Auto-generate project name if not provided
    let finalName = name && name.trim() !== '' 
      ? name.trim() 
      : (contractData && contractData.title 
          ? contractData.title 
          : `Project ${referenceNumber}`);

    // Check if reference number already exists
    const existingProject = await prisma.project.findUnique({
      where: { referenceNumber },
    });

    if (existingProject) {
      res.status(400).json({
        success: false,
        message: 'Project with this reference number already exists',
      });
      return;
    }

    // Check if PIN already exists (if provided)
    if (pin) {
      const existingPin = await prisma.project.findUnique({
        where: { pin },
      });

      if (existingPin) {
        res.status(400).json({
          success: false,
          message: 'Project with this PIN already exists',
        });
        return;
      }
    }

    // Determine project status - default to OPEN (which counts as active)
    const projectStatus = normalizeProjectStatusValue(status) ?? ProjectStatus.OPEN;
    
    console.log(`📝 Creating project: ${finalName}`);
    console.log(`   Reference Number: ${referenceNumber}`);
    console.log(`   Status: ${projectStatus} (will count as ${projectStatus === ProjectStatus.OPEN || projectStatus === ProjectStatus.IN_PROGRESS ? 'ACTIVE' : 'INACTIVE'})`);
    console.log(`   Created By: ${req.user?.id}`);
    if (!name || name.trim() === '') {
      console.log(`   ⚠️ Project name was auto-generated: ${finalName}`);
    }

    // Validate and trim projectManager (max 100 characters)
    const projectManagerText = projectManager 
      ? String(projectManager).trim().substring(0, 100) 
      : null;

    // Create project
    const project = await prisma.$transaction(async (tx) => {
      const projectNumber = await computeNextProjectNumber(tx as any);
      return tx.project.create({
        data: {
          projectNumber,
          name: finalName,
          referenceNumber,
          pin: pin || null,
          clientId: finalClientId || null,
          owner: owner || null,
          description: finalDescription || null,
          status: projectStatus, // Use enum value, not string
          projectManager: projectManagerText, // Plain text string
          startDate: finalStartDate ? new Date(finalStartDate) : null,
          endDate: finalEndDate ? new Date(finalEndDate) : null,
          deadline: deadline ? new Date(deadline) : null,
          planDays: planDays ? parseInt(planDays, 10) : null,
          remarks: remarks || null,
          assigneeNotes: assigneeNotes || null,
          // Location & Project Details
          location: finalLocation || null,
          makaniNumber: finalMakaniNumber || null,
          plotNumber: finalPlotNumber || null,
          community: finalCommunity || null,
          projectType: finalProjectType || null,
          projectFloor: finalProjectFloor || null,
          developerProject: finalDeveloperProject || null,
          createdBy: req.user?.id || null,
          assignedEmployees:
            employeeIds && employeeIds.length > 0
              ? {
                  create: employeeIds.map((employeeId: string) => ({
                    employeeId,
                    assignedBy: req.user?.id || null,
                  })),
                }
              : undefined,
        },
        include: {
          client: true,
          assignedEmployees: {
            include: {
              employee: { select: USER_AVATAR_SELECT },
            },
          },
        },
      });
    }, { isolationLevel: 'Serializable' as any });

    // Link contract to project if contract reference was provided
    if (contractId && contractData) {
      try {
        await prisma.contract.update({
          where: { id: contractId },
          data: { projectId: project.id },
        });
        console.log(`✅ Contract ${contractReferenceNumber} linked to project ${project.id}`);
        if (contractData.assignedManagerId) {
          await notifyPmProjectAssignment(
            contractData.assignedManagerId,
            project.id,
            'ASSIGNMENT',
            req.user?.id,
          );
        }
      } catch (linkError) {
        console.error('Error linking contract to project:', linkError);
        // Don't fail project creation if contract linking fails
      }
    }

    // Log successful creation
    console.log(`✅ Project created successfully: ${project.id}`);
    console.log(`   Final Status: ${project.status}`);
    if (contractReferenceNumber) {
      console.log(`   Linked to Contract: ${contractReferenceNumber}`);
    }
    
    // Verify the project was saved correctly
    const verifyProject = await prisma.project.findUnique({
      where: { id: project.id },
      select: { id: true, projectNumber: true, name: true, status: true, referenceNumber: true }
    });
    console.log(`   Verified in DB:`, verifyProject);

    // Fetch the project with contract relation if linked
    const projectWithContract = await prisma.project.findUnique({
      where: { id: project.id },
      include: {
        client: true,
        assignedEmployees: {
          include: {
            employee: { select: USER_AVATAR_SELECT },
          },
        },
        contracts: {
          select: {
            id: true,
            referenceNumber: true,
            title: true,
            status: true,
            builtUpArea: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: projectWithContract || project,
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Update project
export const updateProject = async (req: AuthRequest, res: Response): Promise<void> => {
  projectDebugLog('🚀 updateProject called');
  projectDebugLog('👤 User:', req.user?.email, 'Role:', req.user?.role);
  const body = req.body as Record<string, unknown>;
  projectDebugLog('📥 updateProject body keys:', body ? Object.keys(body) : []);
  if (body && (body as any).projectNumber !== undefined) {
    console.warn('⚠️ Ignoring attempt to update projectNumber (immutable).');
  }
  if (body && (body.name !== undefined || body.projectName !== undefined || body.title !== undefined)) {
    projectDebugLog('📥 updateProject name-related:', { name: body.name, projectName: body.projectName, title: body.title });
  }

  try {
    const { id } = req.params;
    projectDebugLog(`📋 Updating project ${id}`);
    
    const {
      name: nameFromBody,
      projectName, // Frontend may send project name as projectName
      referenceNumber,
      pin,
      clientId,
      owner,
      description,
      status,
      projectManager, // Plain text string (not projectManagerId)
      startDate,
      endDate,
      deadline,
      planDays,
      remarks,
      assigneeNotes,
      // Location & Project Details
      location,
      makaniNumber,
      plotNumber,
      community,
      projectType,
      projectFloor,
      developerProject,
      // Subtasks and child subtasks
      subtasks,
      childSubtasks,
    } = req.body;

    // Project name: read from every common body key so modal save always persists
    const b = req.body as any;
    const nameRaw =
      nameFromBody !== undefined ? nameFromBody
      : projectName !== undefined ? projectName
      : b?.project?.name ?? b?.data?.name ?? b?.title ?? b?.label ?? b?.projectTitle ?? b?.project_name;
    const projectNameToSave = typeof nameRaw === 'string' ? nameRaw.trim() : (nameRaw != null ? String(nameRaw).trim() : '');
    const shouldUpdateName =
      nameFromBody !== undefined || projectName !== undefined ||
      b?.project?.name !== undefined || b?.data?.name !== undefined || b?.title !== undefined ||
      b?.label !== undefined || b?.projectTitle !== undefined || b?.project_name !== undefined;
    if (shouldUpdateName) {
      console.log(`📝 Project name will be saved: "${projectNameToSave}" (received from body)`);
    }
    
    // Log incoming data structure
    if (subtasks && Array.isArray(subtasks)) {
      console.log(`📥 Received ${subtasks.length} subtasks in request`);
      console.log(`📥 Subtasks summary:`, subtasks.map((st: any) => ({
        id: st.id || 'NO_ID',
        name: st.name || st.title || 'NO_NAME',
        childCount: st.childSubtasks ? st.childSubtasks.length : 0
      })));
    } else {
      console.log(`📥 No subtasks in request body`);
    }

    // Support "add child task" payload: frontend may send parentSubtaskId + childSubtaskName (or newChildTask)
    // Use subtasksToSave so add-child-only path (when body has no subtasks) can still run the save block
    const parentSubtaskId = req.body.parentSubtaskId;
    const childSubtaskName = req.body.childSubtaskName ?? req.body.newChildTask?.name ?? req.body.newChildTask?.title;
    let subtasksToSave: any[] | undefined = subtasks && Array.isArray(subtasks) ? [...subtasks] : undefined;

    if (parentSubtaskId && childSubtaskName && subtasksToSave && subtasksToSave.length > 0) {
      const parentSubtask = subtasksToSave.find((st: any) => String(st.id) === String(parentSubtaskId));
      if (parentSubtask) {
        const childArray = Array.isArray(parentSubtask.childSubtasks) ? parentSubtask.childSubtasks : [];
        const nameStr = String(childSubtaskName).trim();
        const alreadyHas = childArray.some((c: any) => (c.name || c.title || '').trim() === nameStr);
        if (!alreadyHas && nameStr) {
          parentSubtask.childSubtasks = [...childArray, { name: nameStr, title: nameStr }];
          console.log(`📥 Merged new child task "${nameStr}" into subtask ${parentSubtaskId} (childSubtasks now: ${parentSubtask.childSubtasks.length})`);
        }
      } else {
        console.warn(`⚠️ parentSubtaskId ${parentSubtaskId} not found in subtasks array`);
      }
    }

    // Check if project exists
    const existingProject = await prisma.project.findUnique({
      where: { id },
      include: {
        assignedEmployees: {
          select: {
            employeeId: true,
          },
        },
        contracts: {
          select: {
            assignedManagerId: true,
            assignedManagerEmail: true,
          },
        },
        tasks: {
          select: {
            id: true,
            assignedEmployeeId: true,
            subtasks: {
              select: {
                id: true,
                assignedEmployeeId: true,
                subtasks: {
                  select: {
                    id: true,
                    assignedEmployeeId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!existingProject) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    // Employee/Manager role: managers may update owned projects or task-assigned projects (task-only = subtasks only).
    let managerOwnsProject = false;
    let managerTaskOnlyAccess = false;
    if (normalizeErpRole(req.user?.role) === 'EMPLOYEE' || normalizeErpRole(req.user?.role) === 'MANAGER') {
      if (normalizeErpRole(req.user?.role) === 'MANAGER') {
        const isCreator = existingProject.createdBy === req.user!.id;
        const managerUser = await prisma.user.findUnique({
          where: { id: req.user!.id },
          select: { email: true, firstName: true, lastName: true },
        });
        managerOwnsProject = managerOwnsProjectAsPm(existingProject as any, {
          id: req.user!.id,
          email: managerUser?.email ?? req.user?.email ?? null,
          nameVariations: buildUserNameVariations(managerUser?.firstName, managerUser?.lastName),
        });

        const allowed =
          isCreator ||
          managerOwnsProject ||
          (await managerMayAccessProjectWithTransfers(id, req.user!.id, managerOwnsProject));
        if (!allowed) {
          res.status(403).json({
            success: false,
            message: 'Access Denied: You do not have access to this project.',
            code: 'ACCESS_DENIED',
          });
          return;
        }
        managerTaskOnlyAccess = !managerOwnsProject && !isCreator;
      }
    }

    let normalizedStatus = normalizeProjectStatusValue(status);
    // Employees cannot change project-level status (UI shows it read-only).
    // Drop the status from their payload instead of rejecting, so other edits still save.
    if (
      req.user?.role === 'EMPLOYEE' &&
      normalizedStatus !== undefined &&
      normalizedStatus !== existingProject.status
    ) {
      console.warn(
        `⚠️ EMPLOYEE ${req.user.email} attempted to change project ${id} status ` +
          `${existingProject.status} -> ${normalizedStatus} — ignored (not permitted)`,
      );
      normalizedStatus = undefined;
    }
    const nextProjectStatus = normalizedStatus ?? existingProject.status;
    const shouldCascadeSuspension =
      nextProjectStatus === ProjectStatus.ON_HOLD &&
      existingProject.status !== ProjectStatus.ON_HOLD;
    const isCurrentlySuspended = isProjectSuspendedStatus(existingProject.status);
    const canReactivate =
      isCurrentlySuspended &&
      normalizedStatus !== undefined &&
      normalizedStatus !== ProjectStatus.ON_HOLD &&
      userCanReactivateSuspendedProject(req.user);

    if (isCurrentlySuspended && !canReactivate) {
      res.status(423).json({
        success: false,
        message: PROJECT_SUSPENDED_MESSAGE,
        code: 'PROJECT_SUSPENDED',
      });
      return;
    }

    // When frontend sends only "add child" (parentSubtaskId + childSubtaskName) without full subtasks array,
    // load existing task tree from DB, merge the new child, and set subtasksToSave so the save block runs
    if (parentSubtaskId && childSubtaskName && (!subtasksToSave || subtasksToSave.length === 0)) {
      const projectWithTasks = await prisma.project.findUnique({
        where: { id },
        include: {
          tasks: {
            where: { parentTaskId: null },
            orderBy: [...TASK_ORDER_THEN_CREATED_AT],
            include: {
              subtasks: {
                orderBy: [...TASK_ORDER_THEN_CREATED_AT],
                include: {
                  subtasks: { orderBy: [...TASK_ORDER_THEN_CREATED_AT] },
                },
              },
            },
          },
        },
      });
      if (projectWithTasks?.tasks && Array.isArray(projectWithTasks.tasks) && projectWithTasks.tasks.length > 0) {
        const built = projectWithTasks.tasks.map((t: any) => ({
          id: t.id,
          name: t.title,
          title: t.title,
          status: t.status,
          priority: t.priority,
          category: t.category,
          referenceNumber: t.referenceNumber,
          planDays: t.planDays,
          remarks: t.remarks,
          assigneeNotes: t.assigneeNotes,
          assignedEmployeeId: t.assignedEmployeeId,
          startDate: t.startDate,
          endDate: t.dueDate,
          timeline: t.startDate && t.dueDate ? [t.startDate, t.dueDate] : undefined,
          location: t.location,
          plotNumber: t.plotNumber,
          community: t.community,
          projectType: t.projectType,
          projectFloor: t.projectFloor,
          developerProject: t.developerProject,
          predecessors: t.predecessors ?? null,
          childSubtasks: (t.subtasks || []).map((st: any) => ({
            id: st.id,
            name: st.title,
            title: st.title,
            status: st.status,
            priority: st.priority,
            assignedEmployeeId: st.assignedEmployeeId,
            predecessors: st.predecessors ?? null,
            childSubtasks: (st.subtasks || []).map((c: any) => ({
              id: c.id,
              name: c.title,
              title: c.title,
              status: c.status,
              assignedEmployeeId: c.assignedEmployeeId,
              predecessors: c.predecessors ?? null,
            })),
          })),
        }));
        const mainTaskParent = built.find((st: any) => String(st.id) === String(parentSubtaskId));
        let level2Parent: any = null;
        if (!mainTaskParent) {
          for (const main of built) {
            const inChildren = (main.childSubtasks || []).find((st: any) => String(st.id) === String(parentSubtaskId));
            if (inChildren) {
              level2Parent = inChildren;
              break;
            }
          }
        }
        const parentSubtask = mainTaskParent || level2Parent;
        if (parentSubtask) {
          const childArray = Array.isArray(parentSubtask.childSubtasks) ? parentSubtask.childSubtasks : [];
          const nameStr = String(childSubtaskName).trim();
          const alreadyHas = childArray.some((c: any) => (c.name || c.title || '').trim() === nameStr);
          if (!alreadyHas && nameStr) {
            if (managerTaskOnlyAccess) {
              console.warn(
                `⛔ Add-child-only blocked for task-only manager ${req.user?.id} on project ${id}`,
              );
            } else {
            parentSubtask.childSubtasks = [...childArray, { name: nameStr, title: nameStr }];
            const projectDefaults: ProjectLocationDefaults = {
              location: projectWithTasks.location ?? null,
              makaniNumber: projectWithTasks.makaniNumber ?? null,
              plotNumber: projectWithTasks.plotNumber ?? null,
              community: projectWithTasks.community ?? null,
              projectType: projectWithTasks.projectType ?? null,
              projectFloor: projectWithTasks.projectFloor ?? null,
              developerProject: projectWithTasks.developerProject ?? null,
            };
            // Always persist new child tasks directly via helper.
            await saveChildSubtasks(
              parentSubtaskId,
              id,
              parentSubtask.childSubtasks,
              req.user?.id ?? null,
              projectDefaults,
              req.user?.id ?? null,
              req.user?.role ?? null,
              (existingProject as any).createdBy ?? null,
              (status !== undefined && status !== null && String(status).trim() !== ''
                ? String(status)
                : (projectWithTasks as any).status) ?? null,
              undefined,
              false,
              managerOwnsProject,
            );
            console.log(`📥 Add-child-only: saved new child "${nameStr}" under parent ${parentSubtaskId}`);
            }
          }
        } else {
          console.warn(`⚠️ Add-child-only: parentSubtaskId ${parentSubtaskId} not found in project task tree`);
        }
      }
    }

    // Check if reference number is being changed and already exists
    if (referenceNumber && referenceNumber !== existingProject.referenceNumber) {
      const refExists = await prisma.project.findUnique({
        where: { referenceNumber },
      });

      if (refExists) {
        res.status(400).json({
          success: false,
          message: 'Project with this reference number already exists',
        });
        return;
      }
    }

    // Check if PIN is being changed and already exists
    if (pin && pin !== existingProject.pin) {
      const pinExists = await prisma.project.findUnique({
        where: { pin },
      });

      if (pinExists) {
        res.status(400).json({
          success: false,
          message: 'Project with this PIN already exists',
        });
        return;
      }
    }

    // Task-only managers cannot change project-level fields (status, PM, dates, etc.).
    if (managerTaskOnlyAccess) {
      const projectFieldKeys = [
        'name',
        'projectName',
        'referenceNumber',
        'pin',
        'clientId',
        'owner',
        'description',
        'status',
        'projectManager',
        'startDate',
        'endDate',
        'deadline',
        'planDays',
        'remarks',
        'assigneeNotes',
        'location',
        'makaniNumber',
        'plotNumber',
        'community',
        'projectType',
        'projectFloor',
        'developerProject',
      ] as const;
      const triesProjectFieldUpdate = projectFieldKeys.some((k) => req.body[k] !== undefined);
      if (triesProjectFieldUpdate && (!subtasksToSave || subtasksToSave.length === 0)) {
        res.status(403).json({
          success: false,
          message:
            'You can only edit tasks assigned to you on projects you do not manage. Project-level fields cannot be changed.',
          code: 'ACCESS_DENIED',
        });
        return;
      }
      if (triesProjectFieldUpdate) {
        console.warn(
          `⚠️ MANAGER ${req.user?.email} on task-only project ${id} — ignoring project-level field updates`,
        );
      }
      normalizedStatus = undefined;
    }

    // Validate and trim projectManager (max 100 characters)
    const projectManagerText = projectManager !== undefined
      ? (projectManager ? String(projectManager).trim().substring(0, 100) : null)
      : undefined;

    // Update project (name is editable in modal; save whenever name or projectName is sent so it reflects in backend)
    const nameToWrite =
      !managerTaskOnlyAccess && shouldUpdateName && projectNameToSave.length > 0
        ? projectNameToSave
        : undefined;
    if (nameToWrite) {
      console.log(`📝 Persisting project name to DB: "${nameToWrite}"`);
    }
    let project: any;
    if (managerTaskOnlyAccess) {
      project = await prisma.project.findUnique({
        where: { id },
        include: {
          client: true,
          assignedEmployees: {
            include: {
              employee: { select: USER_AVATAR_SELECT },
            },
          },
        },
      });
      if (!project) {
        res.status(404).json({ success: false, message: 'Project not found' });
        return;
      }
    } else {
      project = await prisma.project.update({
        where: { id },
        data: {
          ...(nameToWrite ? { name: nameToWrite } : {}),
          ...(referenceNumber && { referenceNumber }),
          ...(pin !== undefined && { pin: pin || null }),
          ...(clientId !== undefined && { clientId: clientId || null }),
          ...(owner !== undefined && { owner: owner || null }),
          ...(description !== undefined && { description: description || null }),
          ...(normalizedStatus && { status: normalizedStatus }),
          ...(projectManagerText !== undefined && { projectManager: projectManagerText }),
          ...(startDate && { startDate: new Date(startDate) }),
          ...(endDate && { endDate: new Date(endDate) }),
          ...(deadline && { deadline: new Date(deadline) }),
          ...(planDays !== undefined && { planDays: planDays ? parseInt(planDays, 10) : null }),
          ...(remarks !== undefined && { remarks: remarks || null }),
          ...(assigneeNotes !== undefined && { assigneeNotes: assigneeNotes || null }),
          // Location & Project Details
          ...(location !== undefined && { location: location || null }),
          ...(makaniNumber !== undefined && { makaniNumber: makaniNumber || null }),
          ...(plotNumber !== undefined && { plotNumber: plotNumber || null }),
          ...(community !== undefined && { community: community || null }),
          ...(projectType !== undefined && { projectType: projectType || null }),
          ...(projectFloor !== undefined && { projectFloor: projectFloor || null }),
          ...(developerProject !== undefined && { developerProject: developerProject || null }),
        },
        include: {
          client: true,
          assignedEmployees: {
            include: {
              employee: { select: USER_AVATAR_SELECT },
            },
          },
        },
      });
    }

    // Save/update subtasks and child subtasks if provided (use subtasksToSave so add-child-only path runs save too)
    // Employees can save child tasks to tasks assigned to them
    if (subtasksToSave && Array.isArray(subtasksToSave)) {
      try {
        const projectCreatorId = (existingProject as any).createdBy ?? null;
        console.log(`📝 Saving ${subtasksToSave.length} subtasks for project ${id} (user: ${req.user?.id}, role: ${req.user?.role}, email: ${req.user?.email})`);
        console.log(`📝 Subtasks structure:`, JSON.stringify(subtasksToSave.map((st: any) => ({
          id: st.id,
          name: st.name,
          title: st.title,
          childSubtasks: st.childSubtasks ? `${st.childSubtasks.length} children` : 'none',
        })), null, 2));
        
        // Log detailed child task information
        subtasksToSave.forEach((st: any, index: number) => {
          if (st.childSubtasks && Array.isArray(st.childSubtasks) && st.childSubtasks.length > 0) {
            console.log(`📋 Subtask ${index} (${st.id || 'NEW'}): ${st.name || st.title} has ${st.childSubtasks.length} child tasks:`);
            st.childSubtasks.forEach((child: any, childIndex: number) => {
              console.log(`   Child ${childIndex}: id=${child.id || 'NO_ID'}, name=${child.name || child.title || 'NO_NAME'}, assignedEmployeeId=${child.assignedEmployeeId || child.assignedEmployee || 'NONE'}`);
            });
          }
        });
        
        // Get existing subtasks for this project (tasks with no parentTaskId)
        const subtaskWhereClause: any = {
          projectId: id,
          parentTaskId: null, // Subtasks are direct children of project (no parent task)
        };
        const existingSubtasks = await prisma.task.findMany({
          where: subtaskWhereClause,
          include: {
            assignments: {
              select: { employeeId: true },
            },
            delegations: { select: { originalAssigneeId: true, newAssigneeId: true } },
          },
        });

        const existingSubtaskIds = new Set(existingSubtasks.map(st => st.id));
        const incomingSubtaskIds = new Set(subtasksToSave.filter((st: any) => st.id).map((st: any) => st.id));

        // Delete subtasks that are no longer in the incoming list.
        // CRITICAL: When an EMPLOYEE (or a collaborator PM) updates a project, the frontend may send
        // a partial subtask list (only rows visible to that user). We must NOT treat "missing" as
        // "deleted" unless the caller can delete every missing row — otherwise the whole PUT fails
        // with 403 and status changes never persist (e.g. assignee marks Done, refresh reverts).
        const missingFromPayload = existingSubtasks.filter((st) => !incomingSubtaskIds.has(st.id));
        const authUser = req.user;
        const canDeleteEveryMissingSubtask =
          authUser?.id &&
          authUser.role &&
          missingFromPayload.length > 0 &&
          missingFromPayload.every((st) =>
            computeTaskPermissions({
              user: { id: authUser.id, role: authUser.role as any },
              task: st as any,
              projectCreatedById: projectCreatorId,
              projectStatus: project.status,
              userManagesProject: managerOwnsProject,
            }).canDelete,
          );

        if (req.user?.role === 'EMPLOYEE') {
          if (missingFromPayload.length > 0) {
            console.log(
              `⚠️ Skipping deletion of ${missingFromPayload.length} subtasks (partial payload from EMPLOYEE)`,
            );
          }
        } else if (missingFromPayload.length > 0 && canDeleteEveryMissingSubtask) {
          console.log(`🗑️ Deleting ${missingFromPayload.length} removed subtasks`);
          for (const st of missingFromPayload) {
            await logProjectActivity({
              projectId: id,
              actorId: req.user?.id,
              action: 'SUBTASK_DELETED',
              taskId: st.id,
              summary: `Removed work item "${st.title}"`,
              metadata: { taskTitle: st.title },
            });
          }
          await softDeleteTasks(missingFromPayload.map((st) => st.id));
        } else if (missingFromPayload.length > 0) {
          console.log(
            `⚠️ Skipping deletion of ${missingFromPayload.length} subtasks (partial payload or insufficient delete permission; applying updates only)`,
          );
        }

        await syncProjectPredecessorLinksFromDisplayKeys(prisma, id);

        const allProjectTasksForPred = await prisma.task.findMany({
          where: { projectId: id },
          select: { id: true, stableWorkSeq: true, taskOrder: true, parentTaskId: true, displayAnchorSeq: true, displaySuffix: true },
        });
        const predResolveIndex = buildPredecessorResolveIndex(allProjectTasksForPred);
        const projectMetaForPred = await prisma.project.findUnique({
          where: { id },
          select: { projectNumber: true },
        });
        const predProjectNumber = projectMetaForPred?.projectNumber ?? 1;
        const resolvePredKey = (key: string) =>
          resolvePredecessorIdFromDisplayKey(key, predResolveIndex, {
            allRows: allProjectTasksForPred,
            projectNumber: predProjectNumber,
          });

        const allProjectTasksById = await prisma.task.findMany({
          where: { projectId: id },
          select: {
            id: true,
            predecessorId: true,
            predecessors: true,
            status: true,
            workflowStatus: true,
            parentTaskId: true,
          },
        });
        const existingTaskById = new Map(allProjectTasksById.map((t) => [t.id, t]));

        // Preload predecessor completion for subtasks so workflowStatus stays correct when the client
        // omits predecessorId on save (otherwise WAITING_FOR_PREDECESSOR was overwritten with NOT_STARTED).
        const subtaskPredecessorIds = new Set<string>();
        for (const st of subtasksToSave) {
          const ex = st.id ? existingTaskById.get(st.id) : undefined;
          const eff = resolveEffectivePredecessorForTaskRow(st, ex, resolvePredKey);
          if (eff) subtaskPredecessorIds.add(eff);
        }
        const predecessorCompletionRows =
          subtaskPredecessorIds.size > 0
            ? await prisma.task.findMany({
                where: { id: { in: Array.from(subtaskPredecessorIds) } },
                select: { id: true, status: true, workflowStatus: true },
              })
            : [];
        const predecessorCompletedById = new Map(
          predecessorCompletionRows.map((p) => [p.id, isPredecessorRowCompleted(p)]),
        );

        // Project defaults from manager project list: inherit into all subtasks and child tasks
        const projectDefaults: ProjectLocationDefaults = {
          location: project.location ?? null,
          makaniNumber: project.makaniNumber ?? null,
          plotNumber: project.plotNumber ?? null,
          community: project.community ?? null,
          projectType: project.projectType ?? null,
          projectFloor: project.projectFloor ?? null,
          developerProject: project.developerProject ?? null,
        };

        // Create or update subtasks (inherit plot number, community, project type, no. of floors, developer name from project)
        const referencePlanDaysMap = await loadReferencePlanDaysData(prisma);
        const syncFromReference = !isReferenceProjectRef((existingProject as any).referenceNumber);
        let createdCount = 0;
        let updatedCount = 0;
        for (let subtaskIndex = 0; subtaskIndex < subtasksToSave.length; subtaskIndex++) {
          const subtask = subtasksToSave[subtaskIndex];
          const parsedOrder =
            subtask.taskOrder != null ? parseInt(String(subtask.taskOrder), 10) : NaN;
          const taskOrderForRow = Number.isFinite(parsedOrder) ? parsedOrder : subtaskIndex;

          const existingOneEarly = subtask.id ? existingTaskById.get(subtask.id) : undefined;
          const effectivePredecessorId = resolveEffectivePredecessorForTaskRow(
            subtask,
            existingOneEarly,
            resolvePredKey,
          );
          let predecessorDoneForRow = true;
          if (effectivePredecessorId) {
            if (predecessorCompletedById.has(effectivePredecessorId)) {
              predecessorDoneForRow =
                predecessorCompletedById.get(effectivePredecessorId) ?? false;
            } else {
              const predRow = await prisma.task.findUnique({
                where: { id: effectivePredecessorId },
                select: { status: true, workflowStatus: true },
              });
              predecessorDoneForRow = isPredecessorRowCompleted(predRow);
              predecessorCompletedById.set(effectivePredecessorId, predecessorDoneForRow);
            }
          }
          const isLockedByPred = !!effectivePredecessorId && !predecessorDoneForRow;

          const mappedRawStatus = mapStatusToTaskStatus(subtask.status);
          let mappedSubtaskStatus = clampTaskStatusAgainstIncompletePredecessor(
            mappedRawStatus,
            effectivePredecessorId,
            predecessorDoneForRow,
          );
          const isExistingSubtaskRow = !!(subtask.id && existingSubtaskIds.has(subtask.id));
          const pmReopeningCompleted =
            isExistingSubtaskRow &&
            existingOneEarly?.status === TaskStatus.COMPLETED &&
            mappedSubtaskStatus !== TaskStatus.COMPLETED &&
            authUser?.id &&
            userCanUnlockCompletedTask(
              { id: authUser.id, role: authUser.role as any },
              projectCreatorId,
            );
          if (
            isExistingSubtaskRow &&
            existingOneEarly &&
            !pmReopeningCompleted &&
            shouldPreserveCompletedTaskStatusOnSave(
              existingOneEarly,
              subtask.status,
              mappedSubtaskStatus,
            )
          ) {
            mappedSubtaskStatus = existingOneEarly.status as TaskStatus;
            predecessorDoneForRow = true;
          }

          const subtaskTitle = subtask.name || subtask.title || '';
          const subtaskData: any = {
            title: subtaskTitle,
            projectId: id,
            parentTaskId: null,
            status: mappedSubtaskStatus,
            priority: mapPriorityToTaskPriority(
              resolvePriorityForTaskTitle(subtaskTitle, subtask.priority, referencePlanDaysMap, subtaskIndex) ||
                subtask.priority,
            ),
            category: resolveCategoryForTaskTitle(
              subtaskTitle,
              subtask.category,
              referencePlanDaysMap,
              subtaskIndex,
            ),
            referenceNumber: subtask.referenceNumber || null,
            planDays: resolvePlanDaysForTaskTitle(
              subtaskTitle,
              subtask.planDays,
              referencePlanDaysMap,
              subtaskIndex,
            ),
            remarks: subtask.remarks || null,
            assigneeNotes: subtask.assigneeNotes || null,
            link:
              subtask.link != null && String(subtask.link).trim() !== ''
                ? String(subtask.link).trim()
                : null,
            createdBy: req.user?.id ?? null,
            location: subtask.location ?? projectDefaults.location ?? null,
            makaniNumber: subtask.makaniNumber ?? projectDefaults.makaniNumber ?? null,
            plotNumber: subtask.plotNumber ?? projectDefaults.plotNumber ?? null,
            community: subtask.community ?? projectDefaults.community ?? null,
            projectType: subtask.projectType ?? projectDefaults.projectType ?? null,
            projectFloor: subtask.projectFloor ?? projectDefaults.projectFloor ?? null,
            developerProject: subtask.developerProject ?? projectDefaults.developerProject ?? null,
            description: subtask.description || subtask.remarks || null,
            tags: Array.isArray(subtask.tags) ? subtask.tags : [],
            // Persist row index when client omits taskOrder so DB sort matches Main Table order (avoids NULLs last vs small integers).
            taskOrder: taskOrderForRow,
          };
          if (
            (subtask as any).displayAnchorSeq != null &&
            Number.isFinite(Number((subtask as any).displayAnchorSeq))
          ) {
            subtaskData.displayAnchorSeq = Number((subtask as any).displayAnchorSeq);
          }
          if ((subtask as any).displaySuffix != null && String((subtask as any).displaySuffix).trim()) {
            subtaskData.displaySuffix = String((subtask as any).displaySuffix).trim();
          }
          applyEffortFieldsFromPayload(subtaskData, subtask);
          applyRatingFromPayload(subtaskData, subtask);

          if (syncFromReference) {
            const refAligned = applyReferenceTemplateToTaskRow(
              {
                title: subtaskTitle,
                planDays: subtaskData.planDays,
                category: subtaskData.category,
                priority: subtask.priority,
                assignedEmployeeId:
                  subtask.assignedEmployeeId ??
                  subtask.assignedEmployee ??
                  subtask.assignedTo ??
                  null,
                assignedEmployee: subtask.assignedEmployeeData ?? subtask.assignedEmployee ?? null,
              },
              referencePlanDaysMap,
              subtaskIndex,
            );
            if (refAligned.category) subtaskData.category = refAligned.category;
            if (refAligned.planDays != null && refAligned.planDays > 0) {
              subtaskData.planDays = refAligned.planDays;
            }
            if (refAligned.priority) {
              subtaskData.priority = mapPriorityToTaskPriority(String(refAligned.priority));
            }
            if (refAligned.assignedEmployeeId) {
              subtaskData.assignedEmployeeId = await resolveAssigneeUserId(
                refAligned.assignedEmployeeId,
              );
            }
          }

          // Only set assignedEmployeeId when the payload explicitly provides an assignee.
          // Do not overwrite with null for existing subtasks (preserves Khalid's assignment when
          // manager only updates status/predecessors and frontend sends null or omits the field).
          const assigneeInPayload =
            subtask.assignedEmployeeId !== undefined ||
            subtask.assignedEmployee !== undefined ||
            subtask.assignedTo !== undefined;
          const payloadAssignee =
            subtask.assignedEmployeeId ??
            subtask.assignedEmployee ??
            subtask.assignedTo ??
            null;
          const referenceAssigneeId = resolveAssigneeIdForTaskTitle(
            subtaskTitle,
            payloadAssignee,
            referencePlanDaysMap,
            subtaskIndex,
          );
          const isExistingSubtask = subtask.id && existingSubtaskIds.has(subtask.id);
          if (assigneeInPayload && payloadAssignee) {
            const resolvedAssigneeId = await resolveAssigneeUserId(payloadAssignee);
            subtaskData.assignedEmployeeId = resolvedAssigneeId;
          } else if (assigneeInPayload && payloadAssignee === null && !isExistingSubtask) {
            subtaskData.assignedEmployeeId = referenceAssigneeId
              ? await resolveAssigneeUserId(referenceAssigneeId)
              : null;
          } else if (!isExistingSubtask && referenceAssigneeId) {
            subtaskData.assignedEmployeeId = await resolveAssigneeUserId(referenceAssigneeId);
          }
          // If existing subtask and payload has null/undefined assignee: do not set assignedEmployeeId (keep current in DB)

          // Only update predecessors when explicitly sent (avoid wiping on refresh/save when frontend omits field)
          if (subtask.predecessors !== undefined) {
            subtaskData.predecessors =
              subtask.predecessors != null && String(subtask.predecessors).trim() !== ''
                ? String(subtask.predecessors).trim()
                : null;
          }
          // Normalized predecessor link (strict sequencing)
          if (subtask.predecessors !== undefined || subtask.predecessorId !== undefined) {
            subtaskData.predecessorId = effectivePredecessorId;
          }
          subtaskData.workflowStatus = workflowStatusForSavedTaskStatus(
            subtaskData.status,
            effectivePredecessorId,
            predecessorDoneForRow,
          );

          // Handle timeline/dates
          if (subtask.timeline && Array.isArray(subtask.timeline) && subtask.timeline.length >= 2) {
            subtaskData.startDate = subtask.timeline[0] ? new Date(subtask.timeline[0]) : null;
            subtaskData.dueDate = subtask.timeline[1] ? new Date(subtask.timeline[1]) : null;
          } else if (subtask.startDate || subtask.endDate) {
            subtaskData.startDate = subtask.startDate ? new Date(subtask.startDate) : null;
            subtaskData.dueDate = subtask.endDate ? new Date(subtask.endDate) : null;
          }

          if (subtask.id && existingSubtaskIds.has(subtask.id)) {
            // Update existing subtask with permission‑aware logic:
            // - managers/admin/HR/creator can edit all fields
            // - assignees (e.g. Khalid on a row created by Ajmal) can only edit
            //   remarks and assigneeNotes from the main table.
            const existingOne = existingSubtasks.find(
              (st: any) => st.id === subtask.id,
            );

            let updateData: any = {};

            if (req.user?.id && req.user.role) {
              const perms = computeTaskPermissions({
                user: { id: req.user.id, role: req.user.role as any },
                task: existingOne as any,
                projectCreatedById: projectCreatorId,
                projectStatus: project.status,
                userManagesProject: managerOwnsProject,
              });

              if (!perms.canEditAssigneeFields && !perms.canEditMainFields) {
                console.log(
                  `⛔ Skipping update of subtask ${subtask.id} by unauthorised user ${req.user.id}`,
                );
                continue;
              }

              if (perms.canEditMainFields) {
                updateData = { ...subtaskData, createdBy: existingOne?.createdBy ?? null };
              } else if (perms.canEditAssigneeFields) {
                const rawStatus = subtask.status != null ? String(subtask.status).trim().toLowerCase() : '';
                const looksLikeWaitingLabel =
                  rawStatus.includes('waiting') && rawStatus.includes('predecessor');

                // Assignee partial save must not clear predecessor lock (frontend often omits predecessors).
                if (isLockedByPred) {
                  updateData = {
                    workflowStatus: 'WAITING_FOR_PREDECESSOR',
                    status: TaskStatus.PENDING,
                    remarks: subtaskData.remarks,
                    assigneeNotes: subtaskData.assigneeNotes,
                    link: subtaskData.link,
                  };
                } else {
                  updateData = {
                    // If UI sends the human "Waiting for predecessor..." label back, don't downgrade stored status.
                    // This prevents reopening a successor from resetting already-completed predecessors to PENDING.
                    ...(looksLikeWaitingLabel
                      ? {}
                      : {
                          status: subtaskData.status,
                          workflowStatus: subtaskData.workflowStatus,
                        }),
                    remarks: subtaskData.remarks,
                    assigneeNotes: subtaskData.assigneeNotes,
                    link: subtaskData.link,
                  };
                }
              }
            } else {
              // Fallback: preserve previous behaviour if no user context
              updateData = { ...subtaskData, createdBy: existingOne?.createdBy ?? null };
            }

            projectDebugLog(`🔄 Updating subtask ${subtask.id}: ${subtaskData.title}`);
            await prisma.task.update({
              where: { id: subtask.id },
              data: updateData,
            });
            if (authUser?.id && existingOne) {
              void maybeNotifyTaskNotesFromSave({
                projectId: id,
                projectName: project.name,
                projectReferenceNumber: project.referenceNumber,
                taskId: subtask.id,
                taskTitle: String(existingOne.title ?? subtaskData.title ?? ''),
                actorId: authUser.id,
                existing: {
                  remarks: existingOne.remarks,
                  assigneeNotes: existingOne.assigneeNotes,
                },
                incoming: {
                  remarks: subtask.remarks,
                  assigneeNotes: subtask.assigneeNotes,
                },
              });
            }
            const subAssigneeId =
              (updateData.assignedEmployeeId as string | null | undefined) ??
              existingOne?.assignedEmployeeId ??
              null;
            await maybeAwardXpForStatusTransition(
              subtask.id,
              existingOne?.status,
              (updateData.status as TaskStatus | undefined) ?? subtaskData.status,
              subAssigneeId,
            );
            const persistedStatus =
              (updateData.status as TaskStatus | undefined) ?? subtaskData.status;
            if (
              existingOne &&
              isTaskStatusChanged(existingOne.status as TaskStatus, persistedStatus)
            ) {
              await processPmTaskStatusChangeNotification({
                projectId: id,
                taskId: subtask.id,
                taskTitle: String(existingOne.title ?? subtaskData.title ?? ''),
                actor: { id: authUser!.id, role: authUser!.role as any },
                projectCreatedById: projectCreatorId,
                previousStatus: existingOne.status as TaskStatus,
                newStatus: persistedStatus,
                assigneeUserId: subAssigneeId,
                reason: extractStatusReversionReason(subtask),
              });
            }
            const unlockedSub = await unlockDependentsWaitingOnFinishedPredecessor(
              prisma,
              subtask.id,
            );
            for (const d of unlockedSub) {
              const { displayId } = await resolveTaskDisplayIdForTaskId(id, d.id);
              await logProjectActivity({
                projectId: id,
                actorId: req.user?.id,
                action: 'SUCCESSOR_UNBLOCKED_AFTER_PREDECESSOR',
                taskId: d.id,
                summary: `Unblocked ${formatWorkItemRef(d.title, displayId)} — predecessor finished`,
                metadata: {
                  taskTitle: d.title,
                  taskDisplayId: displayId ?? undefined,
                  predecessorTaskId: subtask.id,
                },
              });
            }
            updatedCount++;
            const refreshedSub = await prisma.task.findUnique({
              where: { id: subtask.id },
            });
            const changes = refreshedSub
              ? collectTaskChangesAfterPersist(
                  existingOne as Record<string, unknown>,
                  updateData as Record<string, unknown>,
                  refreshedSub as Record<string, unknown>,
                )
              : collectTaskChanges(
                  existingOne as Record<string, unknown>,
                  updateData as Record<string, unknown>,
                );
            if (changes.length > 0) {
              const workTitle = String((existingOne as any).title ?? '');
              const { displayId } = await resolveTaskDisplayIdForTaskId(id, subtask.id);
              await logProjectActivity({
                projectId: id,
                actorId: req.user?.id,
                action: 'SUBTASK_UPDATED',
                taskId: subtask.id,
                summary: `Updated work item ${formatWorkItemRef(workTitle, displayId)} (${changes.length} field(s))`,
                metadata: {
                  taskTitle: workTitle,
                  taskDisplayId: displayId ?? undefined,
                  changes,
                },
              });
            }
          } else {
            // Create new subtask — task-only managers cannot add rows to projects they do not manage
            if (managerTaskOnlyAccess) {
              console.log(
                `⛔ Skipping create subtask on project ${id}: user ${req.user?.id} is not the project manager`,
              );
              continue;
            }
            console.log(`➕ Creating new subtask: ${subtaskData.title}`);
            const clientSubSeq =
              (subtask as any).stableWorkSeq != null
                ? parseInt(String((subtask as any).stableWorkSeq), 10)
                : NaN;
            const nextSubSeq =
              Number.isFinite(clientSubSeq) && clientSubSeq > 0
                ? clientSubSeq
                : await computeNextMainDisplaySeq(prisma, id, null);
            const newSubtask = await prisma.task.create({
              data: {
                ...subtaskData,
                stableWorkSeq: nextSubSeq,
                taskOrder: subtaskData.taskOrder ?? nextSubSeq,
              },
            });
            console.log(`✅ Created subtask ${newSubtask.id}: ${newSubtask.title}`);
            createdCount++;
            const assigneeName = await userShortLabel(newSubtask.assignedEmployeeId);
            const assigneePart = assigneeName ? ` · Assignee: ${assigneeName}` : '';
            const { displayId: newSubDisplayId } = await resolveTaskDisplayIdForTaskId(
              id,
              newSubtask.id,
            );
            await logProjectActivity({
              projectId: id,
              actorId: req.user?.id,
              action: 'SUBTASK_CREATED',
              taskId: newSubtask.id,
              summary: `Added work item ${formatWorkItemRef(newSubtask.title, newSubDisplayId)}${assigneePart}`,
              metadata: {
                taskTitle: newSubtask.title,
                taskDisplayId: newSubDisplayId ?? undefined,
                assigneeId: newSubtask.assignedEmployeeId,
                assigneeName: assigneeName ?? undefined,
              },
            });

            // Save child subtasks for this subtask (allow empty array to delete all children)
            if (subtask.childSubtasks && Array.isArray(subtask.childSubtasks)) {
              await saveChildSubtasks(
                newSubtask.id,
                id,
                subtask.childSubtasks,
                req.user?.id,
                projectDefaults,
                req.user?.id ?? null,
                req.user?.role ?? null,
                projectCreatorId,
                project.status,
                referencePlanDaysMap,
                syncFromReference,
                managerOwnsProject,
              );
            }
          }
        }

        // IMPORTANT: Refresh existing subtasks list to get IDs of newly created subtasks
        // This ensures we can process child tasks for subtasks that were just created
        const allExistingSubtasks = await prisma.task.findMany({
          where: {
            projectId: id,
            parentTaskId: null,
          },
        });
        console.log(`📋 Refreshed subtasks list: Found ${allExistingSubtasks.length} total subtasks`);
        
        // Create a map of subtask titles to IDs for newly created subtasks
        const createdSubtaskMap = new Map<string, string>();
        allExistingSubtasks.forEach(st => {
          if (st.title) {
            createdSubtaskMap.set(st.title, st.id);
          }
        });
        
        // Handle child subtasks for existing subtasks
        // IMPORTANT: Process child tasks for ALL subtasks (both new and existing) to ensure assignments are preserved
        for (const subtask of subtasksToSave) {
          // Allow empty array so frontend can delete all children under a subtask
          if (subtask.childSubtasks && Array.isArray(subtask.childSubtasks)) {
            // Try to get subtask ID from multiple sources
            let subtaskId = subtask.id ? String(subtask.id).trim() : null;
            
            // If no ID but we have a title, try to find it in the refreshed list
            if (!subtaskId && (subtask.name || subtask.title)) {
              const subtaskTitle = (subtask.name || subtask.title || '').trim();
              const foundSubtask = allExistingSubtasks.find(st => st.title === subtaskTitle);
              if (foundSubtask) {
                subtaskId = foundSubtask.id;
                console.log(`🔍 Found subtask ID by title "${subtaskTitle}": ${subtaskId}`);
              }
            }
            
            console.log(`📝 Processing childSubtasks for subtask ${subtaskId || 'UNKNOWN'}: ${subtask.childSubtasks.length} children`);
            console.log(`📝 Child subtasks data:`, JSON.stringify(subtask.childSubtasks.map((c: any) => ({ 
              id: c.id || 'NO_ID', 
              name: c.name, 
              title: c.title,
              assignedEmployeeId: c.assignedEmployeeId || c.assignedEmployee || 'NOT_ASSIGNED',
              parentSubtaskId: subtaskId 
            })), null, 2));
            
            // Only process child tasks if we have a valid parent subtask ID
            if (subtaskId) {
              try {
                if (subtask.childSubtasks.length === 0) {
                  const existingChildCount = await prisma.task.count({
                    where: { parentTaskId: subtaskId, projectId: id, deletedAt: null },
                  });
                  if (existingChildCount === 0) {
                    continue;
                  }
                }
                await saveChildSubtasks(
                  subtaskId,
                  id,
                  subtask.childSubtasks,
                  req.user?.id,
                  projectDefaults,
                  req.user?.id ?? null,
                  req.user?.role ?? null,
                  projectCreatorId,
                  project.status,
                  referencePlanDaysMap,
                  syncFromReference,
                  managerOwnsProject,
                );
                console.log(`✅ Successfully saved child tasks for subtask ${subtaskId}`);
              } catch (childError: any) {
                console.error(`❌ Error saving child tasks for subtask ${subtaskId}:`, childError);
                console.error(`❌ Child error details:`, {
                  message: childError?.message,
                  code: childError?.code,
                  meta: childError?.meta,
                  stack: childError?.stack,
                });
                throw childError; // Re-throw to be caught by outer catch
              }
            } else {
              console.warn(`⚠️ Skipping child tasks for subtask without ID - subtask:`, {
                name: subtask.name,
                title: subtask.title,
                id: subtask.id,
                childCount: subtask.childSubtasks.length
              });
            }
          }
        }

        console.log(`✅ Saved ${subtasksToSave.length} subtasks for project ${id} (${createdCount} created, ${updatedCount} updated)`);
      } catch (subtaskError: any) {
        console.error('❌ Error saving subtasks:', subtaskError);
        console.error('❌ Subtask error details:', {
          message: subtaskError?.message,
          code: subtaskError?.code,
          meta: subtaskError?.meta,
          stack: subtaskError?.stack,
        });
        // Return error instead of silently failing
        res.status(500).json({
          success: false,
          message: 'Failed to save subtasks',
          error: subtaskError?.message || 'Unknown error',
          details: subtaskError?.meta,
        });
        return;
      }
    }

    if (shouldCascadeSuspension) {
      await prisma.task.updateMany({
        where: { projectId: id },
        data: { status: TaskStatus.ON_HOLD },
      });
    }

    // Refetch project with nested subtasks so response includes newly created child tasks
    await compactMainRowStableWorkSeq(prisma, id, null);
    const projectMeta = await prisma.project.findUnique({
      where: { id },
      select: { projectNumber: true },
    });
    await repairInsertedTaskDisplayKeys(prisma, id, null, projectMeta?.projectNumber ?? 1);
    const updatedProject = await prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        assignedEmployees: {
          include: {
            employee: { select: USER_AVATAR_SELECT },
          },
        },
        tasks: {
          where: { parentTaskId: null },
          include: {
            assignments: {
              include: {
                employee: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            delegations: { select: { originalAssigneeId: true, newAssigneeId: true } },
            assignedEmployee: { select: USER_AVATAR_SELECT },
            subtasks: {
              include: {
                assignments: { select: { employeeId: true } },
                delegations: { select: { originalAssigneeId: true, newAssigneeId: true } },
                assignedEmployee: { select: USER_AVATAR_SELECT },
                subtasks: {
                  include: {
                    assignments: { select: { employeeId: true } },
                    delegations: { select: { originalAssigneeId: true, newAssigneeId: true } },
                    assignedEmployee: { select: USER_AVATAR_SELECT },
                  },
                  orderBy: [...TASK_ORDER_THEN_CREATED_AT],
                },
              },
              orderBy: [...TASK_ORDER_THEN_CREATED_AT],
            },
            _count: {
              select: {
                checklists: true,
                attachments: true,
              },
            },
          },
          orderBy: [...TASK_ORDER_THEN_CREATED_AT],
        },
        checklists: {
          orderBy: {
            order: 'asc',
          },
        },
        attachments: {
          orderBy: {
            uploadedAt: 'desc',
          },
        },
        documents: {
          orderBy: {
            uploadedAt: 'desc',
          },
        },
        tenders: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
            status: true,
          },
        },
        contracts: {
          select: {
            id: true,
            referenceNumber: true,
            title: true,
            status: true,
            contractType: true,
            startDate: true,
            endDate: true,
            contractValue: true,
            currency: true,
            builtUpArea: true,
            developerName: true,
            plotNumber: true,
            community: true,
            numberOfFloors: true,
            makaniNumber: true,
            assignedManagerId: true,
            assignedManagerEmail: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        _count: {
          select: {
            tasks: true,
            documents: true,
            tenders: true,
            checklists: true,
            attachments: true,
            contracts: true,
          },
        },
      },
    });

    const responseProject = updatedProject || project;
    // Ensure frontend can show updated name in Project Details: expose both name and projectName (display = name or referenceNumber)
    const data = responseProject as any;
    const projectDisplay = data
      ? {
          ...data,
          projectName: data.name != null && data.name !== '' ? data.name : data.referenceNumber,
          permissions: {
            canEditProjectFields:
              normalizeErpRole(req.user?.role) === 'ADMIN' ||
              normalizeErpRole(req.user?.role) === 'HR' ||
              normalizeErpRole(req.user?.role) === 'SUPER_ADMIN' ||
              managerOwnsProject,
          },
          tasks: mapProjectTasksForMainTableClient(
            mapTaskTreeWithPermissions(
              data.tasks,
              req.user ? { id: req.user.id, role: req.user.role as any } : null,
              data.createdBy ?? null,
              data.status,
              managerOwnsProject,
            ),
          ),
        }
      : data;
    setNoCacheJson(res);

    if (
      projectManagerText !== undefined &&
      String(projectManagerText || '') !== String(existingProject.projectManager || '')
    ) {
      const manager = await resolveProjectManagerUser(projectManagerText);
      if (manager?.email && responseProject) {
        void notifyProjectManagerAssignedEmail({
          manager,
          project: {
            id: responseProject.id,
            name: responseProject.name,
            referenceNumber: responseProject.referenceNumber,
            startDate: responseProject.startDate,
            deadline: responseProject.deadline,
            client: (responseProject as any).client ?? null,
          },
          assignedBy: req.user
            ? { firstName: (req.user as any).firstName, lastName: (req.user as any).lastName }
            : null,
        });
      }
    }

    res.json({
      success: true,
      message: 'Project updated successfully',
      data: projectDisplay,
    });
  } catch (error: any) {
    console.error('❌ Update project error:', error);
    console.error('❌ Error details:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
    });
    // Return 200 so client gets a response; include success: false and error for the frontend to show
    let fallbackProject: any = null;
    try {
      const { id } = req.params;
      fallbackProject = await prisma.project.findUnique({
        where: { id },
        select: { id: true, projectNumber: true, name: true, referenceNumber: true, status: true, createdAt: true, updatedAt: true },
      });
    } catch (_) {
      // ignore
    }
    res.status(200).json({
      success: false,
      message: 'Failed to update project',
      error: error?.message || 'Internal server error',
      details: error?.meta,
      data: fallbackProject,
    });
  }
};

/**
 * Update only the project name (so modal save persists and survives refresh).
 * Frontend can call PUT /projects/:id/name with body { name: "villa" } or { projectName: "villa" }.
 */
export const updateProjectName = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const nameRaw = req.body.name ?? req.body.projectName ?? (req.body as any).title;
    const name = typeof nameRaw === 'string' ? nameRaw.trim() : (nameRaw != null ? String(nameRaw).trim() : '');

    if (!name) {
      res.status(400).json({ success: false, message: 'Project name is required' });
      return;
    }

    const existing = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    const updated = await prisma.project.update({
      where: { id },
      data: { name },
      select: { id: true, projectNumber: true, name: true, referenceNumber: true },
    });
    console.log(`📝 Project name updated: ${id} -> "${updated.name}"`);
    res.json({
      success: true,
      message: 'Project name updated',
      data: { id: updated.id, name: updated.name, projectName: updated.name, referenceNumber: updated.referenceNumber },
    });
  } catch (error: any) {
    console.error('Update project name error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Failed to update project name' });
  }
};

/** POST /api/projects/:id/request-deletion-otp — internal ERP approval; PM/Manager only */
export const requestProjectDeletionOtp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await createProjectDeletionRequest(id, req);
    if (!result.success) {
      res.status(400).json({ success: false, message: result.message });
      return;
    }
    res.json({
      success: true,
      message: result.message,
      data: { requestId: result.requestId },
    });
  } catch (error: any) {
    console.error('❌ Request project deletion error:', error);
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to request deletion authorization',
    });
  }
};

// Delete project
export const deleteProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const deletionOtp = String(req.body?.deletionOtp ?? '').trim();

    console.log(`🗑️ Delete project request received for ID: ${id}`);

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        assignedEmployees: {
          select: {
            employeeId: true,
          },
        },
        contracts: {
          select: {
            id: true,
            assignedManagerId: true as any,
            assignedManagerEmail: true as any,
          },
        },
      },
    });

    if (!project) {
      console.log(`❌ Project ${id} not found`);
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to delete projects. Please contact your manager.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    if (requiresProjectDeletionOtp(req.user?.role)) {
      if (!(await managerCanAccessProjectForDeletion(project, req))) {
        res.status(403).json({
          success: false,
          message:
            'Access Denied: You can only delete projects you manage or that were created from your contracts.',
          code: 'ACCESS_DENIED',
        });
        return;
      }
      if (!deletionOtp) {
        res.status(403).json({
          success: false,
          message: 'Project deletion requires Admin/Super Admin authorization. Request and enter the OTP.',
          code: 'REQUIRES_DELETION_OTP',
        });
        return;
      }
      const otpCheck = await consumeDeletionOtp(id, deletionOtp, req.user!.id);
      if (!otpCheck.ok) {
        res.status(otpCheck.status).json({
          success: false,
          message: otpCheck.message,
          code: 'INVALID_DELETION_OTP',
        });
        return;
      }

      console.log(`📋 Soft-deleting project: ${project.name} (${project.referenceNumber})`);

      await softDeleteProject(id);
      await markDeletionRequestDeleted(otpCheck.requestId);

      const approvedBy = await prisma.projectDeletionOtpRequest.findUnique({
        where: { id: otpCheck.requestId },
        select: { approvedById: true, approvedBy: { select: { firstName: true, lastName: true, email: true } } },
      });

      await logProjectActivity({
        projectId: id,
        actorId: req.user?.id,
        action: 'PROJECT_DELETED_OTP',
        summary: `Project moved to trash after internal OTP approval: ${project.name} (${project.referenceNumber})`,
        metadata: {
          projectName: project.name,
          referenceNumber: project.referenceNumber,
          requestId: otpCheck.requestId,
          requestedById: req.user?.id,
          approvedById: approvedBy?.approvedById,
          otpVerifiedById: req.user?.id,
          deletedAt: new Date().toISOString(),
          recoveryHours: DELETION_RECOVERY_HOURS,
        },
      });

      res.json({
        success: true,
        message: `Project moved to trash. You can restore it within ${DELETION_RECOVERY_HOURS} hours.`,
        recoveryHours: DELETION_RECOVERY_HOURS,
      });
      return;
    }

    console.log(`📋 Soft-deleting project: ${project.name} (${project.referenceNumber})`);

    await softDeleteProject(id);

    await logProjectActivity({
      projectId: id,
      actorId: req.user?.id,
      action: 'PROJECT_DELETED',
      summary: `Project moved to trash: ${project.name} (${project.referenceNumber})`,
      metadata: {
        projectName: project.name,
        referenceNumber: project.referenceNumber,
        deletedAt: new Date().toISOString(),
        recoveryHours: DELETION_RECOVERY_HOURS,
      },
    });

    console.log(`✅ Project ${id} soft-deleted (recoverable for ${DELETION_RECOVERY_HOURS}h)`);

    res.json({
      success: true,
      message: `Project moved to trash. You can restore it within ${DELETION_RECOVERY_HOURS} hours.`,
      recoveryHours: DELETION_RECOVERY_HOURS,
    });
  } catch (error) {
    console.error('❌ Delete project error:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    // Provide more detailed error message
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ 
      success: false, 
      message: `Failed to delete project: ${errorMessage}`,
      error: errorMessage
    });
  }
};

// Bulk delete projects
export const deleteProjects = async (req: AuthRequest, res: Response): Promise<void> => {
  console.log('🚀 deleteProjects endpoint called');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  console.log('👤 User:', req.user?.email, 'Role:', req.user?.role);
  
  try {
    // Employee role: Cannot delete projects
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to delete projects. Please contact your manager.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    if (requiresProjectDeletionOtp(req.user?.role)) {
      res.status(403).json({
        success: false,
        message:
          'Bulk project deletion is not available for project managers. Delete one project at a time with Admin OTP approval.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    // Manager role (legacy): validated per project in the loop below
    const { ids, selectedTasks, selectedSubtasks } = req.body;
    
    // Check if this is actually a task deletion request (frontend might be calling wrong endpoint)
    if (selectedTasks || selectedSubtasks) {
      console.warn('⚠️ WARNING: Projects bulk delete endpoint received task deletion data!');
      console.warn('   This suggests the frontend is calling /api/projects/bulk instead of /api/tasks/bulk');
      console.warn('   Request body contains selectedTasks or selectedSubtasks:', { selectedTasks, selectedSubtasks });
    }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ 
        success: false, 
        message: 'Project IDs array is required' 
      });
      return;
    }

    // Verify all projects exist and check permissions for managers
    const projects = await prisma.project.findMany({
      where: { id: { in: ids } },
      include: {
        assignedEmployees: {
          select: {
            employeeId: true,
          },
        },
        contracts: {
          select: {
            id: true,
            assignedManagerId: true as any,
            assignedManagerEmail: true as any,
          },
        },
      },
    });

    if (projects.length !== ids.length) {
      res.status(404).json({ 
        success: false, 
        message: 'Some projects not found' 
      });
      return;
    }

    // For managers, verify they can delete each project
    if (req.user?.role === 'MANAGER') {
      const unauthorizedProjects: string[] = [];
      for (const project of projects) {
        const projectWithRelations = project as any;
        const isCreator = project.createdBy === req.user.id;
        const isAssigned = projectWithRelations.assignedEmployees?.some(
          (a: { employeeId: string }) => a.employeeId === req.user!.id
        );
        const hasAssignedContract = projectWithRelations.contracts?.some((contract: any) => {
          return (req.user?.email && contract.assignedManagerEmail === req.user.email) ||
                 (req.user?.id && contract.assignedManagerId === req.user.id);
        });

        if (!isCreator && !isAssigned && !hasAssignedContract) {
          unauthorizedProjects.push(project.id);
        }
      }

      if (unauthorizedProjects.length > 0) {
        res.status(403).json({
          success: false,
          message: `Access Denied: You can only delete projects you created, are assigned to, or that were created from your contracts. ${unauthorizedProjects.length} project(s) cannot be deleted.`,
          code: 'ACCESS_DENIED',
        });
        return;
      }
    }

    let deletedCount = 0;
    for (const projectId of ids) {
      await softDeleteProject(projectId);
      deletedCount += 1;
    }

    console.log(`✅ ${deletedCount} projects moved to trash`);

    res.json({
      success: true,
      message: `${deletedCount} project(s) moved to trash. Restore within ${DELETION_RECOVERY_HOURS} hours.`,
      deletedCount,
      recoveryHours: DELETION_RECOVERY_HOURS,
    });
  } catch (error) {
    console.error('❌ Bulk delete projects error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ 
      success: false, 
      message: `Failed to delete projects: ${errorMessage}`,
      error: errorMessage
    });
  }
};

// Assign employees to project
export const assignEmployees = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { employeeIds, role } = req.body;

    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Employee IDs array is required',
      });
      return;
    }

    const project = await prisma.project.findUnique({
      where: { id },
      include: { client: { select: { name: true } } },
    });

    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    // Merge assignments (do not wipe existing — chat invites must not remove other assignees)
    const uniqueIds = [...new Set(employeeIds.map((id: string) => String(id).trim()).filter(Boolean))];
    await Promise.all(
      uniqueIds.map((employeeId: string) =>
        prisma.projectAssignment.upsert({
          where: {
            projectId_employeeId: { projectId: id, employeeId },
          },
          create: {
            projectId: id,
            employeeId,
            assignedBy: req.user?.id || null,
            role: role || null,
          },
          update: {
            ...(role ? { role } : {}),
            assignedBy: req.user?.id || null,
          },
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, email: true, photo: true, role: true } },
          },
        }),
      ),
    );

    const assignments = await prisma.projectAssignment.findMany({
      where: { projectId: id },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, email: true, photo: true, role: true } },
      },
    });

    const isPmRole = String(role || '').toUpperCase().includes('PROJECT_MANAGER');
    const assignedBy = req.user
      ? { firstName: (req.user as any).firstName, lastName: (req.user as any).lastName }
      : null;
    for (const assignment of assignments) {
      const emp = assignment.employee;
      if (!emp?.email) continue;
      const isPm = isPmRole || emp.role === 'PROJECT_MANAGER';
      if (!isPm) continue;
      if (!uniqueIds.includes(emp.id)) continue;
      void notifyProjectManagerAssignedEmail({
        manager: emp,
        project: {
          id: project.id,
          name: project.name,
          referenceNumber: project.referenceNumber,
          startDate: project.startDate,
          deadline: project.deadline,
          client: project.client,
        },
        assignedBy,
      });
    }

    res.json({
      success: true,
      message: 'Employees assigned successfully',
      data: assignments,
    });
  } catch (error) {
    console.error('Assign employees error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Get project statistics
export const getProjectStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            tasks: true,
            documents: true,
            tenders: true,
            checklists: true,
            attachments: true,
            assignedEmployees: true,
          },
        },
      },
    });

    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    // Get task statistics
    const taskStats = await prisma.task.groupBy({
      by: ['status'],
      where: { projectId: id },
      _count: true,
    });

    const stats = {
      totalTasks: project._count.tasks,
      tasksByStatus: taskStats.reduce((acc: any, stat: any) => {
        acc[stat.status] = stat._count;
        return acc;
      }, {}),
      totalDocuments: project._count.documents,
      totalTenders: project._count.tenders,
      totalChecklists: project._count.checklists,
      totalAttachments: project._count.attachments,
      totalEmployees: project._count.assignedEmployees,
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Get project stats error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** List projects/tasks in trash (recoverable within DELETION_RECOVERY_HOURS). */
export const getDeletedItems = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Employees cannot view deleted projects.',
      });
      return;
    }
    await purgeExpiredSoftDeletions();
    const data = await listRecoverableDeletions();
    res.json({
      success: true,
      data,
      recoveryHours: DELETION_RECOVERY_HOURS,
    });
  } catch (error) {
    console.error('Get deleted items error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Restore a soft-deleted project. */
export const restoreDeletedProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({ success: false, message: 'Employees cannot restore projects.' });
      return;
    }
    const ok = await restoreProject(id);
    if (!ok) {
      res.status(404).json({
        success: false,
        message: `Project not found in trash or recovery window (${DELETION_RECOVERY_HOURS}h) expired.`,
      });
      return;
    }
    res.json({
      success: true,
      message: 'Project restored successfully.',
    });
  } catch (error) {
    console.error('Restore project error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Restore one or more soft-deleted tasks/subtasks. */
export const restoreDeletedTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const taskIds = Array.isArray(req.body?.taskIds) ? req.body.taskIds : [];
    if (!taskIds.length) {
      res.status(400).json({ success: false, message: 'taskIds array is required' });
      return;
    }
    let restored = 0;
    for (const taskId of taskIds) {
      if (await restoreTask(String(taskId))) restored += 1;
    }
    res.json({
      success: true,
      message:
        restored > 0
          ? `${restored} task(s) restored.`
          : `No tasks restored (not in trash or recovery window expired).`,
      restored,
    });
  } catch (error) {
    console.error('Restore tasks error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Permanently remove a soft-deleted project from trash (cannot be undone). */
export const permanentDeleteProjectFromTrash = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({ success: false, message: 'Employees cannot permanently delete projects.' });
      return;
    }
    const ok = await permanentlyDeleteProjectFromTrash(id);
    if (!ok) {
      res.status(404).json({
        success: false,
        message: 'Project not found in trash.',
      });
      return;
    }
    res.json({
      success: true,
      message: 'Project permanently deleted.',
    });
  } catch (error) {
    console.error('Permanent delete project error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Permanently remove soft-deleted tasks from trash (cannot be undone). */
export const permanentDeleteTasksFromTrash = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({ success: false, message: 'Employees cannot permanently delete tasks.' });
      return;
    }
    const taskIds = Array.isArray(req.body?.taskIds) ? req.body.taskIds : [];
    if (!taskIds.length) {
      res.status(400).json({ success: false, message: 'taskIds array is required' });
      return;
    }
    const purged = await permanentlyDeleteTasksFromTrash(taskIds.map((id: unknown) => String(id)));
    if (purged === 0) {
      res.status(404).json({
        success: false,
        message: 'No tasks found in trash to permanently delete.',
      });
      return;
    }
    res.json({
      success: true,
      message: `${purged} task(s) permanently deleted.`,
      purged,
    });
  } catch (error) {
    console.error('Permanent delete tasks error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Plan days template from project 2539 (by name, slot, stem). */
export const getReferencePlanDays = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await loadReferencePlanDaysData(prisma);
    res.json({
      success: true,
      data,
      referenceProjectRef: REFERENCE_PROJECT_REF,
    });
  } catch (error) {
    console.error('Get reference plan days error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Soft-delete tasks immediately (moves to trash for DELETION_RECOVERY_HOURS). */
export const softDeleteTasksEndpoint = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const taskIds = Array.isArray(req.body?.taskIds) ? req.body.taskIds : [];
    if (!taskIds.length) {
      res.status(400).json({ success: false, message: 'taskIds array is required' });
      return;
    }
    if (!req.user?.id || !req.user.role) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const ids = taskIds.map((id: unknown) => String(id));
    const rows = await prisma.task.findMany({
      where: { id: { in: ids } },
      include: {
        assignments: { select: { employeeId: true } },
        delegations: { select: { originalAssigneeId: true, newAssigneeId: true } },
        project: { select: { id: true, createdBy: true, status: true } },
      },
    });

    const managesCache = new Map<string, boolean>();
    for (const row of rows) {
      let userManagesProject = false;
      const role = req.user.role as any;
      if (role === 'MANAGER' || role === 'PROJECT_MANAGER') {
        if (!managesCache.has(row.projectId)) {
          managesCache.set(
            row.projectId,
            await resolveUserManagesProject(
              { id: req.user.id, role, email: req.user.email },
              row.projectId,
            ),
          );
        }
        userManagesProject = managesCache.get(row.projectId) ?? false;
      }
      const perms = computeTaskPermissions({
        user: { id: req.user.id, role },
        task: row as any,
        projectCreatedById: row.project?.createdBy ?? null,
        projectStatus: row.project?.status ?? null,
        userManagesProject,
      });
      if (!perms.canDelete) {
        res.status(403).json({
          success: false,
          message: MESSAGE_NO_PERMISSION_DELETE_TASK,
          code: 'NO_PERMISSION_DELETE_TASK',
        });
        return;
      }
    }

    await softDeleteTasks(ids);
    res.json({
      success: true,
      message: `${taskIds.length} task(s) moved to trash.`,
      recoveryHours: DELETION_RECOVERY_HOURS,
    });
  } catch (error) {
    console.error('Soft delete tasks error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Insert a work row after an existing task without shifting display IDs (stableWorkSeq).
 * List position uses taskOrder; dependencies use internal predecessorId UUIDs.
 */
export const insertTaskAfterHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    assertTaskManagementRole(req.user?.role);

    const projectId = String(req.params.id || '').trim();
    const {
      insertAfterTaskId,
      title,
      name,
      dependencyMode,
      parentTaskId,
      category,
      priority,
      planDays,
      assignedEmployeeId,
      phase,
    } = req.body ?? {};

    if (!projectId || !insertAfterTaskId) {
      res.status(400).json({
        success: false,
        message: 'projectId and insertAfterTaskId are required',
      });
      return;
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        contracts: {
          select: {
            assignedManagerId: true,
            assignedManagerEmail: true,
            assignedManager: { select: { id: true } },
          },
        },
      },
    });
    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    const role = normalizeErpRole(req.user?.role);
    if (role === 'MANAGER') {
      const managerUser = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { email: true, firstName: true, lastName: true },
      });
      const owns = managerOwnsProjectAsPm(project as any, {
        id: req.user!.id,
        email: managerUser?.email ?? req.user?.email ?? null,
        nameVariations: buildUserNameVariations(managerUser?.firstName, managerUser?.lastName),
      });
      if (!owns && project.createdBy !== req.user!.id) {
        res.status(403).json({
          success: false,
          message: 'Only the project manager can add tasks to this project.',
          code: 'ACCESS_DENIED',
        });
        return;
      }
    }

    const { throwIfProjectWriteLocked } = await import('../utils/project-suspension');
    throwIfProjectWriteLocked({
      projectStatus: project.status,
      projectCreatedById: project.createdBy,
      user: req.user,
    });

    const mode: InsertDependencyMode =
      dependencyMode === 'keep_existing' ? 'keep_existing' : 'insert_into_chain';

    const result = await insertTaskAfter({
      projectId,
      insertAfterTaskId: String(insertAfterTaskId),
      title: String(title ?? name ?? ''),
      dependencyMode: mode,
      actorId: req.user!.id,
      parentTaskId: parentTaskId ?? null,
      category: category ?? phase ?? null,
      priority: priority ?? null,
      planDays: planDays != null ? Number(planDays) : null,
      assignedEmployeeId: assignedEmployeeId ?? null,
      phase: phase ?? null,
    });

    res.status(201).json({
      success: true,
      message: 'Task inserted successfully',
      data: result,
    });
  } catch (error: any) {
    const status = error?.statusCode || 500;
    if (status >= 500) {
      console.error('Insert task after error:', error);
    }
    res.status(status).json({
      success: false,
      message: error?.message || 'Failed to insert task',
      code: error?.code,
    });
  }
};


