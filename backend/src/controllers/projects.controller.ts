import { Request, Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { ProjectStatus } from '@prisma/client';

// Get all projects with filters
export const getAllProjects = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { 
      status, 
      clientId, 
      projectManagerId, 
      search,
      page = '1',
      limit = '10',
      sortBy = 'createdAt',
      sortOrder = 'desc'
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

    if (projectManagerId) {
      where.projectManagerId = projectManagerId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { referenceNumber: { contains: search as string, mode: 'insensitive' } },
        { pin: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: {
          [sortBy as string]: sortOrder as 'asc' | 'desc',
        },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          projectManager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
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
          _count: {
            select: {
              tasks: true,
              documents: true,
              tenders: true,
            },
          },
        },
      }),
      prisma.project.count({ where }),
    ]);

    res.json({
      success: true,
      data: projects,
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
        projectManager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
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
                role: true,
              },
            },
          },
        },
        tasks: {
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
        _count: {
          select: {
            tasks: true,
            documents: true,
            tenders: true,
            checklists: true,
            attachments: true,
          },
        },
      },
    });

    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    res.json({
      success: true,
      data: project,
    });
  } catch (error) {
    console.error('Get project by ID error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Create new project
export const createProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      name,
      referenceNumber,
      pin,
      clientId,
      owner,
      description,
      status,
      projectManagerId,
      startDate,
      endDate,
      deadline,
      planDays,
      remarks,
      assigneeNotes,
      employeeIds, // Array of employee IDs to assign
    } = req.body;

    // Validate required fields
    if (!name || !referenceNumber) {
      res.status(400).json({
        success: false,
        message: 'Name and reference number are required',
      });
      return;
    }

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
    
    console.log(`📝 Creating project: ${name}`);
    console.log(`   Reference Number: ${referenceNumber}`);
    console.log(`   Status: ${projectStatus} (will count as ${projectStatus === ProjectStatus.OPEN || projectStatus === ProjectStatus.IN_PROGRESS ? 'ACTIVE' : 'INACTIVE'})`);
    console.log(`   Created By: ${req.user?.id}`);

    // Create project
    const project = await prisma.project.create({
      data: {
        name,
        referenceNumber,
        pin: pin || null,
        clientId: clientId || null,
        owner: owner || null,
        description: description || null,
        status: projectStatus,  // Use enum value, not string
        projectManagerId: projectManagerId || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        deadline: deadline ? new Date(deadline) : null,
        planDays: planDays ? parseInt(planDays, 10) : null,
        remarks: remarks || null,
        assigneeNotes: assigneeNotes || null,
        createdBy: req.user?.id || null,
        assignedEmployees: employeeIds && employeeIds.length > 0 ? {
          create: employeeIds.map((employeeId: string) => ({
            employeeId,
            assignedBy: req.user?.id || null,
          })),
        } : undefined,
      },
      include: {
        client: true,
        projectManager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
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
      },
    });

    // Log successful creation
    console.log(`✅ Project created successfully: ${project.id}`);
    console.log(`   Final Status: ${project.status}`);
    
    // Verify the project was saved correctly
    const verifyProject = await prisma.project.findUnique({
      where: { id: project.id },
      select: { id: true, name: true, status: true, referenceNumber: true }
    });
    console.log(`   Verified in DB:`, verifyProject);

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: project,
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Update project
export const updateProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      name,
      referenceNumber,
      pin,
      clientId,
      owner,
      description,
      status,
      projectManagerId,
      startDate,
      endDate,
      deadline,
      planDays,
      remarks,
      assigneeNotes,
    } = req.body;

    // Check if project exists
    const existingProject = await prisma.project.findUnique({
      where: { id },
    });

    if (!existingProject) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
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

    // Update project
    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(referenceNumber && { referenceNumber }),
        ...(pin !== undefined && { pin: pin || null }),
        ...(clientId !== undefined && { clientId: clientId || null }),
        ...(owner !== undefined && { owner: owner || null }),
        ...(description !== undefined && { description: description || null }),
        ...(status && { status }),
        ...(projectManagerId !== undefined && { projectManagerId: projectManagerId || null }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(deadline && { deadline: new Date(deadline) }),
        ...(planDays !== undefined && { planDays: planDays ? parseInt(planDays, 10) : null }),
        ...(remarks !== undefined && { remarks: remarks || null }),
        ...(assigneeNotes !== undefined && { assigneeNotes: assigneeNotes || null }),
      },
      include: {
        client: true,
        projectManager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
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
      },
    });

    res.json({
      success: true,
      message: 'Project updated successfully',
      data: project,
    });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Delete project
export const deleteProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    await prisma.project.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
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



