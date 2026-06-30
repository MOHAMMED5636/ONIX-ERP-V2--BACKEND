import { Request, Response } from 'express';
import prisma from '../config/database';
import { taskRowInvolvesEmployee } from '../utils/employee-task-involvement';
import {
  unlockDependentsWaitingOnFinishedPredecessor,
  enrichTaskTreeForClient,
  enrichTaskNodeForClient,
  syncProjectPredecessorLinksFromDisplayKeys,
  mapProjectTasksForMainTableClient,
  isPredecessorRowCompleted,
  workflowStatusForSavedTaskStatus,
} from '../utils/task-predecessor-unlock';
import { assertNoPredecessorCycle } from '../utils/task-dependency-graph';

function setNoCacheJson(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}
import { AuthRequest } from '../middleware/auth.middleware';
import {
  logProjectActivity,
  collectTaskChanges,
  collectTaskChangesAfterPersist,
  logTaskTreeCreated,
  resolveTaskDisplayIdForTaskId,
} from '../services/projectActivity.service';
import { formatWorkItemRef } from '../utils/task-display-id';
import {
  parseTaskEffortType,
  parseTaskWeightInput,
  clampTaskWeight,
} from '../utils/workload.utils';
import { awardXpForTaskCompletion } from '../services/gamification.service';
import {
  extractStatusReversionReason,
  isTaskStatusChanged,
  processPmTaskStatusChangeNotification,
} from '../services/taskStatusReversion.service';
import { maybeNotifyTaskNotesFromSave } from '../services/taskNotesNotify.service';
import { computeEmployeeWorkload } from '../services/workload.service';
import { notifyWorkloadForTaskChange } from '../services/workloadNotify.service';
import { notifyTaskAssignedEmail } from '../services/emailDispatch.service';
import { TaskEffortType, TaskStatus } from '@prisma/client';
import {
  computeTaskPermissions,
  hasMainFieldChanges,
  isTaskDoneLockedStatus,
  TASK_DONE_LOCK_MESSAGE,
  userCanUnlockCompletedTask,
  mapTaskTreeWithPermissions,
  MESSAGE_NO_PERMISSION_DELETE_TASK,
} from '../utils/task-permissions';
import { resolveUserManagesProject } from '../utils/project-pm-ownership';
import { computeNextStableWorkSeq } from '../utils/project-number';
import {
  ensureTaskProjectWriteAllowed,
  isProjectWriteLockedForUser,
  PROJECT_SUSPENDED_MESSAGE,
} from '../utils/project-suspension';
import { mapFrontendTaskStatusToEnum } from '../utils/taskStatusMap';

async function deletePermissionsForTask(
  user: NonNullable<AuthRequest['user']>,
  task: {
    projectId: string;
    createdBy?: string | null;
    assignedEmployeeId?: string | null;
    assignments?: { employeeId: string }[];
    delegations?: Record<string, unknown>[];
    status?: string | null;
  },
  projectMeta: { createdBy?: string | null; status?: string | null } | null | undefined,
  managesCache: Map<string, boolean>,
) {
  const role = user.role as any;
  let userManagesProject = false;
  if (role === 'MANAGER' || role === 'PROJECT_MANAGER') {
    if (!managesCache.has(task.projectId)) {
      managesCache.set(
        task.projectId,
        await resolveUserManagesProject(
          { id: user.id, role, email: (user as any).email },
          task.projectId,
        ),
      );
    }
    userManagesProject = managesCache.get(task.projectId) ?? false;
  }
  return computeTaskPermissions({
    user: { id: user.id, role },
    task: task as any,
    projectCreatedById: projectMeta?.createdBy ?? null,
    projectStatus: projectMeta?.status ?? null,
    userManagesProject,
  });
}

// Reusable lock helper for predecessor‑based workflow
async function checkTaskLock(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      status: true,
      workflowStatus: true,
      predecessorId: true,
      predecessor: {
        select: {
          id: true,
          title: true,
          status: true,
          workflowStatus: true,
        },
      },
    },
  });

  if (!task) {
    return { locked: false, reason: null as string | null, task: null as any };
  }

  if (!task.predecessorId || !task.predecessor) {
    return { locked: false, reason: null, task };
  }

  const predecessorDone =
    task.predecessor.status === 'COMPLETED' ||
    task.predecessor.workflowStatus === 'COMPLETED';

  if (!predecessorDone) {
    return {
      locked: true,
      reason: 'Task is locked until predecessor is completed',
      task,
    };
  }

  return { locked: false, reason: null, task };
}

