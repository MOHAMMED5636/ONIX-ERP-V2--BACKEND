import { Request, Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

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
      ['ADMIN', 'HR', 'PROJECT_MANAGER'].includes(req.user.role);
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

    res.json({
      success: true,
      data: tasks,
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

    // Employee/Manager role: Can only view tasks assigned to them (root assignment, child-task assignment, or original assignee after delegation)
    if (req.user?.role === 'EMPLOYEE' || req.user?.role === 'MANAGER') {
      const isAssignedViaRoot = taskWithIncludes.assignments?.some(
        (a) => a.employeeId === req.user!.id
      );
      const isAssignedViaChild = taskCheck.assignedEmployeeId === req.user!.id;
      const isOriginalAssigneeDelegated = taskWithIncludes.delegations?.some(
        (d) => d.originalAssigneeId === req.user!.id
      );
      
      // Also check if this is a subtask assigned to the user (need to check parent task's subtasks)
      let isAssignedViaSubtask = false;
      if (taskCheck.parentTaskId) {
        // This is a subtask, check if it's assigned to the user
        isAssignedViaSubtask = taskCheck.assignedEmployeeId === req.user!.id;
      } else {
        // This is a main task, check if any of its subtasks are assigned to the user
        // This will be checked via the include relations below
      }
      
      if (!isAssignedViaRoot && !isAssignedViaChild && !isOriginalAssigneeDelegated && !isAssignedViaSubtask) {
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

    res.json({ success: true, data: task });
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
      predecessors,
      predecessorId,
      // Nested subtasks and child tasks
      subtasks, // Array of subtasks with nested childSubtasks
    } = req.body;

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
      const hasPredecessor = !!subtask.predecessorId;
      const subStatus =
        subtask.status === 'not started' ? 'PENDING' :
        subtask.status === 'working' ? 'IN_PROGRESS' :
        subtask.status === 'done' ? 'COMPLETED' : 'PENDING';
      
      // All managers can assign subtasks to any employee - no team member restriction
      
      return {
        title: subtask.title || subtask.name || '',
        description: subtask.description || null,
        projectId,
        status: subStatus,
        workflowStatus: hasPredecessor ? 'WAITING_FOR_PREDECESSOR' : 'NOT_STARTED',
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
      workflowStatus: predecessorId ? 'WAITING_FOR_PREDECESSOR' : 'NOT_STARTED',
      predecessors: (predecessors != null && String(predecessors).trim() !== '') ? String(predecessors).trim() : null,
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
      predecessors,
      predecessorId,
    } = req.body;

    // Check if task exists
    const existingTask: any = await prisma.task.findUnique({
      where: { id },
      include: {
        assignments: {
          select: {
            employeeId: true,
          },
        },
      },
    });

    if (!existingTask) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    // Employee role: Can only update tasks assigned to them (root or child assignment), and only certain fields
    if (req.user?.role === 'EMPLOYEE') {
      const isAssignedViaRoot = existingTask.assignments?.some(
        (a: { employeeId: string }) => a.employeeId === req.user!.id
      );
      const isAssignedViaChild = existingTask.assignedEmployeeId === req.user!.id;
      if (!isAssignedViaRoot && !isAssignedViaChild) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: You do not have permission to update this task. You can only update tasks assigned to you.',
          code: 'ACCESS_DENIED',
        });
        return;
      }
      // Employees can only update: status, actualHours, and comments (not title, description, priority, dates, etc.)
      // Restrict certain fields for employees
      if (title !== undefined || description !== undefined || priority !== undefined || 
          startDate !== undefined || dueDate !== undefined || estimatedHours !== undefined ||
          predecessors !== undefined || predecessorId !== undefined) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: You can only update task status and actual hours. Please contact your project manager to modify other fields.',
          code: 'ACCESS_DENIED',
        });
        return;
      }
    }

    // Prevent self-dependency
    if (predecessorId && predecessorId === id) {
      res.status(400).json({
        success: false,
        message: 'A task cannot have itself as a predecessor.',
      });
      return;
    }

    // Prevent simple circular dependency (A -> B and B -> A)
    if (predecessorId) {
      const predecessorTask: any = await (prisma as any).task.findUnique({
        where: { id: predecessorId },
      });
      if (predecessorTask && predecessorTask.predecessorId === id) {
        res.status(400).json({
          success: false,
          message: 'Circular dependency detected between these two tasks.',
        });
        return;
      }
    }

    // Prevent starting locked tasks
    if (status === 'IN_PROGRESS' && (existingTask as any).workflowStatus === 'WAITING_FOR_PREDECESSOR') {
      res.status(400).json({
        success: false,
        message: 'This task is locked until predecessor is completed.',
      });
      return;
    }

    const updateData: any = {
      ...(title && { title }),
      ...(description !== undefined && { description: description || null }),
      ...(status && { status }),
      ...(priority && { priority }),
      ...(startDate && { startDate: new Date(startDate) }),
      ...(dueDate && { dueDate: new Date(dueDate) }),
      ...(estimatedHours !== undefined && { estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null }),
      ...(actualHours !== undefined && { actualHours: actualHours ? parseFloat(actualHours) : null }),
      ...(tags && { tags }),
      ...(predecessors !== undefined && {
        predecessors: (predecessors != null && String(predecessors).trim() !== '') ? String(predecessors).trim() : null,
      }),
      ...(predecessorId !== undefined && { predecessorId: predecessorId || null }),
      ...(assignedEmployeeId !== undefined && req.user?.role !== 'EMPLOYEE' && { assignedEmployeeId: assignedEmployeeId || null }),
    };

    // Maintain workflowStatus alongside status / predecessor changes
    if (status) {
      if (status === 'COMPLETED') {
        (updateData as any).workflowStatus = 'COMPLETED';
      } else if (status === 'IN_PROGRESS') {
        (updateData as any).workflowStatus = 'IN_PROGRESS';
      } else if (status === 'PENDING') {
      const hasPred = predecessorId !== undefined
          ? !!predecessorId
          : !!(existingTask as any).predecessorId;
        (updateData as any).workflowStatus = hasPred ? 'WAITING_FOR_PREDECESSOR' : 'NOT_STARTED';
      }
    } else if (predecessorId !== undefined && status === undefined) {
      // Only predecessor changed
      const hasPred = !!predecessorId;
      if ((existingTask as any).status !== 'COMPLETED') {
        (updateData as any).workflowStatus = hasPred ? 'WAITING_FOR_PREDECESSOR' : 'NOT_STARTED';
      }
    }

    // If status is being changed to COMPLETED, set completedAt
    if (status === 'COMPLETED' && existingTask.status !== 'COMPLETED') {
      updateData.completedAt = new Date();
    } else if (status !== 'COMPLETED' && existingTask.status === 'COMPLETED') {
      updateData.completedAt = null;
    }

    // Update task (and unlock dependents when completing) in a transaction
    const task = await prisma.$transaction(async (tx) => {
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

      // When a task is newly completed, unlock its direct dependents
      if (status === 'COMPLETED' && existingTask.status !== 'COMPLETED') {
        await (tx as any).task.updateMany({
          where: {
            predecessorId: id,
            workflowStatus: 'WAITING_FOR_PREDECESSOR',
          } as any,
          data: {
            workflowStatus: 'NOT_STARTED',
          } as any,
        });
      }

      return updated;
    });

    res.json({
      success: true,
      message: 'Task updated successfully',
      data: task,
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Delete task
export const deleteTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // PROJECT_MANAGER, ADMIN, HR: can delete all tasks (main + child).
    // MANAGER: can delete child tasks/subtasks only.
    // EMPLOYEE: can delete only their own child tasks/subtasks (assigned to them).
    const allowedRolesForAllTasks = ['PROJECT_MANAGER', 'ADMIN', 'HR'];
    const allowedRolesForChildTasks = ['PROJECT_MANAGER', 'ADMIN', 'HR', 'MANAGER'];
    
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
    console.log(`🔍 Request path: ${req.path}, method: ${req.method}`);
    console.log(`🔍 Request URL: ${req.url}`);

    // Fetch task to check if it exists and get its type (main task or child task)
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        subtasks: {
          select: { id: true, title: true },
        },
        parentTask: {
          select: { id: true, title: true },
        },
      },
    });

    if (!task) {
      console.error(`❌ Task not found: ${id}`);
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    // Check if this is a child task (has parentTaskId)
    const isChildTask = !!task.parentTaskId;
    
    console.log(`📋 Task details:`, {
      id: task.id,
      title: task.title,
      isChildTask,
      parentTaskId: task.parentTaskId,
      parentTaskTitle: task.parentTask?.title || 'N/A',
      hasSubtasks: task.subtasks?.length > 0,
      subtaskCount: task.subtasks?.length || 0,
    });
    
    console.log(`🔐 Permission check - User role: ${req.user?.role}`);
    console.log(`🔐 Allowed roles for child tasks:`, allowedRolesForChildTasks);
    console.log(`🔐 Allowed roles for main tasks:`, allowedRolesForAllTasks);
    console.log(`🔐 Is child task: ${isChildTask}`);
    console.log(`🔐 User can delete child tasks: ${allowedRolesForChildTasks.includes(req.user?.role || '')}`);
    console.log(`🔐 User can delete main tasks: ${allowedRolesForAllTasks.includes(req.user?.role || '')}`);
    
    // Check permissions based on task type
    if (isChildTask) {
      // Child task/subtask: MANAGER, PROJECT_MANAGER, ADMIN, HR can delete any. EMPLOYEE only if assigned to them.
      if (req.user.role === 'EMPLOYEE') {
        if (task.assignedEmployeeId !== req.user.id) {
          console.error(`❌ Permission denied: Employee can only delete child tasks assigned to them`);
          res.status(403).json({
            success: false,
            message: 'Access Denied: You can only delete child tasks and subtasks that are assigned to you.',
            code: 'ACCESS_DENIED',
          });
          return;
        }
        console.log(`✅ Permission granted: Employee deleting their own child task`);
      } else if (!allowedRolesForChildTasks.includes(req.user.role)) {
        console.error(`❌ Permission denied: User ${req.user?.role} cannot delete child tasks`);
        res.status(403).json({
          success: false,
          message: 'Access Denied: You do not have permission to delete child tasks.',
          code: 'ACCESS_DENIED',
        });
        return;
      } else {
        console.log(`✅ Permission granted: User ${req.user?.role} can delete child tasks`);
      }
    } else {
      // Main task: Only PROJECT_MANAGER, ADMIN, HR can delete
      if (!allowedRolesForAllTasks.includes(req.user.role)) {
        console.error(`❌ Permission denied: User ${req.user?.role} cannot delete main tasks`);
        res.status(403).json({
          success: false,
          message: 'Access Denied: You do not have permission to delete main tasks. Only project managers, admins, and HR can delete main tasks.',
          code: 'ACCESS_DENIED',
        });
        return;
      }
      console.log(`✅ Permission granted: User ${req.user?.role} can delete main tasks`);
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
    // PROJECT_MANAGER, ADMIN, and HR can delete all tasks (main tasks and child tasks)
    // MANAGER can delete child tasks (subtasks) but not main tasks
    // EMPLOYEE cannot delete any tasks
    const allowedRolesForAllTasks = ['PROJECT_MANAGER', 'ADMIN', 'HR'];
    const allowedRolesForChildTasks = ['PROJECT_MANAGER', 'ADMIN', 'HR', 'MANAGER'];
    
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

    // Fetch all tasks to check their types and permissions
    const tasks = await prisma.task.findMany({
      where: { id: { in: allTaskIds } },
      include: {
        subtasks: {
          select: { id: true, title: true },
        },
        parentTask: {
          select: { id: true, title: true },
        },
      },
    });

    if (tasks.length !== allTaskIds.length) {
      const foundIds = new Set(tasks.map(t => t.id));
      const missingIds = allTaskIds.filter(id => !foundIds.has(id));
      console.warn(`⚠️ Some tasks not found: ${missingIds.join(', ')}`);
    }

    // Separate main tasks and child tasks
    const mainTasks = tasks.filter(t => !t.parentTaskId);
    const childTasks = tasks.filter(t => !!t.parentTaskId);

    console.log(`📋 Task breakdown: ${mainTasks.length} main tasks, ${childTasks.length} child tasks`);

    // Check permissions for main tasks (EMPLOYEE and MANAGER cannot delete main tasks)
    if (mainTasks.length > 0 && !allowedRolesForAllTasks.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to delete main tasks. Only project managers, admins, and HR can delete main tasks.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    // For EMPLOYEE: may only delete child tasks that are assigned to them
    let tasksToDelete = tasks;
    if (req.user.role === 'EMPLOYEE') {
      const notAllowed = tasks.filter(t => !t.parentTaskId || t.assignedEmployeeId !== req.user!.id);
      if (notAllowed.length > 0) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: You can only delete child tasks and subtasks that are assigned to you.',
          code: 'ACCESS_DENIED',
        });
        return;
      }
      tasksToDelete = tasks.filter(t => !!t.parentTaskId && t.assignedEmployeeId === req.user!.id);
      console.log(`📋 Employee: deleting ${tasksToDelete.length} child task(s) assigned to them`);
    } else if (childTasks.length > 0 && !allowedRolesForChildTasks.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to delete child tasks.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

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
    if (task.assignedEmployeeId !== currentUserId && req.user?.role !== 'ADMIN' && req.user?.role !== 'PROJECT_MANAGER') {
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

// Admin: delegation report for audit (original assignee, new assignee, task ID, date/time, reason)
export const getDelegationsReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'PROJECT_MANAGER') {
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

    // Employee role: Count tasks where they are in assignments, assigned via assignedEmployeeId, or original assignee after delegation
    if (req.user && req.user.role === 'EMPLOYEE') {
      where.OR = [
        { assignments: { some: { employeeId: req.user.id } } },
        { assignedEmployeeId: req.user.id },
        { delegations: { some: { originalAssigneeId: req.user.id } } },
      ];
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
      const childStatus =
        child.status === 'not started' ? 'PENDING' :
        child.status === 'working' ? 'IN_PROGRESS' :
        child.status === 'done' ? 'COMPLETED' : 'PENDING';
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
    const subStatus =
      status === 'not started' ? 'PENDING' :
      status === 'working' ? 'IN_PROGRESS' :
      status === 'done' ? 'COMPLETED' : 'PENDING';
    const hasPredecessor = !!predecessorId;

    const subtask = await prisma.task.create({
      data: {
        title: titleStr,
        description: description || null,
        projectId: projectId,
        parentTaskId: parentId as any, // Link to parent task
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
    const childStatus =
      status === 'not started' ? 'PENDING' :
      status === 'working' ? 'IN_PROGRESS' :
      status === 'done' ? 'COMPLETED' : 'PENDING';
    const childHasPredecessor = !!predecessorId;

    const childTask = await prisma.task.create({
      data: {
        title: titleStr,
        description: description || null,
        projectId: parentSubtask.projectId,
        parentTaskId: parentId as any, // Link to parent subtask
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
      ON_HOLD: tasks.filter((t: any) => t.status === 'ON_HOLD'),
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

