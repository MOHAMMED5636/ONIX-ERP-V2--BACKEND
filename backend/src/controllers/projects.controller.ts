import { Request, Response } from 'express';
import prisma from '../config/database';
import {
  mainTaskVisibleToEmployeeInProject,
  taskRowInvolvesEmployee,
} from '../utils/employee-task-involvement';
import { AuthRequest } from '../middleware/auth.middleware';
import { ProjectStatus, TaskStatus, TaskPriority } from '@prisma/client';
import {
  computeTaskPermissions,
} from '../utils/task-permissions';
import { unlockDependentsWaitingOnFinishedPredecessor } from '../utils/task-predecessor-unlock';
import { computeNextProjectNumber } from '../utils/project-number';

function looksLikeUuid(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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

// Helper function to map frontend status to TaskStatus enum
function mapStatusToTaskStatus(status: string): TaskStatus {
  if (status == null || typeof status !== 'string') {
    return TaskStatus.PENDING;
  }
  const s = status.trim().toLowerCase();
  const statusMap: Record<string, TaskStatus> = {
    'not started': TaskStatus.PENDING,
    pending: TaskStatus.PENDING,
    working: TaskStatus.IN_PROGRESS,
    'in progress': TaskStatus.IN_PROGRESS,
    done: TaskStatus.COMPLETED,
    completed: TaskStatus.COMPLETED,
    stuck: TaskStatus.ON_HOLD,
    cancelled: TaskStatus.CANCELLED,
    suspended: TaskStatus.ON_HOLD,
  };
  if (statusMap[s]) {
    return statusMap[s];
  }
  // UI pills like "Done - Open Next Phase", "Done - Spec Next Phase" must count as completed
  // so dependents unlock (previously fell through to PENDING and never triggered unlock).
  if (s.startsWith('done')) {
    return TaskStatus.COMPLETED;
  }
  return TaskStatus.PENDING;
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
): Promise<void> {
  if (!childSubtasks || !Array.isArray(childSubtasks) || childSubtasks.length === 0) {
    return;
  }

  console.log(`📝 saveChildSubtasks: Saving ${childSubtasks.length} child tasks under parent ${parentTaskId}`);

  // Get existing child subtasks and parent task (for inheriting location fields)
  const [existingChildSubtasks, parentTask] = await Promise.all([
    prisma.task.findMany({
      where: { parentTaskId, projectId },
      include: {
        assignments: {
          select: { employeeId: true },
        },
      },
    }),
    prisma.task.findUnique({ where: { id: parentTaskId }, select: { location: true, makaniNumber: true, plotNumber: true, community: true, projectType: true, projectFloor: true, developerProject: true } }),
  ]);

  console.log(`📝 Found ${existingChildSubtasks.length} existing child tasks for parent ${parentTaskId}`);

  const existingChildIds = new Set(existingChildSubtasks.map(cst => cst.id));
  // Filter out null/undefined IDs and create set of incoming IDs
  const incomingChildIds = new Set(
    childSubtasks
      .filter(cst => cst.id && cst.id !== null && cst.id !== undefined && cst.id !== '')
      .map(cst => String(cst.id))
  );

  console.log(`📝 Incoming child task IDs:`, Array.from(incomingChildIds));
  console.log(`📝 Existing child task IDs:`, Array.from(existingChildIds));

  // Delete child subtasks that are no longer in the incoming list
  // IMPORTANT: Only delete if the child task ID is explicitly missing from incoming list
  // This prevents deletion when frontend sends child tasks without IDs due to assignment changes
  const childSubtasksToDelete = existingChildSubtasks.filter(cst => {
    let shouldDelete = !incomingChildIds.has(cst.id);

    // EMPLOYEE rule: Only the creator of a child task can delete it via this helper.
    if (shouldDelete && currentUserRole === 'EMPLOYEE' && currentUserId) {
      if (cst.createdBy !== currentUserId) {
        console.log(`⛔ Skipping delete of child task ${cst.id} by non-creator employee ${currentUserId}`);
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
    await prisma.task.deleteMany({
      where: {
        id: { in: childSubtasksToDelete.map(cst => cst.id) },
      },
    });
  }

  // Create or update child subtasks
  let childCreatedCount = 0;
  let childUpdatedCount = 0;
  for (const childSubtask of childSubtasks) {
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
    const assignedEmpId = await resolveAssigneeUserId(assignedEmpRaw);
    
    console.log(`📝 Processing child task: id=${childTaskId || 'NEW'}, title=${childTitle}, assignedEmployeeId=${assignedEmpId || 'NONE'}`);
    
    // Inherit from parent task then project (manager project list): plot number, community, project type, no. of floors, developer name
    const childSubtaskData: any = {
      title: childTitle,
      projectId: projectId,
      parentTaskId: parentTaskId,
      status: mapStatusToTaskStatus(childSubtask.status),
      priority: mapPriorityToTaskPriority(childSubtask.priority),
      category: childSubtask.category || null,
      referenceNumber: childSubtask.referenceNumber || null,
      planDays: childSubtask.planDays ? parseInt(String(childSubtask.planDays), 10) : null,
      remarks: childSubtask.remarks || null,
      assigneeNotes: childSubtask.assigneeNotes || null,
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
    if (childSubtask.predecessors !== undefined) {
      childSubtaskData.predecessors = (childSubtask.predecessors != null && String(childSubtask.predecessors).trim() !== '') ? String(childSubtask.predecessors).trim() : null;
    }
    // Normalized predecessor link (strict sequencing)
    if (childSubtask.predecessorId !== undefined) {
      childSubtaskData.predecessorId = childSubtask.predecessorId || null;
    }
    // Keep workflowStatus aligned with predecessor lock state
    childSubtaskData.workflowStatus =
      childSubtaskData.status === TaskStatus.COMPLETED
        ? 'COMPLETED'
        : (childSubtaskData.predecessorId ? 'WAITING_FOR_PREDECESSOR' : 'NOT_STARTED');

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
    
    if (childTaskExists && childTaskId) {
      // Update existing child subtask - preserve ID and createdBy (never overwrite creator)
      const existingOne = existingChildSubtasks.find((c: any) => c.id === childTaskId);

      // Permission model: use central helper so assignees (e.g. Khalid) can only
      // change remarks / assignee notes / attachments on child tasks created
      // by someone else (e.g. Ajmal).
      let updateData: any = {};

      if (currentUserId && currentUserRole) {
        const perms = computeTaskPermissions({
          user: { id: currentUserId, role: currentUserRole as any },
          task: existingOne as any,
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
            createdBy: existingOne?.createdBy ?? childSubtaskData.createdBy,
          };
        } else if (perms.canEditAssigneeFields) {
          // Pure assignee – may only change status, remarks and assigneeNotes
          updateData = {
            status: childSubtaskData.status,
            workflowStatus: childSubtaskData.workflowStatus,
            remarks: childSubtaskData.remarks,
            assigneeNotes: childSubtaskData.assigneeNotes,
          };
        }
      } else {
        // Fallback (no current user context) – preserve previous behaviour
        updateData = {
          ...childSubtaskData,
          createdBy: existingOne?.createdBy ?? childSubtaskData.createdBy,
        };
      }

      console.log(`🔄 Updating existing child task ${childTaskId}: ${childSubtaskData.title}`);
      try {
        await prisma.task.update({
          where: { id: childTaskId },
          data: updateData,
        });
        await unlockDependentsWaitingOnFinishedPredecessor(prisma, childTaskId);
        childUpdatedCount++;
        console.log(`✅ Successfully updated child task ${childTaskId} with new assignment`);
      } catch (updateError: any) {
        console.error(`❌ Error updating child task ${childTaskId}:`, updateError);
        throw updateError;
      }
    } else {
      // Create new child subtask
      console.log(`➕ Creating new child task: ${childSubtaskData.title} (parent: ${parentTaskId}, project: ${projectId})`);
      try {
        const newChild = await prisma.task.create({
          data: childSubtaskData,
        });
        console.log(`✅ Created child task ${newChild.id}: ${newChild.title}`);
        childCreatedCount++;
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

    const where: any = {};

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
    const canViewOtherEmployee = req.user && ['ADMIN', 'HR', 'PROJECT_MANAGER'].includes(req.user.role);
    const effectiveEmployeeId =
      typeof employeeIdQuery === 'string' && employeeIdQuery.trim() &&
      (canViewOtherEmployee || req.user?.id === employeeIdQuery.trim())
        ? employeeIdQuery.trim()
        : null;

    if (effectiveEmployeeId) {
      // Task-based project list for this employee (same logic as EMPLOYEE branch)
      const employeeTasks = await prisma.task.findMany({
        where: taskRowInvolvesEmployee(effectiveEmployeeId),
        select: { projectId: true },
        distinct: ['projectId'],
      });
      const employeeProjectIds = employeeTasks
        .map((t: { projectId: string | null }) => t.projectId)
        .filter((pid): pid is string => !!pid);
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
    else if (req.user?.role === 'EMPLOYEE' || req.user?.role === 'MANAGER') {
      if (req.user?.role === 'MANAGER') {
        // Manager: Can see ONLY their own projects - from their contracts, or where they are directly assigned
        // Does NOT include team member projects (each manager sees only their projects)
        
        // Fetch manager's full details to get their name for projectManager field matching
        let managerNameVariations: string[] = [];
        try {
          const managerUser = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { firstName: true, lastName: true },
          });
          
          if (managerUser) {
            const managerFirstName = managerUser.firstName?.trim().toLowerCase() || '';
            const managerLastName = managerUser.lastName?.trim().toLowerCase() || '';
            const managerFullName = `${managerFirstName} ${managerLastName}`.trim();
            
            // Build name variations for matching (e.g., "obada", "obada saad", "h. obada", etc.)
            if (managerFirstName) managerNameVariations.push(managerFirstName);
            if (managerLastName) managerNameVariations.push(managerLastName);
            if (managerFullName) managerNameVariations.push(managerFullName);
            // Add variations with first name + last name initial
            if (managerFirstName && managerLastName) {
              managerNameVariations.push(`${managerFirstName} ${managerLastName.charAt(0)}`);
            }
            // Also add just last name if it's meaningful (more than 1 char)
            if (managerLastName && managerLastName.length > 1) {
              managerNameVariations.push(managerLastName);
            }
          }
        } catch (error) {
          console.error('Error fetching manager details for project filtering:', error);
        }
        
        const orConditions: any[] = [
          // Projects where manager is directly assigned
          { assignedEmployees: { some: { employeeId: req.user.id } } },
          { tasks: { some: { assignedEmployeeId: req.user.id } } },
          { tasks: { some: { subtasks: { some: { assignedEmployeeId: req.user.id } } } } },
          { tasks: { some: { subtasks: { some: { subtasks: { some: { assignedEmployeeId: req.user.id } } } } } } },
          // Projects created by this manager
          { createdBy: req.user.id },
        ];
        
        // Projects from contracts assigned to this manager (primary - load-out projects)
        if (req.user.email) {
          orConditions.push({ contracts: { some: { assignedManagerEmail: req.user.email } } });
        }
        if (req.user.id) {
          orConditions.push({ contracts: { some: { assignedManagerId: req.user.id } } });
        }
        
        // IMPORTANT: Also filter by projectManager text field matching manager's name
        // This ensures managers only see projects where they are listed as the project manager
        if (managerNameVariations.length > 0) {
          const projectManagerConditions = managerNameVariations.map(name => ({
            projectManager: { contains: name, mode: 'insensitive' as const }
          }));
          orConditions.push({ OR: projectManagerConditions });
        }
        
        // Combine manager filter with search filter if present
        if (searchFilter) {
          where.AND = [
            { OR: orConditions },
            searchFilter,
          ];
        } else {
          where.OR = orConditions;
        }
      } else {
        // EMPLOYEE:
        // Instead of a very deep OR tree, derive the list of project IDs
        // from tasks that are actually assigned to (or created by) this user.
        const employeeTasks = await prisma.task.findMany({
          where: taskRowInvolvesEmployee(req.user.id),
          select: {
            projectId: true,
          },
          distinct: ['projectId'],
        });

        const employeeProjectIds = employeeTasks
          .map((t: { projectId: string | null }) => t.projectId)
          .filter((pid): pid is string => !!pid);

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

    // For task visibility inside projects: use effectiveEmployeeId when viewing as that employee, else EMPLOYEE's own id.
    const taskViewerId = effectiveEmployeeId ?? (req.user?.role === 'EMPLOYEE' ? req.user.id : null);

    // EMPLOYEE (or ?employeeId= view): Pre-fetch main task IDs that the user "owns" (assigned to / created by / in assignments).
    // Child tasks under these parents must always be visible to the parent owner (Step 2 - relationship-based visibility).
    let ownedMainTaskIds: string[] = [];
    if (taskViewerId) {
      const ownedTasks = await prisma.task.findMany({
        where: {
          parentTaskId: null,
          OR: [
            { assignedEmployeeId: taskViewerId },
            { createdBy: taskViewerId },
            { assignments: { some: { employeeId: taskViewerId } } },
          ],
        },
        select: { id: true },
      });
      ownedMainTaskIds = ownedTasks.map((t: { id: string }) => t.id);
      if (ownedMainTaskIds.length > 0) {
        console.log('[getAllProjects] Task viewer owned main task IDs (parent-owner visibility):', ownedMainTaskIds.length);
      }
    }

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
              plotNumber: true,
              community: true,
              numberOfFloors: true,
              makaniNumber: true,
              developerName: true,
              assignedManager: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
          tasks: {
            where: {
              parentTaskId: null, // Only parent-level tasks (main tasks)
              // When taskViewerId is set (EMPLOYEE or ?employeeId=): only main tasks visible to that employee
              ...(taskViewerId
                ? { OR: mainTaskVisibleToEmployeeInProject(taskViewerId) }
                : {}),
            },
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              priority: true,
              startDate: true,
              dueDate: true,
              category: true,
              referenceNumber: true,
              planDays: true,
              remarks: true,
              assigneeNotes: true,
              assignedEmployeeId: true,
              createdBy: true,
              predecessors: true,
              assignedEmployee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
              location: true,
              makaniNumber: true,
              plotNumber: true,
              community: true,
              projectType: true,
              projectFloor: true,
              developerProject: true,
              subtasks: {
                // We no longer filter subtasks by employee here; employees can see
                // all subtasks for a project, but update/delete is still enforced
                // in the task controllers.
                where: {},
                select: {
                  id: true,
                  title: true,
                  description: true,
                  status: true,
                  priority: true,
                  startDate: true,
                  dueDate: true,
                  category: true,
                  referenceNumber: true,
                  planDays: true,
                  remarks: true,
                  assigneeNotes: true,
                  assignedEmployeeId: true,
                  parentTaskId: true,
                  createdAt: true,
                  createdBy: true,
                  predecessors: true,
                  assignedEmployee: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true,
                    },
                  },
                  location: true,
                  makaniNumber: true,
                  plotNumber: true,
                  community: true,
                  projectType: true,
                  projectFloor: true,
                  developerProject: true,
                  subtasks: {
                    // Show all child tasks under subtasks the employee can see (so reassigned children don't "disappear" for the parent subtask owner)
                    // Previously we only showed children assigned to current user or unassigned, which hid children after reassignment (e.g. Ajmal no longer saw task after assign to Khalid)
                    where: {},
                    select: {
                      id: true,
                      title: true,
                      description: true,
                      status: true,
                      priority: true,
                      startDate: true,
                      dueDate: true,
                      category: true,
                      referenceNumber: true,
                      planDays: true,
                      remarks: true,
                      assigneeNotes: true,
                      assignedEmployeeId: true,
                      parentTaskId: true,
                      createdAt: true,
                      createdBy: true,
                      predecessors: true,
                      assignedEmployee: {
                        select: {
                          id: true,
                          firstName: true,
                          lastName: true,
                          email: true,
                        },
                      },
                      location: true,
                      makaniNumber: true,
                      plotNumber: true,
                      community: true,
                      projectType: true,
                      projectFloor: true,
                      developerProject: true,
                    },
                    orderBy: {
                      createdAt: 'asc',
                    },
                  },
                },
                orderBy: {
                  createdAt: 'asc',
                },
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

    // Log task/subtask counts for debugging
    projects.forEach((p: any) => {
      const taskCount = p.tasks?.length || 0;
      const subtaskCounts = p.tasks?.map((t: any) => ({
        taskId: t.id,
        taskTitle: t.title,
        subtaskCount: t.subtasks?.length || 0,
        childCounts: t.subtasks?.map((st: any) => ({
          subtaskId: st.id,
          subtaskTitle: st.title,
          childCount: st.subtasks?.length || 0,
        })) || [],
      })) || [];
      console.log(`📋 Project ${p.id} (${p.referenceNumber}): ${taskCount} tasks, subtask breakdown:`, JSON.stringify(subtaskCounts, null, 2));
    });

    // Use assigned manager name from linked contract for display when available (so PM shows e.g. muffazzal not mohammednazar)
    // Include projectName so main table and details show saved name (e.g. "villa") after refresh, not only reference number
    const projectsWithDisplayManager = projects.map((p: any) => {
      const firstContractWithManager = p.contracts?.find((c: any) => c.assignedManager);
      const displayManager = firstContractWithManager?.assignedManager
        ? `${firstContractWithManager.assignedManager.firstName} ${firstContractWithManager.assignedManager.lastName}`.trim()
        : null;
      const displayName = (p.name != null && String(p.name).trim() !== '') ? p.name : p.referenceNumber;
      return {
        ...p,
        projectManager: displayManager ?? p.projectManager,
        projectName: displayName,
      };
    });

    res.json({
      success: true,
      data: projectsWithDisplayManager,
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
            assignedEmployee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
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
                  },
                  orderBy: {
                    createdAt: 'asc',
                  },
                },
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
            _count: {
              select: {
                checklists: true,
                attachments: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
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
            developerName: true,
            plotNumber: true,
            community: true,
            numberOfFloors: true,
            makaniNumber: true,
            assignedManagerId: true as any,
            assignedManagerEmail: true as any,
            assignedManager: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
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

    // Employee/Manager: Check access (managers see ONLY their own projects, not team member projects)
    if (req.user?.role === 'EMPLOYEE' || req.user?.role === 'MANAGER') {
      const projectWithRelations = project as any;
      if (req.user?.role === 'MANAGER') {
        // Manager: Can see ONLY their own projects - from their contracts, or where they are directly assigned
        const isAssigned = projectWithRelations.assignedEmployees?.some((a: { employeeId: string }) => 
          a.employeeId === req.user!.id
        );
        
        const hasTasks = projectWithRelations.tasks?.some((task: any) => 
          task.assignedEmployeeId === req.user!.id ||
          task.subtasks?.some((st: any) => st.assignedEmployeeId === req.user!.id) ||
          task.subtasks?.some((st: any) => st.subtasks?.some((cst: any) => cst.assignedEmployeeId === req.user!.id))
        );
        
        const hasAssignedContract = projectWithRelations.contracts?.some((contract: any) => {
          return (req.user?.email && contract.assignedManagerEmail === req.user.email) ||
                 (req.user?.id && contract.assignedManagerId === req.user.id);
        });
        
        const wasCreatedBy = projectWithRelations.createdBy === req.user!.id;
        
        // Check if projectManager field matches manager's name
        let projectManagerMatches = false;
        try {
          const managerUser = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { firstName: true, lastName: true },
          });
          
          if (managerUser && projectWithRelations.projectManager) {
            const managerFirstName = managerUser.firstName?.trim().toLowerCase() || '';
            const managerLastName = managerUser.lastName?.trim().toLowerCase() || '';
            const managerFullName = `${managerFirstName} ${managerLastName}`.trim();
            const projectManagerLower = String(projectWithRelations.projectManager).toLowerCase();
            
            // Check if projectManager field contains manager's name variations
            projectManagerMatches = 
              (managerFirstName.length > 0 && projectManagerLower.includes(managerFirstName)) ||
              (managerLastName.length > 0 && projectManagerLower.includes(managerLastName)) ||
              (managerFullName.length > 0 && projectManagerLower.includes(managerFullName));
          }
        } catch (error) {
          console.error('Error checking projectManager match:', error);
        }
        
        if (!isAssigned && !hasTasks && !hasAssignedContract && !wasCreatedBy && !projectManagerMatches) {
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
            AND: [{ projectId: id }, taskRowInvolvesEmployee(req.user!.id)],
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
    };

    res.json({
      success: true,
      data: projectWithDisplayManager,
    });
  } catch (error) {
    console.error('Get project by ID error:', error);
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
          // Build location string from coordinates or makani number
          if (!finalLocation) {
            if (contract.makaniNumber) {
              finalLocation = contract.makaniNumber;
            } else if (contract.latitude && contract.longitude) {
              finalLocation = `${contract.latitude}, ${contract.longitude}`;
            }
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
    const projectStatus = status ? (status as ProjectStatus) : ProjectStatus.OPEN;
    
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
    }, { isolationLevel: 'Serializable' as any });

    // Link contract to project if contract reference was provided
    if (contractId && contractData) {
      try {
        await prisma.contract.update({
          where: { id: contractId },
          data: { projectId: project.id },
        });
        console.log(`✅ Contract ${contractReferenceNumber} linked to project ${project.id}`);
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
        contracts: {
          select: {
            id: true,
            referenceNumber: true,
            title: true,
            status: true,
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
  console.log('🚀 updateProject called');
  console.log('👤 User:', req.user?.email, 'Role:', req.user?.role);
  const body = req.body as Record<string, unknown>;
  console.log('📥 updateProject body keys:', body ? Object.keys(body) : []);
  if (body && (body as any).projectNumber !== undefined) {
    console.warn('⚠️ Ignoring attempt to update projectNumber (immutable).');
  }
  if (body && (body.name !== undefined || body.projectName !== undefined || body.title !== undefined)) {
    console.log('📥 updateProject name-related:', { name: body.name, projectName: body.projectName, title: body.title });
  }

  try {
    const { id } = req.params;
    console.log(`📋 Updating project ${id}`);
    
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

    // When frontend sends only "add child" (parentSubtaskId + childSubtaskName) without full subtasks array,
    // load existing task tree from DB, merge the new child, and set subtasksToSave so the save block runs
    if (parentSubtaskId && childSubtaskName && (!subtasksToSave || subtasksToSave.length === 0)) {
      const projectWithTasks = await prisma.project.findUnique({
        where: { id },
        include: {
          tasks: {
            where: { parentTaskId: null },
            include: {
              subtasks: {
                orderBy: { createdAt: 'asc' as const },
                include: {
                  subtasks: { orderBy: { createdAt: 'asc' as const } },
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
            );
            console.log(`📥 Add-child-only: saved new child "${nameStr}" under parent ${parentSubtaskId}`);
          }
        } else {
          console.warn(`⚠️ Add-child-only: parentSubtaskId ${parentSubtaskId} not found in project task tree`);
        }
      }
    }

    // Employee/Manager role: Can update if assigned to project OR assigned to any task/subtask in the project
    // Managers use the SAME module as employees - same update permissions
    if (req.user?.role === 'EMPLOYEE' || req.user?.role === 'MANAGER') {
      if (req.user?.role === 'MANAGER') {
        // Manager: Can update ONLY their own projects - from contracts, created by them, or where they're directly assigned
        const existingProjectWithRelations = existingProject as any;
        const isAssignedToProject = existingProjectWithRelations.assignedEmployees?.some(
          (a: { employeeId: string }) => a.employeeId === req.user!.id
        );
        const isCreator = existingProject.createdBy === req.user!.id;
        
        let hasAssignedContract = false;
        if (existingProjectWithRelations.contracts && Array.isArray(existingProjectWithRelations.contracts) && existingProjectWithRelations.contracts.length > 0) {
          const managerUser = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: { email: true },
          });
          hasAssignedContract = existingProjectWithRelations.contracts.some((c: any) => 
            (managerUser?.email && c.assignedManagerEmail === managerUser.email) ||
            c.assignedManagerId === req.user!.id
          );
        }
        
        if (!isAssignedToProject && !isCreator && !hasAssignedContract) {
          const hasTaskAssignment = await prisma.task.findFirst({
            where: {
              projectId: id,
              OR: [
                { assignments: { some: { employeeId: req.user!.id } } },
                { assignedEmployeeId: req.user!.id },
              ],
            },
            select: { id: true },
          });
          
          if (!hasTaskAssignment) {
            res.status(403).json({
              success: false,
              message: 'Access Denied: You can only edit projects assigned to you.',
              code: 'ACCESS_DENIED',
            });
            return;
          }
        }
      } else {
        // Employee: No project/task assignment check - allow save (e.g. child tasks) without restriction
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

    // Validate and trim projectManager (max 100 characters)
    const projectManagerText = projectManager !== undefined
      ? (projectManager ? String(projectManager).trim().substring(0, 100) : null)
      : undefined;

    // Update project (name is editable in modal; save whenever name or projectName is sent so it reflects in backend)
    const nameToWrite = shouldUpdateName && projectNameToSave.length > 0 ? projectNameToSave : undefined;
    if (nameToWrite) {
      console.log(`📝 Persisting project name to DB: "${nameToWrite}"`);
    }
    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(nameToWrite ? { name: nameToWrite } : {}),
        ...(referenceNumber && { referenceNumber }),
        ...(pin !== undefined && { pin: pin || null }),
        ...(clientId !== undefined && { clientId: clientId || null }),
        ...(owner !== undefined && { owner: owner || null }),
        ...(description !== undefined && { description: description || null }),
        ...(status && { status }),
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

    // Save/update subtasks and child subtasks if provided (use subtasksToSave so add-child-only path runs save too)
    // Employees can save child tasks to tasks assigned to them
    if (subtasksToSave && Array.isArray(subtasksToSave)) {
      try {
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
          },
        });

        const existingSubtaskIds = new Set(existingSubtasks.map(st => st.id));
        const incomingSubtaskIds = new Set(subtasksToSave.filter((st: any) => st.id).map((st: any) => st.id));

        // Delete subtasks that are no longer in the incoming list
        const subtasksToDelete = existingSubtasks.filter(st => !incomingSubtaskIds.has(st.id));
        if (subtasksToDelete.length > 0) {
          console.log(`🗑️ Deleting ${subtasksToDelete.length} removed subtasks`);
          await prisma.task.deleteMany({
            where: {
              id: { in: subtasksToDelete.map(st => st.id) },
            },
          });
        }

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
        let createdCount = 0;
        let updatedCount = 0;
        for (const subtask of subtasks) {
          const subtaskData: any = {
            title: subtask.name || subtask.title || '',
            projectId: id,
            parentTaskId: null,
            status: mapStatusToTaskStatus(subtask.status),
            priority: mapPriorityToTaskPriority(subtask.priority),
            category: subtask.category || null,
            referenceNumber: subtask.referenceNumber || null,
            planDays: subtask.planDays ? parseInt(String(subtask.planDays), 10) : null,
            remarks: subtask.remarks || null,
            assigneeNotes: subtask.assigneeNotes || null,
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
            taskOrder: subtask.taskOrder != null ? parseInt(String(subtask.taskOrder), 10) : null,
          };

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
          const isExistingSubtask = subtask.id && existingSubtaskIds.has(subtask.id);
          if (assigneeInPayload && payloadAssignee) {
            const resolvedAssigneeId = await resolveAssigneeUserId(payloadAssignee);
            subtaskData.assignedEmployeeId = resolvedAssigneeId;
          } else if (assigneeInPayload && payloadAssignee === null && !isExistingSubtask) {
            subtaskData.assignedEmployeeId = null;
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
          if (subtask.predecessorId !== undefined) {
            subtaskData.predecessorId = subtask.predecessorId || null;
          }
          // Keep workflowStatus aligned with predecessor lock state
          subtaskData.workflowStatus =
            subtaskData.status === TaskStatus.COMPLETED
              ? 'COMPLETED'
              : (subtaskData.predecessorId ? 'WAITING_FOR_PREDECESSOR' : 'NOT_STARTED');

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
              });

              if (!perms.canEditAssigneeFields && !perms.canEditMainFields) {
                console.log(
                  `⛔ Skipping update of subtask ${subtask.id} by unauthorised user ${req.user.id}`,
                );
                continue;
              }

              if (perms.canEditMainFields) {
                updateData = subtaskData;
              } else if (perms.canEditAssigneeFields) {
                // Assignee can change status + remarks/notes only
                updateData = {
                  status: subtaskData.status,
                  workflowStatus: subtaskData.workflowStatus,
                  remarks: subtaskData.remarks,
                  assigneeNotes: subtaskData.assigneeNotes,
                };
              }
            } else {
              // Fallback: preserve previous behaviour if no user context
              updateData = subtaskData;
            }

            console.log(`🔄 Updating subtask ${subtask.id}: ${subtaskData.title}`);
            await prisma.task.update({
              where: { id: subtask.id },
              data: updateData,
            });
            await unlockDependentsWaitingOnFinishedPredecessor(prisma, subtask.id);
            updatedCount++;
          } else {
            // Create new subtask
            console.log(`➕ Creating new subtask: ${subtaskData.title}`);
            const newSubtask = await prisma.task.create({
              data: subtaskData,
            });
            console.log(`✅ Created subtask ${newSubtask.id}: ${newSubtask.title}`);
            createdCount++;

            // Save child subtasks for this subtask
            if (subtask.childSubtasks && Array.isArray(subtask.childSubtasks) && subtask.childSubtasks.length > 0) {
              await saveChildSubtasks(
                newSubtask.id,
                id,
                subtask.childSubtasks,
                req.user?.id,
                projectDefaults,
                req.user?.id ?? null,
                req.user?.role ?? null,
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
        for (const subtask of subtasks) {
          if (subtask.childSubtasks && Array.isArray(subtask.childSubtasks) && subtask.childSubtasks.length > 0) {
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
                console.log(`💾 Calling saveChildSubtasks for parent ${subtaskId} with ${subtask.childSubtasks.length} children`);
                await saveChildSubtasks(
                  subtaskId,
                  id,
                  subtask.childSubtasks,
                  req.user?.id,
                  projectDefaults,
                  req.user?.id ?? null,
                  req.user?.role ?? null,
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

        console.log(`✅ Saved ${subtasks.length} subtasks for project ${id} (${createdCount} created, ${updatedCount} updated)`);
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

    // Refetch project with nested subtasks so response includes newly created child tasks
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
            assignedEmployee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
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
                  },
                  orderBy: {
                    createdAt: 'asc',
                  },
                },
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
            _count: {
              select: {
                checklists: true,
                attachments: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
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
      ? { ...data, projectName: data.name != null && data.name !== '' ? data.name : data.referenceNumber }
      : data;
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

// Delete project
export const deleteProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

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

    // Employee role: Cannot delete projects
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to delete projects. Please contact your manager.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    // Manager role: Can delete projects they created, are assigned to, or from their contracts
    if (req.user?.role === 'MANAGER') {
      const projectWithRelations = project as any;
      const isCreator = project.createdBy === req.user.id;
      const isAssigned = projectWithRelations.assignedEmployees?.some(
        (a: { employeeId: string }) => a.employeeId === req.user!.id
      );
      
      // Check if project was created from a contract assigned to this manager
      const hasAssignedContract = projectWithRelations.contracts?.some((contract: any) => {
        return (req.user?.email && contract.assignedManagerEmail === req.user.email) ||
               (req.user?.id && contract.assignedManagerId === req.user.id);
      });

      if (!isCreator && !isAssigned && !hasAssignedContract) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: You can only delete projects you created, are assigned to, or that were created from your contracts.',
          code: 'ACCESS_DENIED',
        });
        return;
      }
    }

    console.log(`📋 Deleting project: ${project.name} (${(project as any).referenceNumber})`);

    // Delete all related records first (cascade delete)
    // Use a transaction to ensure all deletions succeed or none do
    await prisma.$transaction(async (tx) => {
      console.log(`🔄 Starting transaction for project ${id} deletion`);

      // Get all tender IDs for this project first
      const tenders = await tx.tender.findMany({
        where: { projectId: id },
        select: { id: true },
      });
      const tenderIds = tenders.map(t => t.id);
      console.log(`📦 Found ${tenderIds.length} tenders to delete`);

      // Delete tender invitations for all tenders in this project
      if (tenderIds.length > 0) {
        const deletedInvitations = await tx.tenderInvitation.deleteMany({
          where: { tenderId: { in: tenderIds } },
        });
        console.log(`✅ Deleted ${deletedInvitations.count} tender invitations`);

        // Delete technical submissions for all tenders
        const deletedSubmissions = await tx.technicalSubmission.deleteMany({
          where: { tenderId: { in: tenderIds } },
        });
        console.log(`✅ Deleted ${deletedSubmissions.count} technical submissions`);
      }

      // Delete project assignments
      const deletedAssignments = await tx.projectAssignment.deleteMany({
        where: { projectId: id },
      });
      console.log(`✅ Deleted ${deletedAssignments.count} project assignments`);

      // Delete tasks
      const deletedTasks = await tx.task.deleteMany({
        where: { projectId: id },
      });
      console.log(`✅ Deleted ${deletedTasks.count} tasks`);

      // Delete documents
      const deletedDocuments = await tx.document.deleteMany({
        where: { projectId: id },
      });
      console.log(`✅ Deleted ${deletedDocuments.count} documents`);

      // Delete tenders (after deleting their related records)
      const deletedTenders = await tx.tender.deleteMany({
        where: { projectId: id },
      });
      console.log(`✅ Deleted ${deletedTenders.count} tenders`);

      // Delete checklists
      const deletedChecklists = await tx.projectChecklist.deleteMany({
        where: { projectId: id },
      });
      console.log(`✅ Deleted ${deletedChecklists.count} checklists`);

      // Delete attachments
      const deletedAttachments = await tx.projectAttachment.deleteMany({
        where: { projectId: id },
      });
      console.log(`✅ Deleted ${deletedAttachments.count} attachments`);

      // Finally, delete the project itself
      await tx.project.delete({
        where: { id },
      });
      console.log(`✅ Project ${id} deleted`);
    });

    // Verify the project is actually deleted
    const verifyProject = await prisma.project.findUnique({
      where: { id },
    });

    if (verifyProject) {
      console.error(`❌ CRITICAL: Project ${id} still exists after deletion!`);
      res.status(500).json({
        success: false,
        message: 'Project deletion failed - project still exists in database',
      });
      return;
    }

    console.log(`✅ Project ${id} deleted successfully and verified`);

    res.json({
      success: true,
      message: 'Project deleted successfully',
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

    // Manager role: Can delete projects (will be validated per project in the loop below)
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

    // Delete all related records and projects in a transaction
    const deletedCount = await prisma.$transaction(async (tx) => {
      let totalDeleted = 0;

      for (const projectId of ids) {
        // Get all tender IDs for this project
        const tenders = await tx.tender.findMany({
          where: { projectId },
          select: { id: true },
        });
        const tenderIds = tenders.map(t => t.id);

        // Delete tender invitations
        if (tenderIds.length > 0) {
          await tx.tenderInvitation.deleteMany({
            where: { tenderId: { in: tenderIds } },
          });

          // Delete technical submissions
          await tx.technicalSubmission.deleteMany({
            where: { tenderId: { in: tenderIds } },
          });
        }

        // Delete project assignments
        await tx.projectAssignment.deleteMany({
          where: { projectId },
        });

        // Delete tasks
        await tx.task.deleteMany({
          where: { projectId },
        });

        // Delete documents
        await tx.document.deleteMany({
          where: { projectId },
        });

        // Delete tenders
        await tx.tender.deleteMany({
          where: { projectId },
        });

        // Delete checklists
        await tx.projectChecklist.deleteMany({
          where: { projectId },
        });

        // Delete attachments
        await tx.projectAttachment.deleteMany({
          where: { projectId },
        });

        // Delete the project
        await tx.project.delete({
          where: { id: projectId },
        });

        totalDeleted++;
      }

      return totalDeleted;
    });

    console.log(`✅ ${deletedCount} projects deleted successfully`);

    res.json({
      success: true,
      message: `${deletedCount} project(s) deleted successfully`,
      deletedCount,
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
    });

    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    // Remove existing assignments
    await prisma.projectAssignment.deleteMany({
      where: { projectId: id },
    });

    // Create new assignments
    const assignments = await Promise.all(
      employeeIds.map((employeeId: string) =>
        prisma.projectAssignment.create({
          data: {
            projectId: id,
            employeeId,
            assignedBy: req.user?.id || null,
            role: role || null,
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