// Get all tasks with filters
export const getAllTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      projectId,
      status,
      priority,
      assignedTo,
      employee: employeeParam,
      search,
      page = '1',
      limit = '10',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      // Only fetch main tasks (no parent) - subtasks and child tasks are included via relations
      parentTaskId: null,
    };

    if (projectId) {
      where.projectId = projectId as string;
    }

    if (status) {
      where.status = status;
    }

    if (priority) {
      where.priority = priority;
    }

    // When admin/manager views another employee's tasks (e.g. /employees/30), use employee= or assignedTo
    const canViewOtherEmployee =
      req.user &&
      ['ADMIN', 'HR', 'PROJECT_MANAGER', 'SUPER_ADMIN'].includes(req.user.role);
    const targetEmployeeId =
      (employeeParam as string) || (assignedTo as string) || null;
    const useTargetEmployee =
      targetEmployeeId && (canViewOtherEmployee || req.user?.id === targetEmployeeId);

    if (assignedTo && req.user?.role !== 'EMPLOYEE' && !useTargetEmployee) {
      where.assignments = {
        some: {
          employeeId: assignedTo as string,
        },
      };
    }

    const searchOr = search
      ? [{ title: { contains: search as string, mode: 'insensitive' as const } }, { description: { contains: search as string, mode: 'insensitive' as const } }]
      : null;
    // Employee/Manager see only their assigned tasks; admin viewing ?employee=XXX sees that employee's tasks
    const isEmployeeFilter = req.user && (req.user.role === 'EMPLOYEE' || req.user.role === 'MANAGER');
    const filterByEmployeeId = useTargetEmployee ? targetEmployeeId : (isEmployeeFilter ? req.user!.id : null);
    const employeeOr = filterByEmployeeId
      ? [
          // Main task assignments (via TaskAssignment table)
          { assignments: { some: { employeeId: filterByEmployeeId } } },

          // Tasks directly assigned via assignedEmployeeId (root or sub)
          { assignedEmployeeId: filterByEmployeeId },

          // Direct subtask assignments (via assignedEmployeeId)
          { subtasks: { some: { assignedEmployeeId: filterByEmployeeId } } },

          // Nested child subtask assignments (2 levels deep)
          { subtasks: { some: { subtasks: { some: { assignedEmployeeId: filterByEmployeeId } } } } },

          // Tasks where user delegated a subtask (still visible as "Delegated")
          { subtasks: { some: { delegations: { some: { originalAssigneeId: filterByEmployeeId } } } } },
          { subtasks: { some: { subtasks: { some: { delegations: { some: { originalAssigneeId: filterByEmployeeId } } } } } } },
        ]
      : null;

    if (searchOr && employeeOr) {
      where.AND = [{ OR: searchOr }, { OR: employeeOr }];
    } else if (searchOr) {
      where.OR = searchOr;
    } else if (employeeOr) {
      where.OR = employeeOr;
    }

    if (projectId && typeof projectId === 'string') {
      await syncProjectPredecessorLinksFromDisplayKeys(prisma, projectId);
    } else if (filterByEmployeeId) {
      const projectIds = await prisma.task.findMany({
        where: taskRowInvolvesEmployee(filterByEmployeeId),
        select: { projectId: true },
        distinct: ['projectId'],
      });
      await Promise.all(
        projectIds.map((p) => syncProjectPredecessorLinksFromDisplayKeys(prisma, p.projectId)),
      );
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: {
          [sortBy as string]: sortOrder as 'asc' | 'desc',
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              referenceNumber: true,
              pin: true,
              status: true,
              createdBy: true,
            },
          },
          assignments: {
            include: {
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  photo: true,
                },
              },
            },
          },
          // Include nested subtasks and their child tasks
          subtasks: {
            include: {
              assignedEmployee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
              delegations: {
                orderBy: { delegatedAt: 'desc' as const },
                take: 1,
                include: {
                  originalAssignee: { select: { id: true, firstName: true, lastName: true } },
                  newAssignee: { select: { id: true, firstName: true, lastName: true } },
                },
              },
              subtasks: {
                include: {
                  assignedEmployee: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true,
                    },
                  },
                  delegations: {
                    orderBy: { delegatedAt: 'desc' as const },
                    take: 1,
                    include: {
                      originalAssignee: { select: { id: true, firstName: true, lastName: true } },
                      newAssignee: { select: { id: true, firstName: true, lastName: true } },
                    },
                  },
                } as any,
                orderBy: {
                  createdAt: 'asc',
                },
              },
            } as any,
            orderBy: {
              createdAt: 'asc',
            },
          },
          _count: {
            select: {
              checklists: true,
              attachments: true,
              comments: true,
            },
          },
        } as any,
      }),
      prisma.task.count({ where }),
    ]);

    const enrichedTasks = mapProjectTasksForMainTableClient(
      enrichTaskTreeForClient(tasks as any),
    );

    setNoCacheJson(res);
    res.json({
      success: true,
      data: enrichedTasks,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get all tasks error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Get single task by ID
export const getTaskById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // First, check if task exists and if employee has access
    const taskCheck = await prisma.task.findUnique({
      where: { id },
      include: {
        assignments: { select: { employeeId: true } },
        delegations: { select: { originalAssigneeId: true } },
      } as any,
    });

    if (!taskCheck) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    const taskWithIncludes = taskCheck as typeof taskCheck & { assignments?: { employeeId: string }[]; delegations?: { originalAssigneeId: string }[] };

    // Employee/Manager: same visibility as list API — this row, or any descendant row, may involve the user
    if (req.user?.role === 'EMPLOYEE' || req.user?.role === 'MANAGER') {
      const uid = req.user!.id;
      const isInvolvedOnThisRow =
        taskCheck.assignedEmployeeId === uid ||
        (taskWithIncludes.assignments?.some((a) => a.employeeId === uid) ?? false) ||
        taskCheck.createdBy === uid ||
        (taskWithIncludes.delegations?.some((d) => d.originalAssigneeId === uid) ?? false);

      let allowed = isInvolvedOnThisRow;
      if (!allowed && !taskCheck.parentTaskId) {
        const descendantCount = await prisma.task.count({
          where: {
            AND: [
              {
                OR: [{ parentTaskId: id }, { parentTask: { parentTaskId: id } }],
              },
              taskRowInvolvesEmployee(uid),
            ],
          },
        });
        allowed = descendantCount > 0;
      }

      if (!allowed) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: You do not have permission to view this task. You can only view tasks assigned to you.',
          code: 'ACCESS_DENIED',
        });
        return;
      }
    }

    // Fetch full task details with all relations including nested subtasks
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
            pin: true,
            status: true,
            createdBy: true,
          },
        },
        assignments: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                photo: true,
                role: true,
              },
            },
          },
        },
        delegations: { select: { originalAssigneeId: true, newAssigneeId: true } },
        // Include nested subtasks and their child tasks
        subtasks: {
          include: {
            assignedEmployee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            delegations: {
              orderBy: { delegatedAt: 'desc' as const },
              take: 1,
              include: {
                originalAssignee: { select: { id: true, firstName: true, lastName: true } },
                newAssignee: { select: { id: true, firstName: true, lastName: true } },
              },
            },
            subtasks: {
              include: {
                assignedEmployee: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
                delegations: {
                  orderBy: { delegatedAt: 'desc' as const },
                  take: 1,
                  include: {
                    originalAssignee: { select: { id: true, firstName: true, lastName: true } },
                    newAssignee: { select: { id: true, firstName: true, lastName: true } },
                  },
                },
              } as any,
              orderBy: {
                createdAt: 'asc',
              },
            },
          } as any,
          orderBy: {
            createdAt: 'asc',
          },
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
        comments: {
          orderBy: {
            createdAt: 'asc',
          },
          include: {
            // Note: createdBy is a string, not a relation in schema
            // You might want to add a relation or fetch user separately
          },
        },
      } as any,
    });

    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    const projectCreatedById = (task as any).project?.createdBy ?? null;
    const projectStatus = (task as any).project?.status ?? null;
    const userCtx = req.user ? { id: req.user.id, role: req.user.role as any } : null;
    const permissions = userCtx
      ? computeTaskPermissions({
          user: userCtx,
          task: task as any,
          projectCreatedById,
          projectStatus,
        })
      : undefined;
    const subtasksWithPerm =
      userCtx && (task as any).subtasks
        ? mapTaskTreeWithPermissions((task as any).subtasks, userCtx, projectCreatedById, projectStatus)
        : (task as any).subtasks;

    const synced = (task as any)?.projectId
      ? await syncProjectPredecessorLinksFromDisplayKeys(prisma, (task as any).projectId)
      : 0;
    if (synced > 0) {
      console.log(`🔗 Synced ${synced} predecessor link(s) for task ${id}`);
    }

    res.json({
      success: true,
      data: {
        ...enrichTaskNodeForClient({
          ...task,
          permissions,
          subtasks: subtasksWithPerm,
        }),
      },
    });
  } catch (error) {
    console.error('Get task by ID error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Create new task
export const createTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Employee role: Cannot create main tasks
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to create main tasks. Only project managers and admins can create tasks.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    // All managers (MANAGER and PROJECT_MANAGER) can assign tasks to any employee
    // No team member restriction - managers have full assignment capabilities
    const isManager = req.user?.role === 'MANAGER' || req.user?.role === 'PROJECT_MANAGER';

    const {
      title,
      description,
      projectId,
      status,
      priority,
      startDate,
      dueDate,
      estimatedHours,
      tags,
      employeeIds, // Array of employee IDs to assign (for main tasks via TaskAssignment table)
      assignedEmployeeId, // Single employee ID (alternative to employeeIds, also creates TaskAssignment)
      assignedTo, // Alias for assignedEmployeeId
      // Additional fields for subtasks / scheduling
      category,
      referenceNumber,
      planDays,
      remarks,
      assigneeNotes,
      location,
      makaniNumber,
      plotNumber,
      community,
      projectType,
      projectFloor,
      developerProject,
      // Legacy predecessor fields (kept for backward compatibility, no longer used for locking)
      predecessors,
      predecessorId,
      // Nested subtasks and child tasks
      subtasks, // Array of subtasks with nested childSubtasks
      effortType,
      taskWeight,
    } = req.body;

    const parsedEffort =
      parseTaskEffortType(effortType) ?? TaskEffortType.FULL_FOCUS;
    const parsedWeight =
      parseTaskWeightInput(taskWeight) != null
        ? clampTaskWeight(parseTaskWeightInput(taskWeight)!)
        : 3;

    // Validate required fields
    if (!title || !projectId) {
      res.status(400).json({
        success: false,
        message: 'Title and project ID are required',
      });
      return;
    }

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      res.status(404).json({
        success: false,
        message: 'Project not found',
      });
      return;
    }

    // Helper function to map subtask data for nested create (supports assignedEmployeeId for child visibility)
    const mapSubtaskData = (subtask: any) => {
      const assignedEmpId = subtask.assignedEmployeeId || subtask.assignedTo || null;
      const subStatus = mapFrontendTaskStatusToEnum(subtask.status);
      
      // All managers can assign subtasks to any employee - no team member restriction
      
      return {
        title: subtask.title || subtask.name || '',
        description: subtask.description || null,
        projectId,
        status: subStatus,
        // If a predecessor is configured for this subtask, start it in
        // WAITING_FOR_PREDECESSOR so the UI can show the correct "waiting" label
        // and the unlock helper can safely move it to NOT_STARTED when ready.
        workflowStatus: subtask.predecessorId ? 'WAITING_FOR_PREDECESSOR' : 'NOT_STARTED',
        priority: subtask.priority === 'Low' ? 'LOW' : 
                  subtask.priority === 'High' ? 'HIGH' : 
                  subtask.priority === 'Medium' ? 'MEDIUM' : 'MEDIUM',
        startDate: subtask.timeline?.[0] ? new Date(subtask.timeline[0]) : 
                   subtask.startDate ? new Date(subtask.startDate) : null,
        dueDate: subtask.timeline?.[1] ? new Date(subtask.timeline[1]) : 
                 subtask.endDate ? new Date(subtask.endDate) : null,
        category: subtask.category || null,
        referenceNumber: subtask.referenceNumber || null,
        planDays: subtask.planDays ? parseInt(String(subtask.planDays), 10) : null,
        remarks: subtask.remarks || null,
        assigneeNotes: subtask.assigneeNotes || null,
        location: subtask.location || null,
        makaniNumber: subtask.makaniNumber || null,
        plotNumber: subtask.plotNumber || null,
        community: subtask.community || null,
        projectType: subtask.projectType || null,
        projectFloor: subtask.projectFloor || null,
        developerProject: subtask.developerProject || null,
        tags: Array.isArray(subtask.tags) ? subtask.tags : [],
        createdBy: req.user?.id || null,
        assignedEmployeeId: assignedEmpId,
        predecessors: (subtask.predecessors != null && String(subtask.predecessors).trim() !== '') ? String(subtask.predecessors).trim() : null,
        predecessorId: subtask.predecessorId || null,
        effortType: parseTaskEffortType(subtask.effortType) ?? TaskEffortType.FULL_FOCUS,
        taskWeight:
          parseTaskWeightInput(subtask.taskWeight) != null
            ? clampTaskWeight(parseTaskWeightInput(subtask.taskWeight)!)
            : 3,
        // taskOrder removed: execution order now purely visual on frontend
        // Nested child subtasks
        subtasks: subtask.childSubtasks && Array.isArray(subtask.childSubtasks) && subtask.childSubtasks.length > 0
          ? {
              create: subtask.childSubtasks.map(mapSubtaskData),
            }
          : undefined,
      };
    };

    // Prepare employee assignments - support both employeeIds array and assignedEmployeeId/assignedTo
    let finalEmployeeIds: string[] = [];
    if (employeeIds && Array.isArray(employeeIds) && employeeIds.length > 0) {
      finalEmployeeIds = employeeIds;
    } else if (assignedEmployeeId || assignedTo) {
      // If assignedEmployeeId or assignedTo is provided, add it to the array
      const singleEmployeeId = assignedEmployeeId || assignedTo;
      if (singleEmployeeId) {
        finalEmployeeIds = [singleEmployeeId];
      }
    }

    // All managers (MANAGER and PROJECT_MANAGER) can assign tasks to any employee
    // No team member restriction - managers have full assignment capabilities
    // Removed team member validation - managers can assign to any employee

    // Create task with nested subtasks and child tasks
    const taskData: any = {
      title,
      description: description || null,
      projectId,
      status: status || 'PENDING',
      priority: priority || 'MEDIUM',
      startDate: startDate ? new Date(startDate) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
      tags: tags || [],
      referenceNumber: referenceNumber || null,
      planDays: planDays ? parseInt(String(planDays), 10) : null,
      remarks: remarks || null,
      assigneeNotes: assigneeNotes || null,
      location: location || null,
      makaniNumber: makaniNumber || null,
      plotNumber: plotNumber || null,
      community: community || null,
      projectType: projectType || null,
      projectFloor: projectFloor || null,
      developerProject: developerProject || null,
      createdBy: req.user?.id || null,
      predecessorId: predecessorId || null,
      predecessors: (predecessors != null && String(predecessors).trim() !== '') ? String(predecessors).trim() : null,
      // Root/main task workflow: if a predecessor is set at creation time, start
      // in WAITING_FOR_PREDECESSOR; otherwise treat as NOT_STARTED.
      workflowStatus: predecessorId ? 'WAITING_FOR_PREDECESSOR' : 'NOT_STARTED',
      effortType: parsedEffort,
      taskWeight: parsedWeight,
      // Create TaskAssignment records for main task employees
      assignments: finalEmployeeIds.length > 0 ? {
        create: finalEmployeeIds.map((employeeId: string) => ({
          employeeId,
          assignedBy: req.user?.id || null,
          status: 'PENDING',
        })),
      } : undefined,
      // Nested create for subtasks (with their child tasks)
      subtasks: subtasks && Array.isArray(subtasks) && subtasks.length > 0
        ? {
            create: subtasks.map(mapSubtaskData),
          }
        : undefined,
    };
    
    const task = await prisma.task.create({
      data: taskData,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
          },
        },
        assignments: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        // Include nested subtasks and their child tasks
        subtasks: {
          include: {
            subtasks: true, // Child tasks
          },
          orderBy: {
            createdAt: 'asc',
          },
        } as any,
      } as any,
    });

    // Nested create cannot set per-parent stableWorkSeq before child rows exist — assign after insert.
    const rootSubs = task.subtasks || [];
    for (const st of rootSubs) {
      const next = await computeNextStableWorkSeq(prisma, projectId, task.id);
      await prisma.task.update({ where: { id: st.id }, data: { stableWorkSeq: next, taskOrder: next } as any });
      const children = (st as any).subtasks || [];
      for (const ch of children) {
        const n2 = await computeNextStableWorkSeq(prisma, projectId, st.id);
        await prisma.task.update({ where: { id: ch.id }, data: { stableWorkSeq: n2, taskOrder: n2 } as any });
      }
    }

    const mapCreatedTaskTree = (t: any) => ({
      id: t.id,
      title: t.title,
      parentTaskId: t.parentTaskId ?? null,
      assignedEmployeeId: t.assignedEmployeeId ?? null,
      subtasks: (t.subtasks || []).map(mapCreatedTaskTree),
    });
    await logTaskTreeCreated(projectId, req.user?.id ?? null, mapCreatedTaskTree(task));

    // Notify workload subscribers for any newly affected assignees.
    // Use `finalEmployeeIds` (guaranteed string[]) instead of relying on Prisma include typing.
    const createdAssignees = Array.from(
      new Set([task.assignedEmployeeId ?? null, ...finalEmployeeIds].filter(Boolean) as string[]),
    );
    void notifyWorkloadForTaskChange(createdAssignees, 'task_created');

    if (task.project) {
      const assignedBy = req.user
        ? { firstName: (req.user as any).firstName, lastName: (req.user as any).lastName }
        : null;
      const projectInfo = task.project as unknown as {
        id: string;
        name: string;
        referenceNumber?: string | null;
      };
      for (const assignment of (task.assignments || []) as Array<{
        employee?: { id: string; email: string; firstName?: string | null; lastName?: string | null };
      }>) {
        const emp = assignment.employee;
        if (!emp?.email) continue;
        void notifyTaskAssignedEmail({
          assignee: emp,
          task: { id: task.id, title: task.title, dueDate: task.dueDate },
          project: projectInfo,
          assignedBy,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: task,
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Update task
export const updateTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      status,
      priority,
      startDate,
      dueDate,
      estimatedHours,
      actualHours,
      tags,
      assignedEmployeeId,
      // Assignee‑side fields (allowed for assignees)
      remarks,
      assigneeNotes,
      statusReversionReason,
      revertReason,
      reopenReason,
      // Legacy predecessor fields (no longer used for locking)
      predecessors,
      predecessorId,
      effortType,
      taskWeight,
    } = req.body;

    // Check if task exists (and basic assignment info)
    const existingTask: any = await prisma.task.findUnique({
      where: { id },
      include: {
        assignments: {
          select: {
            employeeId: true,
          },
        },
        delegations: { select: { originalAssigneeId: true, newAssigneeId: true } },
        project: {
          select: { createdBy: true, status: true, name: true, referenceNumber: true },
        },
        predecessor: {
          select: {
            id: true,
            title: true,
            status: true,
            workflowStatus: true,
          },
        },
      },
    });

    if (!existingTask) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    if (
      isProjectWriteLockedForUser({
        projectStatus: existingTask.project?.status ?? null,
        projectCreatedById: existingTask.project?.createdBy ?? null,
        user: req.user,
      })
    ) {
      res.status(423).json({
        success: false,
        message: PROJECT_SUSPENDED_MESSAGE,
        code: 'PROJECT_SUSPENDED',
      });
      return;
    }

    // Centralised permission evaluation based on role, creator, and assignments
    const perms = computeTaskPermissions({
      user: { id: req.user.id, role: req.user.role as any },
      task: existingTask,
      projectCreatedById: existingTask.project?.createdBy ?? null,
      projectStatus: existingTask.project?.status ?? null,
    });

    // If user is neither creator, assignee, nor privileged → cannot update at all
    if (!perms.canEditAssigneeFields && !perms.canEditMainFields) {
      const doneLocked = isTaskDoneLockedStatus(existingTask.status);
      res.status(doneLocked ? 423 : 403).json({
        success: false,
        message: doneLocked
          ? TASK_DONE_LOCK_MESSAGE
          : 'Access Denied: You are not assigned to this task and cannot update it.',
        code: doneLocked ? 'TASK_COMPLETED_LOCKED' : 'ACCESS_DENIED',
      });
      return;
    }

    const canUnlockDone = userCanUnlockCompletedTask(
      { id: req.user.id, role: req.user.role as any },
      existingTask.project?.createdBy ?? null,
    );
    if (isTaskDoneLockedStatus(existingTask.status) && !canUnlockDone) {
      res.status(423).json({
        success: false,
        message: TASK_DONE_LOCK_MESSAGE,
        code: 'TASK_COMPLETED_LOCKED',
      });
      return;
    }

    const canEditMainFields = perms.canEditMainFields;
    const canEditAssigneeFields = perms.canEditAssigneeFields;

    // Important: some frontends send the full task payload even when an assignee only changes status.
    // We should ignore non-allowed fields (gated by `canEditMainFields`) rather than rejecting the whole update,
    // otherwise the UI appears to change but refresh reverts it.

    // Predecessor-based blocking: if this task has a predecessor, do not allow
    // it to move to IN_PROGRESS or COMPLETED until the predecessor is COMPLETED.
    const mappedStatus =
      status != null && String(status).trim() !== ''
        ? mapFrontendTaskStatusToEnum(status)
        : undefined;
    const nextStatus = mappedStatus || existingTask.status;
    if (existingTask.predecessorId) {
      const lockInfo = await checkTaskLock(id);

      if (
        lockInfo.locked &&
        (nextStatus === TaskStatus.IN_PROGRESS ||
          nextStatus === TaskStatus.SUBMITTED_IN_PROGRESS ||
          nextStatus === TaskStatus.COMPLETED)
      ) {
        res.status(400).json({
          success: false,
          code: 'PREDECESSOR_NOT_COMPLETED',
          message: lockInfo.reason,
          predecessor: lockInfo.task?.predecessor || existingTask.predecessor,
        });
        return;
      }
    }

    const updateData: any = {
      // Main fields – managers/admin/HR, creator, and any assignee may change these
      ...(canEditMainFields && title && { title }),
      ...(canEditMainFields &&
        description !== undefined && { description: description || null }),
      // Status is allowed for both main editors and assignees
      ...((canEditMainFields || canEditAssigneeFields) &&
        mappedStatus && { status: mappedStatus }),
      ...(canEditMainFields && priority && { priority }),
      ...(canEditMainFields &&
        startDate && { startDate: new Date(startDate) }),
      ...(canEditMainFields && dueDate && { dueDate: new Date(dueDate) }),
      ...(canEditMainFields &&
        estimatedHours !== undefined && {
          estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        }),
      ...(canEditMainFields &&
        actualHours !== undefined && {
          actualHours: actualHours ? parseFloat(actualHours) : null,
        }),
      ...(canEditMainFields && tags && { tags }),
      ...(canEditMainFields &&
        predecessors !== undefined && {
          predecessors:
            predecessors != null && String(predecessors).trim() !== ''
              ? String(predecessors).trim()
              : null,
        }),
      ...(canEditMainFields &&
        predecessorId !== undefined && {
          predecessorId: predecessorId || null,
          // If a predecessor is being set via update, move workflowStatus
          // into WAITING_FOR_PREDECESSOR; if removed, reset to NOT_STARTED.
          workflowStatus: predecessorId ? 'WAITING_FOR_PREDECESSOR' : 'NOT_STARTED',
        }),
      ...(canEditMainFields &&
        assignedEmployeeId !== undefined && {
          assignedEmployeeId: assignedEmployeeId || null,
        }),
      ...(canEditMainFields &&
        effortType !== undefined && {
          effortType: parseTaskEffortType(effortType) ?? TaskEffortType.FULL_FOCUS,
        }),
      ...(canEditMainFields &&
        taskWeight !== undefined && {
          taskWeight:
            parseTaskWeightInput(taskWeight) != null
              ? clampTaskWeight(parseTaskWeightInput(taskWeight)!)
              : existingTask.taskWeight ?? 3,
        }),

      // Assignee‑side fields
      ...(canEditAssigneeFields &&
        remarks !== undefined && { remarks: remarks || null }),
      ...(canEditAssigneeFields &&
        assigneeNotes !== undefined && { assigneeNotes: assigneeNotes || null }),
    };

    if (predecessorId !== undefined && canEditMainFields) {
      const nextPred = predecessorId ? String(predecessorId) : null;
      const projectTasks = await prisma.task.findMany({
        where: { projectId: existingTask.projectId, deletedAt: null },
        select: { id: true, predecessorId: true },
      });
      assertNoPredecessorCycle(projectTasks, id, nextPred);
    }

    if (mappedStatus) {
      const predecessorIsCompleted = existingTask.predecessor
        ? isPredecessorRowCompleted(existingTask.predecessor)
        : true;
      updateData.workflowStatus = workflowStatusForSavedTaskStatus(
        mappedStatus,
        existingTask.predecessorId,
        predecessorIsCompleted,
      );
    }

    // If status is being changed to COMPLETED, set completedAt
    if (mappedStatus === TaskStatus.COMPLETED && existingTask.status !== TaskStatus.COMPLETED) {
      updateData.completedAt = new Date();
    } else if (
      mappedStatus &&
      mappedStatus !== TaskStatus.COMPLETED &&
      existingTask.status === TaskStatus.COMPLETED
    ) {
      updateData.completedAt = null;
    }

    // Update task (and unlock dependents when completing) in a transaction
    const { updated: task, unlockedDependents } = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: updateData,
        include: {
          project: {
            select: {
              id: true,
              name: true,
              referenceNumber: true,
            },
          },
          assignments: {
            include: {
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      // Unlock dependents whenever this task row is a finished predecessor (handles custom
      // "Done - …" labels saved via project API + heals stale WAITING rows).
      const unlockedDependents = await unlockDependentsWaitingOnFinishedPredecessor(tx, id);

      return { updated, unlockedDependents };
    });

    for (const d of unlockedDependents) {
      const { displayId } = await resolveTaskDisplayIdForTaskId(d.projectId, d.id);
      await logProjectActivity({
        projectId: d.projectId,
        actorId: req.user?.id,
        action: 'SUCCESSOR_UNBLOCKED_AFTER_PREDECESSOR',
        taskId: d.id,
        summary: `Unblocked ${formatWorkItemRef(d.title, displayId)} — predecessor finished`,
        metadata: {
          taskTitle: d.title,
          taskDisplayId: displayId ?? undefined,
          predecessorTaskId: id,
        },
      });
    }

    const changes = collectTaskChangesAfterPersist(
      existingTask as Record<string, unknown>,
      updateData as Record<string, unknown>,
      task as Record<string, unknown>,
    );
    if (changes.length > 0) {
      let action = 'SUBTASK_UPDATED';
      if (!existingTask.parentTaskId) {
        action = 'MAIN_TASK_ROW_UPDATED';
      } else {
        const parent = await prisma.task.findUnique({
          where: { id: existingTask.parentTaskId },
          select: { parentTaskId: true },
        });
        action = parent?.parentTaskId ? 'CHILD_TASK_UPDATED' : 'SUBTASK_UPDATED';
      }
      const { displayId } = await resolveTaskDisplayIdForTaskId(existingTask.projectId, id);
      await logProjectActivity({
        projectId: existingTask.projectId,
        actorId: req.user?.id,
        action,
        taskId: id,
        summary: `Updated ${formatWorkItemRef(existingTask.title, displayId)} (${changes.length} field(s))`,
        metadata: {
          taskTitle: existingTask.title,
          taskDisplayId: displayId ?? undefined,
          changes,
        },
      });
    }

    if (
      mappedStatus &&
      isTaskStatusChanged(existingTask.status as TaskStatus, mappedStatus)
    ) {
      await processPmTaskStatusChangeNotification({
        projectId: existingTask.projectId,
        taskId: id,
        taskTitle: existingTask.title,
        actor: { id: req.user.id, role: req.user.role as any },
        projectCreatedById: existingTask.project?.createdBy ?? null,
        previousStatus: existingTask.status as TaskStatus,
        newStatus: mappedStatus,
        assigneeUserId:
          task.assignedEmployeeId ??
          existingTask.assignedEmployeeId ??
          task.assignments?.[0]?.employee?.id ??
          null,
        reason: extractStatusReversionReason({
          statusReversionReason,
          revertReason,
          reopenReason,
        }),
      });
    }

    if (req.user?.id) {
      void maybeNotifyTaskNotesFromSave({
        projectId: existingTask.projectId,
        projectName: task.project?.name,
        projectReferenceNumber: task.project?.referenceNumber,
        taskId: id,
        taskTitle: existingTask.title,
        actorId: req.user.id,
        existing: {
          remarks: existingTask.remarks,
          assigneeNotes: existingTask.assigneeNotes,
        },
        incoming: { remarks, assigneeNotes },
      });
    }

    let gamification: Awaited<ReturnType<typeof awardXpForTaskCompletion>> | null = null;
    const updatedAssigneeId =
      task.assignedEmployeeId ??
      existingTask.assignedEmployeeId ??
      task.assignments?.[0]?.employee?.id ??
      null;
    if (
      mappedStatus === TaskStatus.COMPLETED &&
      existingTask.status !== TaskStatus.COMPLETED
    ) {
      if (updatedAssigneeId) {
        gamification = await awardXpForTaskCompletion(id, updatedAssigneeId);
      }
    }

    void notifyWorkloadForTaskChange(
      [existingTask.assignedEmployeeId, updatedAssigneeId],
      'task_updated',
    );

    if (
      updatedAssigneeId &&
      updatedAssigneeId !== existingTask.assignedEmployeeId &&
      task.project
    ) {
      const assignee =
        task.assignments?.[0]?.employee ||
        (await prisma.user.findUnique({
          where: { id: updatedAssigneeId },
          select: { id: true, email: true, firstName: true, lastName: true },
        }));
      if (assignee?.email) {
        void notifyTaskAssignedEmail({
          assignee,
          task: { id: task.id, title: task.title, dueDate: task.dueDate },
          project: task.project as unknown as {
            id: string;
            name: string;
            referenceNumber?: string | null;
          },
          assignedBy: req.user
            ? { firstName: (req.user as any).firstName, lastName: (req.user as any).lastName }
            : null,
        });
      }
    }

    res.json({
      success: true,
      message: 'Task updated successfully',
      data: task,
      ...(gamification ? { gamification } : {}),
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Delete task
export const deleteTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.role) {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to delete tasks.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    const { id } = req.params;

    console.log(`🗑️ Delete task request: id=${id}, user=${req.user?.email}, role=${req.user?.role}`);

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        subtasks: {
          select: { id: true, title: true },
        },
        parentTask: {
          select: { id: true, title: true, parentTaskId: true },
        },
        assignments: { select: { employeeId: true } },
        delegations: { select: { originalAssigneeId: true, newAssigneeId: true } },
        project: { select: { createdBy: true, status: true } },
      },
    });

    if (!task) {
      console.error(`❌ Task not found: ${id}`);
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    const projectIdForLog = task.projectId;
    const titleForLog = task.title;
    const parentTaskIdForLog = task.parentTaskId;
    const parentParentId = task.parentTask?.parentTaskId;

    const isChildTask = !!task.parentTaskId;

    const delPerms = await deletePermissionsForTask(
      req.user,
      task as any,
      task.project,
      new Map(),
    );

    if (!delPerms.canDelete) {
      res.status(403).json({
        success: false,
        message: MESSAGE_NO_PERMISSION_DELETE_TASK,
        code: 'NO_PERMISSION_DELETE_TASK',
      });
      return;
    }

    // Prisma will automatically handle cascading deletes for child tasks when parent is deleted
    // For child tasks, we can delete them directly
    
    console.log(`🗑️ Attempting to delete ${isChildTask ? 'child task' : 'main task'} ${id} (${task.title}) by ${req.user.role} (${req.user.email})`);
    
    try {
      // If this task has nested child tasks, Prisma will cascade delete them automatically
      // due to onDelete: Cascade in the schema
      // For child tasks, we can delete them directly - Prisma handles the cascade
      
      // Delete the task (Prisma will cascade delete child tasks if this is a parent task)
      const deleteResult = await prisma.task.delete({
        where: { id },
      });

      let deleteAction = 'SUBTASK_DELETED';
      if (!parentTaskIdForLog) {
        deleteAction = 'MAIN_TASK_ROW_DELETED';
      } else if (!parentParentId) {
        deleteAction = 'SUBTASK_DELETED';
      } else {
        deleteAction = 'CHILD_TASK_DELETED';
      }
      const nested = task.subtasks?.length || 0;
      await logProjectActivity({
        projectId: projectIdForLog,
        actorId: req.user?.id,
        action: deleteAction,
        taskId: id,
        summary:
          !parentTaskIdForLog && nested > 0
            ? `Removed "${titleForLog}" (${nested} nested item(s) cascade-deleted)`
            : `Removed "${titleForLog}"`,
        metadata: {
          taskTitle: titleForLog,
          nestedSubtasksDeleted: nested,
        },
      });

      console.log(`✅ Successfully deleted ${isChildTask ? 'child task' : 'task'} ${id} (${task.title})`);
      if (task.subtasks && task.subtasks.length > 0) {
        console.log(`   Also deleted ${task.subtasks.length} nested child task(s) due to cascade`);
      }

      res.json({
        success: true,
        message: `${isChildTask ? 'Child task' : 'Task'} deleted successfully`,
        data: {
          deletedTaskId: id,
          deletedTaskTitle: task.title,
          wasChildTask: isChildTask,
          nestedTasksDeleted: task.subtasks?.length || 0,
        },
      });
    } catch (deleteError: any) {
      console.error(`❌ Error during task deletion:`, {
        error: deleteError.message,
        code: deleteError.code,
        meta: deleteError.meta,
        taskId: id,
        taskTitle: task.title,
        isChildTask,
        parentTaskId: task.parentTaskId,
      });
      
      // Provide more specific error messages
      if (deleteError.code === 'P2025') {
        // Record not found (shouldn't happen since we checked above, but handle it)
        res.status(404).json({
          success: false,
          message: 'Task not found or already deleted',
        });
        return;
      }
      
      throw deleteError; // Re-throw to be handled by outer catch
    }
  } catch (error: any) {
    console.error('Delete task error:', error);
    console.error('Delete task error details:', {
      message: error?.message,
      code: error?.code,
      name: error?.name,
      meta: error?.meta,
      stack: error?.stack,
    });
    
    // Handle specific Prisma errors
    if (error.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'Cannot delete task: It has dependencies that must be removed first.',
        error: error.message,
      });
      return;
    }
    
    if (error.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'Task not found or already deleted',
        error: error.message,
      });
      return;
    }
    
    // Generic error response with details in development
    res.status(500).json({
      success: false,
      message: 'Failed to delete task',
      error: error.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: error.stack }),
    });
  }
};

