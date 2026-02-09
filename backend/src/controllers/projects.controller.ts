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
      projectManager, // Text search filter (not projectManagerId)
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

    // Filter by project manager name (text search)
    if (projectManager) {
      where.projectManager = { contains: projectManager as string, mode: 'insensitive' };
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { referenceNumber: { contains: search as string, mode: 'insensitive' } },
        { pin: { contains: search as string, mode: 'insensitive' } },
        { projectManager: { contains: search as string, mode: 'insensitive' } }, // Include projectManager in search
      ];
    }

    if (req.user?.role === 'EMPLOYEE') {
      where.assignedEmployees = { some: { employeeId: req.user.id } };
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
              contracts: true,
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

    if (req.user?.role === 'EMPLOYEE') {
      const isAssigned = project.assignedEmployees?.some((a: { employeeId: string }) => a.employeeId === req.user!.id);
      if (!isAssigned) {
        res.status(403).json({ success: false, message: 'You do not have access to this project' });
        return;
      }
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
    // Employee role: Cannot create projects
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to create projects. Please contact your manager.',
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
    const project = await prisma.project.create({
      data: {
        name: finalName,
        referenceNumber,
        pin: pin || null,
        clientId: finalClientId || null,
        owner: owner || null,
        description: finalDescription || null,
        status: projectStatus,  // Use enum value, not string
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
        assignedEmployees: employeeIds && employeeIds.length > 0 ? {
          create: employeeIds.map((employeeId: string) => ({
            employeeId,
            assignedBy: req.user?.id || null,
          })),
        } : undefined,
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
      select: { id: true, name: true, status: true, referenceNumber: true }
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
    } = req.body;

    // Check if project exists
    const existingProject = await prisma.project.findUnique({
      where: { id },
      include: {
        assignedEmployees: {
          select: {
            employeeId: true,
          },
        },
      },
    });

    if (!existingProject) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    // Employee role: Can only update assigned projects
    if (req.user?.role === 'EMPLOYEE') {
      const isAssigned = existingProject.assignedEmployees?.some(
        (a: { employeeId: string }) => a.employeeId === req.user!.id
      );
      if (!isAssigned) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: You do not have permission to edit this project. You can only modify projects assigned to you.',
          code: 'ACCESS_DENIED',
        });
        return;
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

    console.log(`🗑️ Delete project request received for ID: ${id}`);

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        assignedEmployees: {
          select: {
            employeeId: true,
          },
        },
      },
    });

    if (!project) {
      console.log(`❌ Project ${id} not found`);
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    // Employee role: Cannot delete projects (even assigned ones)
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to delete projects. Please contact your manager.',
        code: 'ACCESS_DENIED',
      });
      return;
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
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ 
        success: false, 
        message: 'Project IDs array is required' 
      });
      return;
    }

    // Verify all projects exist
    const projects = await prisma.project.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (projects.length !== ids.length) {
      res.status(404).json({ 
        success: false, 
        message: 'Some projects not found' 
      });
      return;
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



