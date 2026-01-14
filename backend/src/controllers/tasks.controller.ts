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

    const where: any = {};

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
          _count: {
            select: {
              checklists: true,
              attachments: true,
              comments: true,
            },
          },
        },
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
      },
    });

    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error('Get task by ID error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Create new task
export const createTask = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
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

    // Create task
    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        projectId,
        status: status || 'PENDING',
        priority: priority || 'MEDIUM',
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        tags: tags || [],
        createdBy: req.user?.id || null,
        assignments: employeeIds && employeeIds.length > 0 ? {
          create: employeeIds.map((employeeId: string) => ({
            employeeId,
            assignedBy: req.user?.id || null,
            status: 'PENDING',
          })),
        } : undefined,
      },
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
    });

    if (!existingTask) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
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

    const where: any = {};
    if (projectId) {
      where.projectId = projectId as string;
    }

    // If user is not admin, filter by assigned tasks
    if (req.user && req.user.role !== 'ADMIN' && req.user.role !== 'PROJECT_MANAGER') {
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

// Get tasks for Kanban board
export const getKanbanTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;

    const where: any = {};
    if (projectId) {
      where.projectId = projectId as string;
    }

    // If user is not admin, filter by assigned tasks
    if (req.user && req.user.role !== 'ADMIN' && req.user.role !== 'PROJECT_MANAGER') {
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