// Bulk delete tasks
export const deleteTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  console.log('🚀 deleteTasks endpoint called');
  console.log(`🔍 Request path: ${req.path}, method: ${req.method}`);
  console.log(`🔍 Request URL: ${req.url}`);
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  console.log('👤 User:', req.user?.email, 'Role:', req.user?.role);
  
  try {
    if (!req.user?.role) {
      console.log('❌ No user role found');
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to delete tasks.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    // Support both formats: {selectedTasks, selectedSubtasks} and {ids}
    let allTaskIds: string[] = [];
    
    if (req.body.selectedTasks || req.body.selectedSubtasks) {
      // Frontend format: {selectedTasks: [], selectedSubtasks: []}
      const { selectedTasks = [], selectedSubtasks = [] } = req.body;
      console.log('📋 Parsed arrays - selectedTasks:', selectedTasks, 'selectedSubtasks:', selectedSubtasks);
      allTaskIds = [
        ...(Array.isArray(selectedTasks) ? selectedTasks : []),
        ...(Array.isArray(selectedSubtasks) ? selectedSubtasks : [])
      ];
    } else if (req.body.ids && Array.isArray(req.body.ids)) {
      // Alternative format: {ids: []}
      console.log('📋 Using ids format:', req.body.ids);
      allTaskIds = req.body.ids;
    } else {
      console.error('❌ Invalid request body format:', req.body);
      res.status(400).json({ 
        success: false, 
        message: 'Invalid request format. Expected {selectedTasks: [], selectedSubtasks: []} or {ids: []}' 
      });
      return;
    }

    if (allTaskIds.length === 0) {
      console.warn('⚠️ No task IDs provided for deletion');
      res.status(400).json({ 
        success: false, 
        message: 'No tasks selected for deletion. Please select at least one task or subtask.' 
      });
      return;
    }
    
    console.log(`📋 Total task IDs to delete: ${allTaskIds.length}`, allTaskIds);
    console.log(`🗑️ Bulk delete request: ${allTaskIds.length} tasks, user=${req.user?.email}, role=${req.user?.role}`);

    const tasks = await prisma.task.findMany({
      where: { id: { in: allTaskIds } },
      include: {
        subtasks: {
          select: { id: true, title: true },
        },
        parentTask: {
          select: { id: true, title: true, parentTaskId: true },
        },
        assignments: { select: { employeeId: true } },
        delegations: { select: { originalAssigneeId: true, newAssigneeId: true } },
        project: { select: { createdBy: true, status: true } },
      },
    });

    if (tasks.length !== allTaskIds.length) {
      const foundIds = new Set(tasks.map((t) => t.id));
      const missingIds = allTaskIds.filter((tid) => !foundIds.has(tid));
      console.warn(`⚠️ Some tasks not found: ${missingIds.join(', ')}`);
    }

    const managesCache = new Map<string, boolean>();
    const forbidden = [];
    for (const t of tasks) {
      const p = await deletePermissionsForTask(req.user!, t as any, t.project, managesCache);
      if (!p.canDelete) forbidden.push(t);
    }

    if (forbidden.length > 0) {
      res.status(403).json({
        success: false,
        message: MESSAGE_NO_PERMISSION_DELETE_TASK,
        code: 'NO_PERMISSION_DELETE_TASK',
      });
      return;
    }

    const tasksToDelete = tasks;

    // Delete all allowed tasks
    let deletedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const task of tasksToDelete) {
      try {
        await prisma.task.delete({
          where: { id: task.id },
        });
        deletedCount++;
        console.log(`✅ Deleted ${task.parentTaskId ? 'child task' : 'main task'} ${task.id} (${task.title})`);
      } catch (error: any) {
        failedCount++;
        const errorMsg = `Failed to delete task ${task.id} (${task.title}): ${error.message}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    if (failedCount > 0 && deletedCount === 0) {
      // All deletions failed
      res.status(500).json({
        success: false,
        message: `Failed to delete tasks: ${errors.join('; ')}`,
        errors,
      });
      return;
    }

    res.json({
      success: true,
      message: `Successfully deleted ${deletedCount} task(s)${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
      data: {
        deletedCount,
        failedCount,
        totalRequested: allTaskIds.length,
        errors: failedCount > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error('❌ Bulk delete tasks error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ 
      success: false, 
      message: `Failed to delete tasks: ${errorMessage}`,
      error: errorMessage
    });
  }
};

// Assign employees to task
export const assignEmployees = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Employee role: Cannot assign employees to tasks
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to assign employees to tasks. Only managers and admins can assign tasks.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    const { id } = req.params;
    const { employeeIds } = req.body;

    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Employee IDs array is required',
      });
      return;
    }

    // All managers (MANAGER and PROJECT_MANAGER) can assign tasks to any employee
    // No team member restriction - managers have full assignment capabilities

    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    try {
      await ensureTaskProjectWriteAllowed(id, req.user, prisma);
    } catch (error: any) {
      if (error?.code === 'PROJECT_SUSPENDED') {
        res.status(error.statusCode || 423).json({
          success: false,
          message: PROJECT_SUSPENDED_MESSAGE,
          code: 'PROJECT_SUSPENDED',
        });
        return;
      }
      throw error;
    }

    // Remove existing assignments
    await prisma.taskAssignment.deleteMany({
      where: { taskId: id },
    });

    // Create new assignments
    const assignments = await Promise.all(
      employeeIds.map((employeeId: string) =>
        prisma.taskAssignment.create({
          data: {
            taskId: id,
            employeeId,
            assignedBy: req.user?.id || null,
            status: 'PENDING',
          },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
        })
      )
    );

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

