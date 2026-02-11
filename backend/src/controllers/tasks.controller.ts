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

    if (assignedTo) {
      where.assignments = {
        some: {
          employeeId: assignedTo as string,
        },
      };
    }

    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    // If user is not admin, filter by assigned tasks
    if (req.user && req.user.role !== 'ADMIN' && req.user.role !== 'PROJECT_MANAGER') {
      where.assignments = {
        some: {
          employeeId: req.user.id,
        },
      };
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
              subtasks: true, // Child tasks nested inside subtasks
            },
            orderBy: {
              createdAt: 'asc',
            },
          } as any,
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
        assignments: {
          select: {
            employeeId: true,
          },
        },
      },
    });

    if (!taskCheck) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    // Employee role: Can only view tasks assigned to them
    if (req.user?.role === 'EMPLOYEE') {
      const isAssigned = taskCheck.assignments?.some(
        (assignment: { employeeId: string }) => assignment.employeeId === req.user!.id
      );
      if (!isAssigned) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: You do not have permission to view this task. You can only view tasks assigned to you by the project manager.',
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
            subtasks: true, // Child tasks nested inside subtasks
          },
          orderBy: {
            createdAt: 'asc',
          },
        } as any,
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

  } catch (error) {
    console.error('Get task by ID error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Create new task
export const createTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Employee role: Cannot create tasks (only project managers can create tasks)
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to create tasks. Only project managers can create tasks.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

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
      employeeIds, // Array of employee IDs to assign
      // Additional fields for subtasks
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

    // Helper function to map subtask data for nested create
    const mapSubtaskData = (subtask: any) => ({
      title: subtask.title || subtask.name || '',
      description: subtask.description || null,
      projectId,
      status: subtask.status === 'not started' ? 'PENDING' : 
              subtask.status === 'working' ? 'IN_PROGRESS' : 
              subtask.status === 'done' ? 'COMPLETED' : 'PENDING',
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
      // Nested child subtasks
      subtasks: subtask.childSubtasks && Array.isArray(subtask.childSubtasks) && subtask.childSubtasks.length > 0
        ? {
            create: subtask.childSubtasks.map(mapSubtaskData),
          }
        : undefined,
    });

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
      assignments: employeeIds && employeeIds.length > 0 ? {
        create: employeeIds.map((employeeId: string) => ({
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
    } = req.body;

    // Check if task exists
    const existingTask = await prisma.task.findUnique({
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

    // Employee role: Can only update tasks assigned to them, and only certain fields
    if (req.user?.role === 'EMPLOYEE') {
      const isAssigned = existingTask.assignments?.some(
        (assignment: { employeeId: string }) => assignment.employeeId === req.user!.id
      );
      if (!isAssigned) {
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
          startDate !== undefined || dueDate !== undefined || estimatedHours !== undefined) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: You can only update task status and actual hours. Please contact your project manager to modify other fields.',
          code: 'ACCESS_DENIED',
        });
        return;
      }
    }

    // If status is being changed to COMPLETED, set completedAt
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
    };

    if (status === 'COMPLETED' && existingTask.status !== 'COMPLETED') {
      updateData.completedAt = new Date();
    } else if (status !== 'COMPLETED' && existingTask.status === 'COMPLETED') {
      updateData.completedAt = null;
    }

    // Update task
    const task = await prisma.task.update({
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
    // Employee role: Cannot delete tasks (only project managers can delete tasks)
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to delete tasks. Only project managers can delete tasks.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    const { id } = req.params;

    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    await prisma.task.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Task deleted successfully',
    });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Assign employees to task
export const assignEmployees = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Employee role: Cannot assign employees to tasks (only project managers can assign)
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to assign employees to tasks. Only project managers can assign tasks.',
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

    // Employee role: Can only see stats for tasks assigned to them
    if (req.user && req.user.role === 'EMPLOYEE') {
      where.assignments = {
        some: {
          employeeId: req.user.id,
        },
      };
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
    const { parentId } = req.params; // Main task ID
    const {
      title,
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
    } = req.body;

    // Validate required fields
    if (!title || !parentId) {
      res.status(400).json({
        success: false,
        message: 'Title and parent task ID are required',
      });
      return;
    }

    // Check if parent task exists
    const parentTask = await prisma.task.findUnique({
      where: { id: parentId },
      select: { id: true, projectId: true },
    });

    if (!parentTask) {
      res.status(404).json({
        success: false,
        message: 'Parent task not found',
      });
      return;
    }

    // Helper to map child subtask data
    const mapChildSubtaskData = (child: any) => ({
      title: child.title || child.name || '',
      description: child.description || null,
      projectId: parentTask.projectId,
      status: child.status === 'not started' ? 'PENDING' : 
              child.status === 'working' ? 'IN_PROGRESS' : 
              child.status === 'done' ? 'COMPLETED' : 'PENDING',
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
    });

    // Create subtask with nested child tasks
    const subtask = await prisma.task.create({
      data: {
        title,
        description: description || null,
        projectId: parentTask.projectId,
        parentTaskId: parentId as any, // Link to parent task
        status: status === 'not started' ? 'PENDING' : 
                status === 'working' ? 'IN_PROGRESS' : 
                status === 'done' ? 'COMPLETED' : 'PENDING',
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
  } catch (error) {
    console.error('Add subtask error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Add child task to a subtask (requires parentId = subtask id)
export const addChildTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { parentId } = req.params; // Subtask ID
    const {
      title,
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
    } = req.body;

    // Validate required fields
    if (!title || !parentId) {
      res.status(400).json({
        success: false,
        message: 'Title and parent subtask ID are required',
      });
      return;
    }

    // Check if parent subtask exists
    const parentSubtask = await prisma.task.findUnique({
      where: { id: parentId },
      select: { id: true, projectId: true, parentTaskId: true } as any,
    });

    if (!parentSubtask) {
      res.status(404).json({
        success: false,
        message: 'Parent subtask not found',
      });
      return;
    }

    // Create child task
    const childTask = await prisma.task.create({
      data: {
        title,
        description: description || null,
        projectId: parentSubtask.projectId,
        parentTaskId: parentId as any, // Link to parent subtask
        status: status === 'not started' ? 'PENDING' : 
                status === 'working' ? 'IN_PROGRESS' : 
                status === 'done' ? 'COMPLETED' : 'PENDING',
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
      } as any,
      include: {
        parentTask: {
          select: {
            id: true,
            title: true,
          },
        } as any,
      } as any,
    });

    res.status(201).json({
      success: true,
      message: 'Child task created successfully',
      data: childTask,
    });
  } catch (error) {
    console.error('Add child task error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Get tasks for Kanban board
export const getKanbanTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;

    const where: any = {};
    if (projectId) {
      where.projectId = projectId as string;
    }

    // Employee role: Can only see tasks assigned to them
    if (req.user && req.user.role === 'EMPLOYEE') {
      where.assignments = {
        some: {
          employeeId: req.user.id,
        },
      };
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