// Update task assignment status
export const updateAssignmentStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id, assignmentId } = req.params;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({
        success: false,
        message: 'Status is required',
      });
      return;
    }

    const assignment = await prisma.taskAssignment.findFirst({
      where: {
        id: assignmentId,
        taskId: id,
        employeeId: req.user?.id,
      },
    });

    if (!assignment) {
      res.status(404).json({
        success: false,
        message: 'Assignment not found or unauthorized',
      });
      return;
    }

    try {
      await ensureTaskProjectWriteAllowed(id, req.user, prisma);
    } catch (error: any) {
      if (error?.code === 'PROJECT_SUSPENDED') {
        res.status(error.statusCode || 423).json({
          success: false,
          message: PROJECT_SUSPENDED_MESSAGE,
          code: 'PROJECT_SUSPENDED',
        });
        return;
      }
      throw error;
    }

    const updatedAssignment = await prisma.taskAssignment.update({
      where: { id: assignmentId },
      data: { status },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });

    res.json({
      success: true,
      message: 'Assignment status updated successfully',
      data: updatedAssignment,
    });
  } catch (error) {
    console.error('Update assignment status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Delegate a child/subtask to another employee (only assignee can delegate; main tasks cannot be delegated by employees)
export const delegateTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: taskId } = req.params;
    const { newAssigneeId, reason } = req.body as { newAssigneeId?: string; reason?: string };

    if (!newAssigneeId) {
      res.status(400).json({ success: false, message: 'newAssigneeId is required' });
      return;
    }

    const currentUserId = req.user!.id;
    if (newAssigneeId === currentUserId) {
      res.status(400).json({ success: false, message: 'Cannot delegate a task to yourself' });
      return;
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        parentTaskId: true,
        assignedEmployeeId: true,
      },
    });

    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    try {
      await ensureTaskProjectWriteAllowed(taskId, req.user, prisma);
    } catch (error: any) {
      if (error?.code === 'PROJECT_SUSPENDED') {
        res.status(error.statusCode || 423).json({
          success: false,
          message: PROJECT_SUSPENDED_MESSAGE,
          code: 'PROJECT_SUSPENDED',
        });
        return;
      }
      throw error;
    }

    // Only child/subtasks can be delegated by employees (main tasks have parentTaskId = null)
    if (!task.parentTaskId && req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Employees cannot delegate main tasks. Only child/subtasks can be delegated.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    // Only the current assignee (or admin) can delegate
    if (
      task.assignedEmployeeId !== currentUserId &&
      req.user?.role !== 'ADMIN' &&
      req.user?.role !== 'SUPER_ADMIN' &&
      req.user?.role !== 'PROJECT_MANAGER'
    ) {
      res.status(403).json({
        success: false,
        message: 'You can only delegate tasks that are assigned to you.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    const newAssignee = await prisma.user.findUnique({
      where: { id: newAssigneeId },
      select: { id: true, isActive: true },
    });
    if (!newAssignee || !newAssignee.isActive) {
      res.status(400).json({ success: false, message: 'New assignee not found or inactive' });
      return;
    }

    const originalAssigneeId = task.assignedEmployeeId!;

    await prisma.$transaction(async (tx) => {
      await (tx as any).taskDelegation.create({
        data: {
          taskId,
          originalAssigneeId,
          newAssigneeId,
          delegatedById: currentUserId,
          reason: reason ?? null,
        },
      });
      await tx.task.update({
        where: { id: taskId },
        data: { assignedEmployeeId: newAssigneeId },
      });
    });

    const updated = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignedEmployee: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        delegations: {
          orderBy: { delegatedAt: 'desc' },
          take: 1,
          include: {
            originalAssignee: { select: { id: true, firstName: true, lastName: true } },
            newAssignee: { select: { id: true, firstName: true, lastName: true } },
            delegatedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      } as any,
    });

    res.json({
      success: true,
      message: 'Task delegated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Delegate task error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Manager drag-and-drop reassign — updates assignee and returns refreshed workload scores.
 * PATCH /api/tasks/:id/reassign
 * Body: { toEmployeeId, fromEmployeeId? }
 */
export const reassignTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    if (
      role !== 'ADMIN' &&
      role !== 'SUPER_ADMIN' &&
      role !== 'MANAGER' &&
      role !== 'PROJECT_MANAGER' &&
      role !== 'HR'
    ) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const { id: taskId } = req.params;
    const toEmployeeId = String(req.body?.toEmployeeId ?? '').trim();
    const fromEmployeeId = req.body?.fromEmployeeId
      ? String(req.body.fromEmployeeId).trim()
      : null;

    if (!toEmployeeId) {
      res.status(400).json({ success: false, message: 'toEmployeeId is required' });
      return;
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true, assignedEmployeeId: true, projectId: true },
    });
    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    const previousAssigneeId = task.assignedEmployeeId;
    if (fromEmployeeId && previousAssigneeId && fromEmployeeId !== previousAssigneeId) {
      res.status(400).json({
        success: false,
        message: 'fromEmployeeId does not match current assignee',
      });
      return;
    }

    const newAssignee = await prisma.user.findUnique({
      where: { id: toEmployeeId },
      select: { id: true, isActive: true },
    });
    if (!newAssignee?.isActive) {
      res.status(400).json({ success: false, message: 'Target employee not found or inactive' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: { assignedEmployeeId: toEmployeeId },
      });
      await tx.taskAssignment.updateMany({
        where: { taskId, employeeId: previousAssigneeId ?? undefined },
        data: { employeeId: toEmployeeId, status: 'IN_PROGRESS' },
      });
      const hasAssignment = await tx.taskAssignment.findFirst({ where: { taskId, employeeId: toEmployeeId } });
      if (!hasAssignment) {
        await tx.taskAssignment.create({
          data: {
            taskId,
            employeeId: toEmployeeId,
            assignedBy: req.user?.id ?? null,
            status: 'IN_PROGRESS',
          },
        });
      }
    });

    const [fromWorkload, toWorkload, updatedTask] = await Promise.all([
      previousAssigneeId ? computeEmployeeWorkload(previousAssigneeId) : null,
      computeEmployeeWorkload(toEmployeeId),
      prisma.task.findUnique({
        where: { id: taskId },
        include: {
          assignedEmployee: {
            select: { id: true, firstName: true, lastName: true, email: true, starCount: true, totalXp: true },
          },
        },
      }),
    ]);

    void notifyWorkloadForTaskChange(
      [previousAssigneeId, toEmployeeId],
      'task_reassigned',
    );

    res.json({
      success: true,
      message: 'Task reassigned successfully',
      data: {
        task: updatedTask,
        workload: {
          from: fromWorkload,
          to: toWorkload,
        },
      },
    });
  } catch (error) {
    console.error('reassignTask error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Admin: delegation report for audit (original assignee, new assignee, task ID, date/time, reason)
export const getDelegationsReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (
      req.user?.role !== 'ADMIN' &&
      req.user?.role !== 'SUPER_ADMIN' &&
      req.user?.role !== 'PROJECT_MANAGER'
    ) {
      res.status(403).json({
        success: false,
        message: 'Only admins and project managers can access the delegation report.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    const { taskId, userId, from, to } = req.query as {
      taskId?: string;
      userId?: string;
      from?: string;
      to?: string;
    };

    const where: any = {};
    if (taskId) where.taskId = taskId;
    if (userId) {
      where.OR = [
        { originalAssigneeId: userId },
        { newAssigneeId: userId },
      ];
    }
    if (from || to) {
      where.delegatedAt = {};
      if (from) where.delegatedAt.gte = new Date(from);
      if (to) where.delegatedAt.lte = new Date(to);
    }

    const delegations = await (prisma as any).taskDelegation.findMany({
      where,
      orderBy: { delegatedAt: 'desc' },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            parentTaskId: true,
          },
        },
        originalAssignee: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        newAssignee: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        delegatedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    res.json({
      success: true,
      data: delegations,
    });
  } catch (error) {
    console.error('Delegation report error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Get task statistics
export const getTaskStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;

    // First, check if there are any projects
    const projectCount = await prisma.project.count({});
    
    // If no projects exist, return all zeros
    if (projectCount === 0) {
      res.json({
        success: true,
        data: {
          total: 0,
          completed: 0,
          inProgress: 0,
          pending: 0,
          byPriority: {},
        },
      });
      return;
    }

    const where: any = {};
    if (projectId) {
      where.projectId = projectId as string;
    } else {
      // Only count tasks that belong to existing projects
      // This ensures orphaned tasks (without projects) are not counted
      const existingProjects = await prisma.project.findMany({
        select: { id: true },
      });
      const projectIds = existingProjects.map(p => p.id);
      if (projectIds.length > 0) {
        where.projectId = { in: projectIds };
      } else {
        // No projects, return zeros
        res.json({
          success: true,
          data: {
            total: 0,
            completed: 0,
            inProgress: 0,
            pending: 0,
            byPriority: {},
          },
        });
        return;
      }
    }

    // Employee: count any task row (main or sub) where they are assignee, creator, or original delegate
    if (req.user && req.user.role === 'EMPLOYEE') {
      Object.assign(where, taskRowInvolvesEmployee(req.user.id));
    }

    const [
      totalTasks,
      completedTasks,
      inProgressTasks,
      pendingTasks,
      tasksByPriority,
    ] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.task.count({ where: { ...where, status: 'IN_PROGRESS' } }),
      prisma.task.count({ where: { ...where, status: 'PENDING' } }),
      prisma.task.groupBy({
        by: ['priority'],
        where,
        _count: true,
      }),
    ]);

    const stats = {
      total: totalTasks,
      completed: completedTasks,
      inProgress: inProgressTasks,
      pending: pendingTasks,
      byPriority: tasksByPriority.reduce((acc: any, stat: any) => {
        acc[stat.priority] = stat._count;
        return acc;
      }, {}),
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Get task stats error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Add subtask to a main task (requires parentId = main task id)
export const addSubtask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('📝 Add subtask request:', {
      parentId: req.params.parentId,
      body: req.body,
      user: { id: req.user?.id, role: req.user?.role },
    });
    const { parentId } = req.params; // Main task ID
    const bodyTitle = req.body?.title ?? req.body?.name;
    const {
      description,
      status,
      priority,
      startDate,
      dueDate,
      category,
      referenceNumber,
      planDays,
      remarks,
      assigneeNotes,
      location,
      makaniNumber,
      plotNumber,
      community,
      projectType,
      projectFloor,
      developerProject,
      tags,
      timeline, // [startDate, endDate] array
      childSubtasks, // Nested child tasks
      assignedEmployeeId,
      assignedTo, // alias for assigned employee
      predecessorId,
    } = req.body;
    const title = bodyTitle ?? req.body?.title ?? req.body?.name;

    // Validate required fields
    if (!title || (typeof title === 'string' && !title.trim()) || !parentId) {
      res.status(400).json({
        success: false,
        message: 'Title and parent task ID are required',
      });
      return;
    }

    // Check if parent task exists and verify employee has access
    const parentTask = await prisma.task.findUnique({
      where: { id: parentId },
      include: {
        assignments: {
          select: { employeeId: true },
        },
      },
    });

    if (!parentTask) {
      res.status(404).json({
        success: false,
        message: 'Parent task not found',
      });
      return;
    }

    try {
      await ensureTaskProjectWriteAllowed(parentId, req.user, prisma);
    } catch (error: any) {
      if (error?.code === 'PROJECT_SUSPENDED') {
        res.status(error.statusCode || 423).json({
          success: false,
          message: PROJECT_SUSPENDED_MESSAGE,
          code: 'PROJECT_SUSPENDED',
        });
        return;
      }
      throw error;
    }

    // Employee role: Can only create subtasks for tasks assigned to them
    // Main tasks use assignments, subtasks use assignedEmployeeId
    if (req.user?.role === 'EMPLOYEE') {
      const parentTaskWithAssignments = parentTask as typeof parentTask & { assignments?: { employeeId: string }[] };
      const isAssignedViaMainTask = parentTaskWithAssignments.assignments?.some(
        (a) => a.employeeId === req.user!.id
      );
      const isAssignedViaSubtask = (parentTask as any).assignedEmployeeId === req.user!.id;
      
      console.log('🔐 Employee permission check:', {
        userId: req.user!.id,
        isAssignedViaMainTask,
        isAssignedViaSubtask,
        assignments: parentTaskWithAssignments.assignments,
        assignedEmployeeId: (parentTask as any).assignedEmployeeId,
      });
      
      if (!isAssignedViaMainTask && !isAssignedViaSubtask) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: You can only create subtasks for tasks assigned to you.',
          code: 'ACCESS_DENIED',
        });
        return;
      }
    }

    const assigneeId = assignedEmployeeId || assignedTo || null;

    // Use projectId from parentTask (required for task creation)
    const projectId = parentTask.projectId;
    if (!projectId) {
      res.status(400).json({
        success: false,
        message: 'Parent task has no project linked. Cannot create subtask.',
      });
      return;
    }

    // Helper to map child subtask data
    const mapChildSubtaskData = (child: any) => {
      const childHasPredecessor = !!child.predecessorId;
      const childStatus = mapFrontendTaskStatusToEnum(child.status);
      return {
        title: child.title || child.name || '',
        description: child.description || null,
        projectId: parentTask.projectId,
        status: childStatus,
        workflowStatus: childHasPredecessor ? 'WAITING_FOR_PREDECESSOR' : 'NOT_STARTED',
        priority: child.priority === 'Low' ? 'LOW' : 
                  child.priority === 'High' ? 'HIGH' : 
                  child.priority === 'Medium' ? 'MEDIUM' : 'MEDIUM',
        startDate: child.timeline?.[0] ? new Date(child.timeline[0]) : 
                   child.startDate ? new Date(child.startDate) : null,
        dueDate: child.timeline?.[1] ? new Date(child.timeline[1]) : 
                 child.endDate ? new Date(child.endDate) : null,
        category: child.category || null,
        referenceNumber: child.referenceNumber || null,
        planDays: child.planDays ? parseInt(String(child.planDays), 10) : null,
        remarks: child.remarks || null,
        assigneeNotes: child.assigneeNotes || null,
        location: child.location || null,
        makaniNumber: child.makaniNumber || null,
        plotNumber: child.plotNumber || null,
        community: child.community || null,
        projectType: child.projectType || null,
        projectFloor: child.projectFloor || null,
        developerProject: child.developerProject || null,
        tags: Array.isArray(child.tags) ? child.tags : [],
        createdBy: req.user?.id || null,
        assignedEmployeeId: child.assignedEmployeeId || child.assignedTo || null,
        predecessorId: child.predecessorId || null,
      };
    };

    const titleStr = typeof title === 'string' ? title.trim() : String(title || '').trim();
    // Create subtask with nested child tasks
    console.log('📝 Creating subtask with data:', {
      title: titleStr,
      projectId: projectId,
      parentTaskId: parentId,
      assignedEmployeeId: assigneeId,
      hasChildSubtasks: childSubtasks && Array.isArray(childSubtasks) && childSubtasks.length > 0,
    });
    const subStatus = mapFrontendTaskStatusToEnum(status);
    const hasPredecessor = !!predecessorId;

    const nextSubSeq = await computeNextStableWorkSeq(prisma, projectId, parentId as string);
    const subtask = await prisma.task.create({
      data: {
        title: titleStr,
        description: description || null,
        projectId: projectId,
        parentTaskId: parentId as any, // Link to parent task
        stableWorkSeq: nextSubSeq,
        taskOrder: nextSubSeq,
        status: subStatus,
        workflowStatus: hasPredecessor ? 'WAITING_FOR_PREDECESSOR' : 'NOT_STARTED',
        priority: priority === 'Low' ? 'LOW' : 
                  priority === 'High' ? 'HIGH' : 
                  priority === 'Medium' ? 'MEDIUM' : 'MEDIUM',
        startDate: timeline?.[0] ? new Date(timeline[0]) : 
                   startDate ? new Date(startDate) : null,
        dueDate: timeline?.[1] ? new Date(timeline[1]) : 
                 dueDate ? new Date(dueDate) : null,
        category: category || null as any,
        referenceNumber: referenceNumber || null as any,
        planDays: planDays ? parseInt(String(planDays), 10) : null as any,
        remarks: remarks || null as any,
        assigneeNotes: assigneeNotes || null as any,
        location: location || null as any,
        makaniNumber: makaniNumber || null as any,
        plotNumber: plotNumber || null as any,
        community: community || null as any,
        projectType: projectType || null as any,
        projectFloor: projectFloor || null as any,
        developerProject: developerProject || null as any,
        tags: Array.isArray(tags) ? tags : [],
        createdBy: req.user?.id || null,
        assignedEmployeeId: assigneeId || null,
        predecessorId: predecessorId || null,
        // Nested create for child tasks
        subtasks: childSubtasks && Array.isArray(childSubtasks) && childSubtasks.length > 0
          ? {
              create: childSubtasks.map(mapChildSubtaskData),
            }
          : undefined,
      } as any,
      include: {
        parentTask: {
          select: {
            id: true,
            title: true,
          },
        } as any,
        assignedEmployee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        } as any,
        subtasks: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      } as any,
    });

    const nestedKids = (subtask as any).subtasks || [];
    for (const ch of nestedKids) {
      const n2 = await computeNextStableWorkSeq(prisma, projectId, subtask.id);
      await prisma.task.update({ where: { id: ch.id }, data: { stableWorkSeq: n2, taskOrder: n2 } as any });
    }

    res.status(201).json({
      success: true,
      message: 'Subtask created successfully',
      data: subtask,
    });
  } catch (error: any) {
    console.error('❌ Add subtask error:', error);
    console.error('❌ Error details:', {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
      meta: error?.meta,
    });
    const message = error?.message || 'Internal server error';
    const isDev = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: isDev ? message : 'Failed to save subtask. Please try again.',
      ...(isDev && {
        error: message,
        code: error?.code,
        meta: error?.meta,
      }),
    });
  }
};

// Add child task to a subtask (requires parentId = subtask id)
export const addChildTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('📝 Add child task request:', {
      parentId: req.params.parentId,
      body: req.body,
      user: { id: req.user?.id, role: req.user?.role },
    });
    const { parentId } = req.params; // Subtask ID
    const bodyTitle = req.body?.title ?? req.body?.name;
    const {
      description,
      status,
      priority,
      startDate,
      dueDate,
      category,
      referenceNumber,
      planDays,
      remarks,
      assigneeNotes,
      location,
      makaniNumber,
      plotNumber,
      community,
      projectType,
      projectFloor,
      developerProject,
      tags,
      timeline,
      assignedEmployeeId,
      assignedTo,
      predecessorId,
    } = req.body;
    const title = bodyTitle ?? req.body?.title ?? req.body?.name;

    // Validate required fields
    if (!title || (typeof title === 'string' && !title.trim()) || !parentId) {
      res.status(400).json({
        success: false,
        message: 'Title and parent subtask ID are required',
      });
      return;
    }

    const assigneeId = assignedEmployeeId || assignedTo || null;

    // Check if parent subtask exists and verify employee has access
    const parentSubtask = await prisma.task.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        projectId: true,
        parentTaskId: true,
        assignedEmployeeId: true,
      },
    });

    if (!parentSubtask) {
      res.status(404).json({
        success: false,
        message: 'Parent subtask not found',
      });
      return;
    }

    try {
      await ensureTaskProjectWriteAllowed(parentId, req.user, prisma);
    } catch (error: any) {
      if (error?.code === 'PROJECT_SUSPENDED') {
        res.status(error.statusCode || 423).json({
          success: false,
          message: PROJECT_SUSPENDED_MESSAGE,
          code: 'PROJECT_SUSPENDED',
        });
        return;
      }
      throw error;
    }

    // Employee role: Can only create child tasks for subtasks assigned to them
    if (req.user?.role === 'EMPLOYEE') {
      if (parentSubtask.assignedEmployeeId !== req.user!.id) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: You can only create child tasks for subtasks assigned to you.',
          code: 'ACCESS_DENIED',
        });
        return;
      }
    }

    const titleStr = typeof title === 'string' ? title.trim() : String(title || '').trim();
    // Create child task
    console.log('📝 Creating child task with data:', {
      title: titleStr,
      projectId: parentSubtask.projectId,
      parentTaskId: parentId,
      assignedEmployeeId: assigneeId,
    });
    const childStatus = mapFrontendTaskStatusToEnum(status);
    const childHasPredecessor = !!predecessorId;

    const nextChildSeq = await computeNextStableWorkSeq(prisma, parentSubtask.projectId, parentId as string);
    const childTask = await prisma.task.create({
      data: {
        title: titleStr,
        description: description || null,
        projectId: parentSubtask.projectId,
        parentTaskId: parentId as any, // Link to parent subtask
        stableWorkSeq: nextChildSeq,
        taskOrder: nextChildSeq,
        status: childStatus,
        workflowStatus: childHasPredecessor ? 'WAITING_FOR_PREDECESSOR' : 'NOT_STARTED',
        priority: priority === 'Low' ? 'LOW' : 
                  priority === 'High' ? 'HIGH' : 
                  priority === 'Medium' ? 'MEDIUM' : 'MEDIUM',
        startDate: timeline?.[0] ? new Date(timeline[0]) : 
                   startDate ? new Date(startDate) : null,
        dueDate: timeline?.[1] ? new Date(timeline[1]) : 
                 dueDate ? new Date(dueDate) : null,
        category: category || null as any,
        referenceNumber: referenceNumber || null as any,
        planDays: planDays ? parseInt(String(planDays), 10) : null as any,
        remarks: remarks || null as any,
        assigneeNotes: assigneeNotes || null as any,
        location: location || null as any,
        makaniNumber: makaniNumber || null as any,
        plotNumber: plotNumber || null as any,
        community: community || null as any,
        projectType: projectType || null as any,
        projectFloor: projectFloor || null as any,
        developerProject: developerProject || null as any,
        tags: Array.isArray(tags) ? tags : [],
        createdBy: req.user?.id || null,
        assignedEmployeeId: assigneeId || null,
        predecessorId: predecessorId || null,
      } as any,
      include: {
        parentTask: {
          select: {
            id: true,
            title: true,
          },
        } as any,
        assignedEmployee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        } as any,
      } as any,
    });

    res.status(201).json({
      success: true,
      message: 'Child task created successfully',
      data: childTask,
    });
  } catch (error: any) {
    console.error('❌ Add child task error:', error);
    console.error('❌ Error details:', {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
      meta: error?.meta,
    });
    const message = error?.message || 'Internal server error';
    const isDev = process.env.NODE_ENV === 'development';
    res.status(500).json({
      success: false,
      message: isDev ? message : 'Failed to save child task. Please try again.',
      ...(isDev && {
        error: message,
        code: error?.code,
        meta: error?.meta,
      }),
    });
  }
};

// Get tasks for Kanban board (root tasks only; employees see roots where they are assigned or have a child assigned to them)
export const getKanbanTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;

    const where: any = {
      parentTaskId: null,
    };
    if (projectId) {
      where.projectId = projectId as string;
    }

    if (req.user && req.user.role === 'EMPLOYEE') {
      where.OR = [
        { assignments: { some: { employeeId: req.user.id } } },
        { subtasks: { some: { assignedEmployeeId: req.user.id } } },
        { subtasks: { some: { subtasks: { some: { assignedEmployeeId: req.user.id } } } } },
        { subtasks: { some: { delegations: { some: { originalAssigneeId: req.user.id } } } } },
        { subtasks: { some: { subtasks: { some: { delegations: { some: { originalAssigneeId: req.user.id } } } } } } },
      ];
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
          },
        },
        assignments: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                photo: true,
              },
            },
          },
        },
        _count: {
          select: {
            checklists: true,
            attachments: true,
            comments: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Group tasks by status
    const kanbanData = {
      PENDING: tasks.filter((t: any) => t.status === 'PENDING'),
      IN_PROGRESS: tasks.filter((t: any) => t.status === 'IN_PROGRESS'),
      COMPLETED: tasks.filter((t: any) => t.status === 'COMPLETED'),
      // Frontend Kanban has a "Suspended" column. We treat both ON_HOLD and NOT_REQUIRED as "Suspended"
      // so these tasks don't disappear from Kanban when users select "NOT REQUIRED".
      ON_HOLD: tasks.filter((t: any) => t.status === 'ON_HOLD' || t.status === 'NOT_REQUIRED'),
      CANCELLED: tasks.filter((t: any) => t.status === 'CANCELLED'),
    };

    res.json({
      success: true,
      data: kanbanData,
    });
  } catch (error) {
    console.error('Get kanban tasks error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

