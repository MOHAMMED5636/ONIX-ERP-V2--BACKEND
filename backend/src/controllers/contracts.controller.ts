import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { computeNextProjectNumber } from '../utils/project-number';
import { ContractStatus, UserRole } from '@prisma/client';

// Generate unique reference number for contract
async function generateReferenceNumber(): Promise<string> {
  const prefix = 'O-CT-';
  let referenceNumber: string;
  let exists = true;
  let attempts = 0;
  const maxAttempts = 100;

  while (exists && attempts < maxAttempts) {
    // Generate a random alphanumeric string (8 characters)
    const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
    referenceNumber = `${prefix}${randomPart}`;

    // Check if it already exists
    const existing = await prisma.contract.findUnique({
      where: { referenceNumber },
    });

    if (!existing) {
      exists = false;
    }
    attempts++;
  }

  if (attempts >= maxAttempts) {
    // Fallback: use timestamp-based reference
    const timestamp = Date.now().toString(36).toUpperCase();
    referenceNumber = `${prefix}${timestamp}`;
  }

  return referenceNumber!;
}

// Get all contracts with filters
export const getAllContracts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      search,
      status,
      projectId,
      clientId,
      contractType,
      page = '1',
      limit = '50',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      forLoadOut, // Query parameter to indicate this is for Load Out modal (filter by assigned manager)
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    let managerFilterApplied = false;

    // STRICT ROLE-BASED FILTERING - Backend enforcement
    const userRole = req.user?.role;
    const userEmail = req.user?.email;

    if (userRole === 'MANAGER') {
      // Manager: Always return ONLY contracts assigned to this manager's email OR ID
      if (!userEmail || !req.user?.id) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: Manager email or ID not found in session',
          code: 'ACCESS_DENIED',
        });
        return;
      }
      // Check both assignedManagerEmail (direct match) OR assignedManagerId (via relation)
      // Store manager filter separately to combine with other filters later
      managerFilterApplied = true;
      console.log(`🔒 Manager filtering: Only showing contracts assigned to ${userEmail} (ID: ${req.user.id})`);
    } else if ((userRole === 'ADMIN' || userRole === 'HR' || userRole === 'PROJECT_MANAGER') && forLoadOut === 'true') {
      // For Load Out modal: ADMIN/HR/PROJECT_MANAGER should only see contracts assigned to them
      // This ensures managers only see their own contracts in the Load Out interface
      if (!userEmail || !req.user?.id) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: User email or ID not found in session',
          code: 'ACCESS_DENIED',
        });
        return;
      }
      // Check both assignedManagerEmail (direct match) OR assignedManagerId (via relation)
      // Store manager filter separately to combine with other filters later
      managerFilterApplied = true;
      console.log(`🔒 Load Out filtering: Only showing contracts assigned to ${userEmail} (ID: ${req.user.id})`);
    } else if (userRole === 'ADMIN' || userRole === 'HR' || userRole === 'PROJECT_MANAGER') {
      // Admin, HR, Project Manager: Return all contracts (no filtering) for general contract list
      // where clause remains empty
    } else if (userRole === 'EMPLOYEE') {
      // Employee: Do not return contracts unless specifically linked to their tasks
      // Check if employee has tasks linked to contracts via projects
      const employeeTasks = await prisma.task.findMany({
        where: {
          OR: [
            { assignments: { some: { employeeId: req.user!.id } } },
            { assignedEmployeeId: req.user!.id },
          ],
        },
        select: {
          projectId: true,
        },
        distinct: ['projectId'],
      });

      const projectIds = employeeTasks.map(t => t.projectId).filter(Boolean) as string[];
      
      if (projectIds.length === 0) {
        // No tasks linked to projects, return empty result
        res.json({
          success: true,
          data: {
            contracts: [],
            pagination: {
              page: pageNum,
              limit: limitNum,
              total: 0,
              totalPages: 0,
            },
          },
        });
        return;
      }

      // Only return contracts linked to projects where employee has tasks
      where.projectId = {
        in: projectIds,
      };
      console.log(`🔒 Employee filtering: Only showing contracts linked to projects with employee tasks`);
    } else {
      // Other roles: No access
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to view contracts',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    // Apply other filters first
    if (status) {
      where.status = status as ContractStatus;
    }

    if (projectId) {
      where.projectId = projectId as string;
    }

    if (clientId) {
      where.clientId = clientId as string;
    }

    if (contractType) {
      where.contractType = contractType as string;
    }

    // Build manager filter (if needed)
    const managerFilterConditions = managerFilterApplied ? [
      { assignedManagerEmail: userEmail },
      { assignedManagerId: req.user!.id }
    ] : null;

    if (search) {
      const searchTerm = (search as string).trim();
      
      // First, check if search term is an exact reference number match
      const exactReferenceMatchWhere: any = { referenceNumber: searchTerm };
      
      // Add manager filter to exact match check if needed
      if (managerFilterApplied) {
        exactReferenceMatchWhere.OR = [
          { assignedManagerEmail: userEmail },
          { assignedManagerId: req.user!.id }
        ];
      }

      const exactReferenceMatch = await prisma.contract.findFirst({
        where: exactReferenceMatchWhere,
        include: {
          project: {
            select: {
              id: true,
              name: true,
              referenceNumber: true,
              status: true,
            },
          },
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
              email: true,
            },
          },
          approver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          assignedManager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      // If exact match found, check access control before returning
      if (exactReferenceMatch) {
        // STRICT ROLE-BASED ACCESS CONTROL for exact match
        // ALL roles (including ADMIN/HR/PROJECT_MANAGER) should only see contracts assigned to them for Load Out
        if (userRole === 'MANAGER' || userRole === 'ADMIN' || userRole === 'HR' || userRole === 'PROJECT_MANAGER') {
          // Manager, Admin, HR, Project Manager: Can only access contracts assigned to their email OR ID
          if (!userEmail || !req.user?.id) {
            res.status(403).json({
              success: false,
              message: 'Access Denied: User email or ID not found in session',
              code: 'ACCESS_DENIED',
            });
            return;
          }
          // Check both assignedManagerEmail and assignedManagerId
          if (exactReferenceMatch.assignedManagerEmail !== userEmail && 
              exactReferenceMatch.assignedManagerId !== req.user.id) {
            res.status(403).json({
              success: false,
              message: 'Access Denied: You can only view contracts assigned to you',
              code: 'ACCESS_DENIED',
            });
            return;
          }
        } else if (userRole === 'EMPLOYEE') {
          // Employee: Can only access contracts linked to projects where they have tasks
          if (exactReferenceMatch.projectId) {
            const hasTask = await prisma.task.findFirst({
              where: {
                projectId: exactReferenceMatch.projectId,
                OR: [
                  { assignments: { some: { employeeId: req.user!.id } } },
                  { assignedEmployeeId: req.user!.id },
                ],
              },
            });

            if (!hasTask) {
              res.status(403).json({
                success: false,
                message: 'Access Denied: You can only view contracts linked to projects with your assigned tasks',
                code: 'ACCESS_DENIED',
              });
              return;
            }
          } else {
            res.status(403).json({
              success: false,
              message: 'Access Denied: You can only view contracts linked to projects with your assigned tasks',
              code: 'ACCESS_DENIED',
            });
            return;
          }
        } else {
          res.status(403).json({
            success: false,
            message: 'Access Denied: You do not have permission to view contracts',
            code: 'ACCESS_DENIED',
          });
          return;
        }

        res.json({
          success: true,
          data: [exactReferenceMatch], // Return as array to match expected format
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: 1,
            totalPages: 1,
          },
        });
        return;
      }

      // Otherwise, use partial search
      const searchOrConditions = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { referenceNumber: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { contractorName: { contains: searchTerm, mode: 'insensitive' } },
        { clientName: { contains: searchTerm, mode: 'insensitive' } },
      ];

      // Combine manager filter with search filter
      if (managerFilterApplied) {
        // Need to combine manager filter AND search filter
        const combinedFilters: any[] = [];
        
        // Add existing filters (status, projectId, etc.) if any
        const otherFilters: any = {};
        if (where.status) otherFilters.status = where.status;
        if (where.projectId) otherFilters.projectId = where.projectId;
        if (where.clientId) otherFilters.clientId = where.clientId;
        if (where.contractType) otherFilters.contractType = where.contractType;
        
        // Clear where and rebuild with proper structure
        Object.keys(where).forEach(key => {
          if (!['status', 'projectId', 'clientId', 'contractType'].includes(key)) {
            delete where[key];
          }
        });

        // Add manager filter AND search filter
        where.AND = [
          { OR: managerFilterConditions }, // Manager filter
          { OR: searchOrConditions } // Search filter
        ];
        
        // Add other filters to AND if they exist
        if (Object.keys(otherFilters).length > 0) {
          where.AND.push(otherFilters);
        }
      } else {
        // No manager filter, just use search OR
        where.OR = searchOrConditions;
      }
    } else if (managerFilterApplied) {
      // No search, but manager filter exists - add it to where
      // If there are other filters (status, projectId, etc.), combine with AND
      const hasOtherFilters = where.status || where.projectId || where.clientId || where.contractType;
      
      if (hasOtherFilters) {
        // Combine manager filter with other filters using AND
        where.AND = [
          { OR: managerFilterConditions },
          ...Object.keys(where)
            .filter(key => !['AND', 'OR'].includes(key))
            .map(key => ({ [key]: where[key] }))
        ];
        // Remove individual filter keys since they're now in AND
        Object.keys(where).forEach(key => {
          if (!['AND', 'OR'].includes(key)) {
            delete where[key];
          }
        });
      } else {
        // No other filters, just use manager filter OR
        where.OR = managerFilterConditions;
      }
    }

    const [contracts, total] = await Promise.all([
      prisma.contract.findMany({
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
              status: true,
            },
          },
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
              email: true,
            },
          },
          approver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          assignedManager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      prisma.contract.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        contracts,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching contracts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contracts',
      error: error.message,
    });
  }
};

// Get contract by reference number (for auto-population in project creation)
export const getContractByReferenceNumber = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { referenceNumber } = req.query;

    if (!referenceNumber) {
      res.status(400).json({
        success: false,
        message: 'Reference number is required',
      });
      return;
    }

    const contract = await prisma.contract.findUnique({
      where: { referenceNumber: referenceNumber as string },
      include: {
        // Include full client details
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
            referenceNumber: true,
            isCorporate: true,
            nationality: true,
          },
        },
        // Include creator details
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        // Include approver details if approved
        approver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        // Include project details if linked
        project: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
            status: true,
            description: true,
          },
        },
      },
    });

    if (!contract) {
      // Return success: false with data: null to match frontend expectations
      res.json({
        success: false,
        data: null,
        message: 'Contract not found with the provided reference number. Please verify the reference number and try again.',
      });
      return;
    }

    // Prepare project-ready data for auto-population
    const projectData = {
      // Client information
      clientId: contract.clientId || null,
      clientName: contract.client?.name || contract.clientName || null,
      
      // Project basic info
      name: contract.title || null, // Contract title becomes project name
      description: contract.description || null,
      
      // Dates
      startDate: contract.startDate ? contract.startDate.toISOString().split('T')[0] : null, // Format as YYYY-MM-DD
      endDate: contract.endDate ? contract.endDate.toISOString().split('T')[0] : null,
      
      // Project details from contract
      owner: contract.developerName || null, // Developer name as project owner
      projectManager: contract.projectManager || (contract.creator ? `${contract.creator.firstName} ${contract.creator.lastName}`.trim() : null),
      
      // Additional contract info that might be useful
      contractType: contract.contractType || null,
      contractCategory: contract.contractCategory || null,
      plotNumber: contract.plotNumber || null,
      numberOfFloors: contract.numberOfFloors || null,
      region: contract.region || null,
      community: contract.community || null,
      makaniNumber: contract.makaniNumber || null,
    };

    // Return full contract data plus project-ready data
    res.json({
      success: true,
      data: contract,
      projectData: projectData, // Pre-formatted data ready for project form auto-fill
      message: 'Contract found. Project form can be auto-filled.',
    });
  } catch (error: any) {
    console.error('❌ Error fetching contract by reference number:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contract',
      error: error.message,
      data: null,
    });
  }
};

// Get a single contract by ID
export const getContractById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const userRole = req.user?.role;
    const userEmail = req.user?.email;
    const forLoadOut = String((req.query as any)?.forLoadOut || '').toLowerCase() === 'true';

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        project: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
          },
        },
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assignedManager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!contract) {
      res.status(404).json({
        success: false,
        message: 'Contract not found',
      });
      return;
    }

    // Role-based access control:
    // - ADMIN/HR/PROJECT_MANAGER: may view any contract (except in Load Out context)
    // - MANAGER: may only view contracts assigned to them
    // - EMPLOYEE: may only view contracts linked to projects where they have tasks
    //
    // For Load Out flows, enforce "assigned only" for all privileged roles too.
    if (userRole === 'ADMIN' || userRole === 'HR' || userRole === 'PROJECT_MANAGER') {
      if (forLoadOut) {
        if (!userEmail || !req.user?.id) {
          res.status(403).json({
            success: false,
            message: 'Access Denied: User email or ID not found in session',
            code: 'ACCESS_DENIED',
          });
          return;
        }
        if (contract.assignedManagerEmail !== userEmail && contract.assignedManagerId !== req.user.id) {
          res.status(403).json({
            success: false,
            message: 'Access Denied: You can only view contracts assigned to you',
            code: 'ACCESS_DENIED',
          });
          return;
        }
      }
      // Otherwise: allowed
    } else if (userRole === 'MANAGER') {
      if (!userEmail || !req.user?.id) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: Manager email or ID not found in session',
          code: 'ACCESS_DENIED',
        });
        return;
      }
      if (contract.assignedManagerEmail !== userEmail && contract.assignedManagerId !== req.user.id) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: You can only view contracts assigned to you',
          code: 'ACCESS_DENIED',
        });
        return;
      }
    } else if (userRole === 'EMPLOYEE') {
      // Employee: Can only access contracts linked to projects where they have tasks
      if (contract.projectId) {
        const hasTask = await prisma.task.findFirst({
          where: {
            projectId: contract.projectId,
            OR: [
              { assignments: { some: { employeeId: req.user!.id } } },
              { assignedEmployeeId: req.user!.id },
            ],
          },
        });

        if (!hasTask) {
          res.status(403).json({
            success: false,
            message: 'Access Denied: You can only view contracts linked to projects with your assigned tasks',
            code: 'ACCESS_DENIED',
          });
          return;
        }
      } else {
        // Contract not linked to any project, employee cannot access
        res.status(403).json({
          success: false,
          message: 'Access Denied: You can only view contracts linked to projects with your assigned tasks',
          code: 'ACCESS_DENIED',
        });
        return;
      }
    } else {
      // Other roles: No access
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to view contracts',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    // data includes all contract fields (e.g. projectManager, referenceNumber, status, client, etc.)
    res.json({
      success: true,
      data: contract,
    });
  } catch (error: any) {
    console.error('❌ Error fetching contract:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contract',
      error: error.message,
    });
  }
};

// Create a new contract
export const createContract = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('📝 Creating contract - Request received');
    console.log('📝 Request method:', req.method);
    console.log('📝 Request path:', req.path);
    console.log('📝 Request body keys:', Object.keys(req.body || {}));
    console.log('📝 Request body sample:', {
      title: req.body?.title,
      description: req.body?.description?.substring(0, 50),
      contractCategory: req.body?.contractCategory,
      status: req.body?.status,
      companyId: req.body?.companyId,
      clientId: req.body?.clientId,
    });
    console.log('📝 Full request body (first 500 chars):', JSON.stringify(req.body).substring(0, 500));
    console.log('📝 Request files:', req.files ? Object.keys(req.files) : 'No files');
    console.log('📝 Request file (single):', req.file ? req.file.filename : 'No single file');
    console.log('📝 Content-Type:', req.headers['content-type']);
    console.log('📝 Project Manager Name from request:', req.body?.projectManagerName);
    console.log('📝 User authentication:', {
      hasUser: !!req.user,
      userId: req.user?.id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
    });
    
    // Check authentication
    if (!req.user || !req.user.id) {
      console.error('❌ Authentication failed: No user ID found');
      res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in again.',
      });
      return;
    }
    
    const {
      title,
      referenceNumber: manualReferenceNumber, // Allow manual reference number entry
      description,
      contractType,
      contractCategory,
      status,
      projectId,
      clientId,
      selectedClients, // Array of client IDs
      projectNature, // Array of project nature types
      companyId,
      companyName,
      contractValue,
      currency,
      paymentTerms,
      startDate,
      endDate,
      signedDate,
      expiryDate,
      // Location fields
      makaniNumber,
      latitude,
      longitude,
      region,
      plotNumber,
      community,
      numberOfFloors,
      // Building details
      buildingCost,
      builtUpArea,
      buildingHeight,
      structuralSystem,
      buildingType,
      // Authority & Community
      authorityApprovalStatus,
      developerName,
      authorityApprovalRequired,
      // Project Manager
      projectManagerName, // Project manager name (from frontend)
      // Contract fees
      contractFees, // Array of fee objects
      // Payment schedule
      paymentScheduleType,
      totalAmount,
      installments,
      perInstallment,
      generateInvoice,
      contractorName,
      contractorContact,
      clientName,
      clientContact,
      termsAndConditions,
      specialClauses,
      renewalTerms,
      attachments,
      assignedManagerEmail, // Manager email for assignment
      assignedManagerId, // Manager ID for assignment (alternative to email)
    } = req.body;

    // Validation - ensure title is provided
    const contractTitle = title?.trim() || `Contract ${new Date().toISOString().split('T')[0]}`;
    if (!contractTitle || contractTitle.length === 0) {
      console.error('❌ Title validation failed:', { title, contractTitle });
      res.status(400).json({
        success: false,
        message: 'Contract title is required',
      });
      return;
    }

    console.log('✅ Title validated:', contractTitle);

    // Handle reference number: use manual entry if provided, otherwise auto-generate
    let referenceNumber: string;
    if (manualReferenceNumber && manualReferenceNumber.trim()) {
      // Validate manual reference number is unique
      const trimmedRef = manualReferenceNumber.trim();
      const existing = await prisma.contract.findUnique({
        where: { referenceNumber: trimmedRef },
      });
      
      if (existing) {
        res.status(400).json({
          success: false,
          message: `Reference number "${trimmedRef}" already exists. Please use a different reference number.`,
        });
        return;
      }
      
      referenceNumber = trimmedRef;
      console.log('✅ Using manual reference number:', referenceNumber);
    } else {
      // Auto-generate if no manual reference provided
      referenceNumber = await generateReferenceNumber();
      console.log('✅ Generated reference number:', referenceNumber);
    }

    // Handle document upload (field name: 'contractDocument') and multiple attachments
    let contractDocument: string | null = null;
    const uploadedAttachments: any[] = [];
    let parsedAttachments: string | null = null;
    
    // Handle single file (backward compatibility) or files from fields()
    const files = (req.files as { [fieldname: string]: Express.Multer.File[] }) || {};
    
    // Process contractDocument
    if (files.contractDocument && files.contractDocument.length > 0) {
      const file = files.contractDocument[0];
      contractDocument = `/uploads/documents/${file.filename}`;
      console.log('📄 Contract document uploaded:', {
        fieldname: file.fieldname,
        originalname: file.originalname,
        filename: file.filename,
        path: contractDocument,
        size: file.size,
      });
    } else if (req.file) {
      // Fallback for single file upload
      contractDocument = `/uploads/documents/${req.file.filename}`;
      console.log('📄 Contract document uploaded (single):', {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        filename: req.file.filename,
        path: contractDocument,
        size: req.file.size,
      });
    }
    
    // Process additional attachment files (attachment_0, attachment_1, etc.)
    Object.keys(files).forEach(key => {
      if (key.startsWith('attachment_') && files[key] && files[key].length > 0) {
        const file = files[key][0];
        uploadedAttachments.push({
          fileName: file.originalname,
          filePath: `/uploads/documents/${file.filename}`,
          fileUrl: `/uploads/documents/${file.filename}`,
          size: file.size,
          uploadedOn: new Date().toISOString(),
        });
        console.log('📎 Attachment uploaded:', {
          fieldname: file.fieldname,
          originalname: file.originalname,
          filename: file.filename,
          path: `/uploads/documents/${file.filename}`,
          size: file.size,
        });
      }
    });
    
    // Merge uploaded attachments with attachments from form data
    let finalAttachments = uploadedAttachments;
    if (attachments) {
      try {
        const formAttachments = typeof attachments === 'string' ? JSON.parse(attachments) : attachments;
        if (Array.isArray(formAttachments)) {
          // Merge, avoiding duplicates based on fileName
          const existingFileNames = new Set(uploadedAttachments.map(a => a.fileName));
          const newAttachments = formAttachments.filter((a: any) => {
            const fileName = a.fileName || a.name;
            return fileName && !existingFileNames.has(fileName);
          });
          finalAttachments = [...uploadedAttachments, ...newAttachments];
        }
      } catch (e) {
        console.warn('Failed to parse attachments from form data:', e);
      }
    }
    
    // Set parsedAttachments from final merged list
    if (finalAttachments.length > 0) {
      parsedAttachments = JSON.stringify(finalAttachments);
    } else if (attachments) {
      // Fallback to original attachments if no files were uploaded
      if (typeof attachments === 'string') {
        parsedAttachments = attachments;
      } else {
        parsedAttachments = JSON.stringify(attachments);
      }
    }

    // Parse dates
    let parsedStartDate: Date | null = null;
    let parsedEndDate: Date | null = null;
    let parsedSignedDate: Date | null = null;
    let parsedExpiryDate: Date | null = null;

    if (startDate) {
      parsedStartDate = new Date(startDate);
      if (isNaN(parsedStartDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid start date format',
        });
        return;
      }
    }

    if (endDate) {
      parsedEndDate = new Date(endDate);
      if (isNaN(parsedEndDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid end date format',
        });
        return;
      }
    }

    if (signedDate) {
      parsedSignedDate = new Date(signedDate);
      if (isNaN(parsedSignedDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid signed date format',
        });
        return;
      }
    }

    if (expiryDate) {
      parsedExpiryDate = new Date(expiryDate);
      if (isNaN(parsedExpiryDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid expiry date format',
        });
        return;
      }
    }

    // Parse JSON fields (they come as strings from FormData)
    let parsedProjectNature: string | null = null;
    if (projectNature) {
      if (typeof projectNature === 'string') {
        try {
          // Try to parse if it's a JSON string
          const parsed = JSON.parse(projectNature);
          parsedProjectNature = JSON.stringify(parsed);
        } catch {
          // If not JSON, use as-is
          parsedProjectNature = projectNature;
        }
      } else {
        parsedProjectNature = JSON.stringify(projectNature);
      }
    }

    let parsedSelectedClients: string | null = null;
    if (selectedClients) {
      if (typeof selectedClients === 'string') {
        try {
          const parsed = JSON.parse(selectedClients);
          parsedSelectedClients = JSON.stringify(parsed);
        } catch {
          parsedSelectedClients = selectedClients;
        }
      } else {
        parsedSelectedClients = JSON.stringify(selectedClients);
      }
    }

    let parsedContractFees: string | null = null;
    if (contractFees) {
      if (typeof contractFees === 'string') {
        try {
          const parsed = JSON.parse(contractFees);
          parsedContractFees = JSON.stringify(parsed);
        } catch {
          parsedContractFees = contractFees;
        }
      } else {
        parsedContractFees = JSON.stringify(contractFees);
      }
    }


    // Parse numeric fields with validation for Decimal(10,7) precision
    let parsedLatitude: number | null = null;
    if (latitude !== undefined && latitude !== null && latitude !== '') {
      parsedLatitude = parseFloat(latitude);
      if (isNaN(parsedLatitude)) {
        res.status(400).json({
          success: false,
          message: 'Invalid latitude format',
        });
        return;
      }
      // Validate latitude range: -90 to 90, and must fit in Decimal(10,7) = max 999.9999999
      if (parsedLatitude < -90 || parsedLatitude > 90) {
        res.status(400).json({
          success: false,
          message: 'Latitude must be between -90 and 90 degrees',
        });
        return;
      }
      // Ensure it fits in Decimal(10,7) - absolute value must be < 1000
      if (Math.abs(parsedLatitude) >= 1000) {
        res.status(400).json({
          success: false,
          message: 'Latitude value is too large. Maximum allowed: 999.9999999',
        });
        return;
      }
      // Round to 7 decimal places to match database precision
      parsedLatitude = Math.round(parsedLatitude * 10000000) / 10000000;
    }

    let parsedLongitude: number | null = null;
    if (longitude !== undefined && longitude !== null && longitude !== '') {
      parsedLongitude = parseFloat(longitude);
      if (isNaN(parsedLongitude)) {
        res.status(400).json({
          success: false,
          message: 'Invalid longitude format',
        });
        return;
      }
      // Validate longitude range: -180 to 180, and must fit in Decimal(10,7) = max 999.9999999
      if (parsedLongitude < -180 || parsedLongitude > 180) {
        res.status(400).json({
          success: false,
          message: 'Longitude must be between -180 and 180 degrees',
        });
        return;
      }
      // Ensure it fits in Decimal(10,7) - absolute value must be < 1000
      if (Math.abs(parsedLongitude) >= 1000) {
        res.status(400).json({
          success: false,
          message: 'Longitude value is too large. Maximum allowed: 999.9999999',
        });
        return;
      }
      // Round to 7 decimal places to match database precision
      parsedLongitude = Math.round(parsedLongitude * 10000000) / 10000000;
    }

    let parsedBuildingCost: number | null = null;
    if (buildingCost !== undefined && buildingCost !== null && buildingCost !== '') {
      parsedBuildingCost = parseFloat(buildingCost);
      if (isNaN(parsedBuildingCost)) {
        res.status(400).json({
          success: false,
          message: 'Invalid building cost format',
        });
        return;
      }
    }

    let parsedBuiltUpArea: number | null = null;
    if (builtUpArea !== undefined && builtUpArea !== null && builtUpArea !== '') {
      parsedBuiltUpArea = parseFloat(builtUpArea);
      if (isNaN(parsedBuiltUpArea)) {
        res.status(400).json({
          success: false,
          message: 'Invalid built up area format',
        });
        return;
      }
    }

    let parsedBuildingHeight: number | null = null;
    if (buildingHeight !== undefined && buildingHeight !== null && buildingHeight !== '') {
      parsedBuildingHeight = parseFloat(buildingHeight);
      if (isNaN(parsedBuildingHeight)) {
        res.status(400).json({
          success: false,
          message: 'Invalid building height format',
        });
        return;
      }
    }

    let parsedTotalAmount: number | null = null;
    if (totalAmount !== undefined && totalAmount !== null && totalAmount !== '') {
      parsedTotalAmount = parseFloat(totalAmount);
      if (isNaN(parsedTotalAmount)) {
        res.status(400).json({
          success: false,
          message: 'Invalid total amount format',
        });
        return;
      }
    }

    let parsedPerInstallment: number | null = null;
    if (perInstallment !== undefined && perInstallment !== null && perInstallment !== '') {
      parsedPerInstallment = parseFloat(perInstallment);
      if (isNaN(parsedPerInstallment)) {
        res.status(400).json({
          success: false,
          message: 'Invalid per installment format',
        });
        return;
      }
    }

    // Create contract
    console.log('📝 Creating contract in database with:', {
      referenceNumber,
      title: contractTitle,
      status,
      companyId,
      clientId,
      createdBy: req.user.id,
      hasContractDocument: !!contractDocument,
      attachmentsCount: finalAttachments.length,
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      buildingCost: parsedBuildingCost,
      builtUpArea: parsedBuiltUpArea,
      buildingHeight: parsedBuildingHeight,
      contractValue: contractValue ? parseFloat(contractValue) : null,
      totalAmount: parsedTotalAmount,
      perInstallment: parsedPerInstallment,
    });
    
    // Validate numeric fields don't exceed Decimal constraints before database insert
    if (parsedLatitude !== null && Math.abs(parsedLatitude) >= 1000) {
      console.error('❌ Latitude overflow:', parsedLatitude);
      res.status(400).json({
        success: false,
        message: `Latitude value ${parsedLatitude} exceeds maximum allowed value (999.9999999). Valid range: -90 to 90`,
      });
      return;
    }
    if (parsedLongitude !== null && Math.abs(parsedLongitude) >= 1000) {
      console.error('❌ Longitude overflow:', parsedLongitude);
      res.status(400).json({
        success: false,
        message: `Longitude value ${parsedLongitude} exceeds maximum allowed value (999.9999999). Valid range: -180 to 180`,
      });
      return;
    }
    
    // Validate and resolve manager assignment
    let finalAssignedManagerId: string | null = null;
    let finalAssignedManagerEmail: string | null = null;

    if (assignedManagerId) {
      // If manager ID is provided, validate it exists and is a manager
      const manager = await prisma.user.findUnique({
        where: { id: assignedManagerId },
        select: { id: true, email: true, role: true },
      });

      if (!manager) {
        res.status(400).json({
          success: false,
          message: `Manager with ID "${assignedManagerId}" not found`,
        });
        return;
      }

      const allowedManagerRoles = ['MANAGER', 'PROJECT_MANAGER', 'ADMIN'];
      if (!allowedManagerRoles.includes(manager.role)) {
        res.status(400).json({
          success: false,
          message: `User "${manager.email}" is not a manager. Only users with MANAGER, PROJECT_MANAGER, or ADMIN role can be assigned to contracts.`,
        });
        return;
      }

      finalAssignedManagerId = manager.id;
      finalAssignedManagerEmail = manager.email;
    } else if (assignedManagerEmail) {
      // If manager email is provided, find the manager by email
      const manager = await prisma.user.findUnique({
        where: { email: assignedManagerEmail.trim() },
        select: { id: true, email: true, role: true },
      });

      if (!manager) {
        res.status(400).json({
          success: false,
          message: `Manager with email "${assignedManagerEmail}" not found`,
        });
        return;
      }

      const allowedManagerRoles = ['MANAGER', 'PROJECT_MANAGER', 'ADMIN'];
      if (!allowedManagerRoles.includes(manager.role)) {
        res.status(400).json({
          success: false,
          message: `User "${assignedManagerEmail}" is not a manager. Only users with MANAGER, PROJECT_MANAGER, or ADMIN role can be assigned to contracts.`,
        });
        return;
      }

      finalAssignedManagerId = manager.id;
      finalAssignedManagerEmail = manager.email;
    } else if (projectManagerName && typeof projectManagerName === 'string' && projectManagerName.trim()) {
      // Admin may have selected a manager by display name only (e.g. "Kamil", "mohammadsourav")
      // Resolve to assignedManagerId/assignedManagerEmail so the manager sees the contract in Load Out
      const nameTrimmed = projectManagerName.trim();
      let resolvedManager: { id: string; email: string } | null = null;
      if (nameTrimmed.includes('@')) {
        const byEmail = await prisma.user.findFirst({
          where: { email: nameTrimmed, role: { in: ['MANAGER', 'PROJECT_MANAGER', 'ADMIN'] } },
          select: { id: true, email: true },
        });
        resolvedManager = byEmail;
      }
      if (!resolvedManager) {
        const managers = await prisma.user.findMany({
          where: { role: { in: ['MANAGER', 'PROJECT_MANAGER', 'ADMIN'] }, isActive: true },
          select: { id: true, email: true, firstName: true, lastName: true },
        });
        const fullNameLower = nameTrimmed.toLowerCase();
        resolvedManager = managers.find(m => {
          const full = `${(m.firstName || '').trim()} ${(m.lastName || '').trim()}`.trim().toLowerCase();
          const first = (m.firstName || '').trim().toLowerCase();
          const last = (m.lastName || '').trim().toLowerCase();
          return full === fullNameLower || first === fullNameLower || last === fullNameLower || full.includes(fullNameLower) || fullNameLower.includes(full);
        }) as { id: string; email: string } | undefined ?? null;
      }
      if (resolvedManager) {
        finalAssignedManagerId = resolvedManager.id;
        finalAssignedManagerEmail = resolvedManager.email;
        console.log('✅ Resolved manager by name:', projectManagerName, '->', resolvedManager.email);
      }
    }
    // If neither is provided (and name resolution found nothing), both remain null

    // Create contract in database
    try {
      const contract = await prisma.contract.create({
        data: {
          referenceNumber,
          title: contractTitle,
        description: description?.trim() || null,
        contractType: contractType || null,
        contractCategory: contractCategory || null,
        status: (status as ContractStatus) || ContractStatus.DRAFT,
        projectId: projectId || null,
        clientId: clientId || null, // Primary client (if single)
        selectedClients: parsedSelectedClients, // Multiple clients as JSON
        projectNature: parsedProjectNature, // Project nature types as JSON
        companyId: companyId || null,
        companyName: companyName?.trim() || null,
        contractValue: contractValue ? parseFloat(contractValue) : null,
        currency: currency || 'AED',
        paymentTerms: paymentTerms?.trim() || null,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        signedDate: parsedSignedDate,
        expiryDate: parsedExpiryDate,
        // Location
        makaniNumber: makaniNumber?.trim() || null,
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        region: region?.trim() || null,
        plotNumber: plotNumber?.trim() || null,
        community: community?.trim() || null,
        numberOfFloors: numberOfFloors ? parseInt(numberOfFloors) : null,
        // Building details
        buildingCost: parsedBuildingCost,
        builtUpArea: parsedBuiltUpArea,
        buildingHeight: parsedBuildingHeight,
        structuralSystem: structuralSystem?.trim() || null,
        buildingType: buildingType?.trim() || null,
        // Authority & Community
        authorityApprovalStatus: authorityApprovalStatus || null,
        developerName: developerName?.trim() || null,
        authorityApprovalRequired: authorityApprovalRequired === true || authorityApprovalRequired === 'true',
        // Project Manager
        projectManager: projectManagerName?.trim() ? projectManagerName.trim().substring(0, 100) : null,
        // Manager Assignment
        assignedManagerId: finalAssignedManagerId,
        assignedManagerEmail: finalAssignedManagerEmail,
        // Contract fees
        contractFees: parsedContractFees,
        // Payment schedule
        paymentScheduleType: paymentScheduleType || null,
        totalAmount: parsedTotalAmount,
        installments: installments ? parseInt(installments) : null,
        perInstallment: parsedPerInstallment,
        generateInvoice: generateInvoice === true || generateInvoice === 'true',
        // Parties
        contractorName: contractorName?.trim() || null,
        contractorContact: contractorContact?.trim() || null,
        clientName: clientName?.trim() || null,
        clientContact: clientContact?.trim() || null,
        // Legal & Terms
        termsAndConditions: termsAndConditions?.trim() || null,
        specialClauses: specialClauses?.trim() || null,
        renewalTerms: renewalTerms?.trim() || null,
        // Documents
        contractDocument,
        attachments: parsedAttachments,
        // Metadata - ensure user ID is set
        createdBy: req.user.id, // Required field, should always be set due to auth check above
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
          },
        },
        client: {
          select: {
            id: true,
            name: true,
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
      },
    });

      console.log('✅ Contract created successfully:', contract.referenceNumber);
      console.log('✅ Contract ID:', contract.id);
      console.log('✅ Project Manager saved:', contract.projectManager);
      console.log('✅ Project Manager Name from request was:', projectManagerName);
      if (finalAssignedManagerEmail) {
        console.log('✅ Contract assigned to manager:', finalAssignedManagerEmail);
      }

      res.status(201).json({
        success: true,
        data: contract,
        message: 'Contract created successfully',
      });
    } catch (prismaError: any) {
      console.error('❌ Prisma error creating contract:', prismaError);
      console.error('❌ Prisma error code:', prismaError.code);
      console.error('❌ Prisma error message:', prismaError.message);
      console.error('❌ Prisma error meta:', prismaError.meta);
      
      // Handle numeric overflow specifically
      if (prismaError.message?.includes('numeric field overflow') || prismaError.code === 'P2000') {
        const errorDetail = prismaError.meta?.target || 'unknown field';
        console.error('❌ Numeric overflow detected in field:', errorDetail);
        console.error('❌ Values that might cause overflow:', {
          latitude: parsedLatitude,
          longitude: parsedLongitude,
          buildingCost: parsedBuildingCost,
          builtUpArea: parsedBuiltUpArea,
          buildingHeight: parsedBuildingHeight,
          contractValue: contractValue ? parseFloat(contractValue) : null,
          totalAmount: parsedTotalAmount,
          perInstallment: parsedPerInstallment,
        });
        
        res.status(400).json({
          success: false,
          message: `Numeric field overflow: A value exceeds the maximum allowed. Please check latitude, longitude, or other numeric fields.`,
          error: prismaError.message,
          details: process.env.NODE_ENV === 'development' ? {
            field: errorDetail,
            values: {
              latitude: parsedLatitude,
              longitude: parsedLongitude,
            }
          } : undefined,
        });
        return;
      }
      
      // Re-throw to be caught by outer catch block
      throw prismaError;
    }
  } catch (error: any) {
    console.error('❌ Error creating contract:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error code:', error.code);

    // Handle unique constraint violations
    if (error.code === 'P2002') {
      res.status(400).json({
        success: false,
        message: 'A contract with this reference number already exists',
      });
      return;
    }

    // Handle validation errors
    if (error.name === 'ValidationError' || error.message?.includes('required')) {
      res.status(400).json({
        success: false,
        message: error.message || 'Validation error',
        error: error.message,
      });
      return;
    }

    // Log full error for debugging
    console.error('❌ Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    res.status(500).json({
      success: false,
      message: 'Failed to create contract',
      error: error.message || 'Unknown error occurred',
      errorCode: error.code,
      errorName: error.name,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

// Update a contract
export const updateContract = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      contractType,
      contractCategory,
      status,
      projectId,
      clientId,
      selectedClients,
      projectNature,
      companyId,
      companyName,
      contractValue,
      referenceNumber, // Allow reference number to be updated
      currency,
      paymentTerms,
      startDate,
      endDate,
      signedDate,
      expiryDate,
      makaniNumber,
      latitude,
      longitude,
      region,
      plotNumber,
      community,
      numberOfFloors,
      buildingCost,
      builtUpArea,
      buildingHeight,
      structuralSystem,
      buildingType,
      authorityApprovalStatus,
      developerName,
      authorityApprovalRequired,
      projectManagerName, // Project manager name (from frontend)
      contractFees,
      paymentScheduleType,
      totalAmount,
      installments,
      perInstallment,
      generateInvoice,
      contractorName,
      contractorContact,
      clientName,
      clientContact,
      termsAndConditions,
      specialClauses,
      renewalTerms,
      attachments,
      assignedManagerEmail, // Manager email for assignment
      assignedManagerId, // Manager ID for assignment (alternative to email)
    } = req.body;

    // Check if contract exists
    const existingContract = await prisma.contract.findUnique({
      where: { id },
    });

    if (!existingContract) {
      res.status(404).json({
        success: false,
        message: 'Contract not found',
      });
      return;
    }

    // STRICT ROLE-BASED ACCESS CONTROL for updates
    const userRole = req.user?.role;
    const userEmail = req.user?.email;

    if (userRole === 'ADMIN' || userRole === 'HR' || userRole === 'PROJECT_MANAGER') {
      // Privileged roles: can update all contracts
    } else if (userRole === 'MANAGER') {
      // Manager: Can only update contracts assigned to their email OR ID
      if (!userEmail || !req.user?.id) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: Manager email or ID not found in session',
          code: 'ACCESS_DENIED',
        });
        return;
      }
      // Check both assignedManagerEmail and assignedManagerId
      if (existingContract.assignedManagerEmail !== userEmail && 
          existingContract.assignedManagerId !== req.user.id) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: You can only update contracts assigned to you',
          code: 'ACCESS_DENIED',
        });
        return;
      }
      // Managers cannot reassign contracts to other managers
      if (assignedManagerEmail !== undefined || assignedManagerId !== undefined) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: Managers cannot reassign contracts. Only admins can change manager assignments.',
          code: 'ACCESS_DENIED',
        });
        return;
      }
    } else if (userRole === 'EMPLOYEE') {
      // Employee: Cannot update contracts
      res.status(403).json({
        success: false,
        message: 'Access Denied: Employees cannot update contracts',
        code: 'ACCESS_DENIED',
      });
      return;
    } else {
      // Other roles: No access
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to update contracts',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    // Validate and resolve manager assignment (only for ADMIN)
    let finalAssignedManagerId: string | null | undefined = undefined;
    let finalAssignedManagerEmail: string | null | undefined = undefined;

    if (assignedManagerId !== undefined || assignedManagerEmail !== undefined) {
      // Only ADMIN can change manager assignment
      if (userRole !== 'ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Access Denied: Only admins can change manager assignments',
          code: 'ACCESS_DENIED',
        });
        return;
      }

      if (assignedManagerId) {
        // If manager ID is provided, validate it exists and is a manager
        const manager = await prisma.user.findUnique({
          where: { id: assignedManagerId },
          select: { id: true, email: true, role: true },
        });

        if (!manager) {
          res.status(400).json({
            success: false,
            message: `Manager with ID "${assignedManagerId}" not found`,
          });
          return;
        }

        const allowedManagerRoles = ['MANAGER', 'PROJECT_MANAGER', 'ADMIN'];
        if (!allowedManagerRoles.includes(manager.role)) {
          res.status(400).json({
            success: false,
            message: `User "${manager.email}" is not a manager. Only users with MANAGER, PROJECT_MANAGER, or ADMIN role can be assigned to contracts.`,
          });
          return;
        }

        finalAssignedManagerId = manager.id;
        finalAssignedManagerEmail = manager.email;
      } else if (assignedManagerEmail) {
        // If manager email is provided, find the manager by email
        const manager = await prisma.user.findUnique({
          where: { email: assignedManagerEmail.trim() },
          select: { id: true, email: true, role: true },
        });

        if (!manager) {
          res.status(400).json({
            success: false,
            message: `Manager with email "${assignedManagerEmail}" not found`,
          });
          return;
        }

        const allowedManagerRoles = ['MANAGER', 'PROJECT_MANAGER', 'ADMIN'];
        if (!allowedManagerRoles.includes(manager.role)) {
          res.status(400).json({
            success: false,
            message: `User "${assignedManagerEmail}" is not a manager. Only users with MANAGER, PROJECT_MANAGER, or ADMIN role can be assigned to contracts.`,
          });
          return;
        }

        finalAssignedManagerId = manager.id;
        finalAssignedManagerEmail = manager.email;
      } else {
        // If explicitly set to null/empty, remove assignment
        finalAssignedManagerId = null;
        finalAssignedManagerEmail = null;
      }
    } else if (userRole === 'ADMIN' && projectManagerName !== undefined && typeof projectManagerName === 'string' && projectManagerName.trim()) {
      // Admin may have set/updated only the manager display name; resolve to ID/email so manager sees contract
      const nameTrimmed = projectManagerName.trim();
      let resolvedManager: { id: string; email: string } | null = null;
      if (nameTrimmed.includes('@')) {
        const byEmail = await prisma.user.findFirst({
          where: { email: nameTrimmed, role: { in: ['MANAGER', 'PROJECT_MANAGER', 'ADMIN'] } },
          select: { id: true, email: true },
        });
        resolvedManager = byEmail;
      }
      if (!resolvedManager) {
        const managers = await prisma.user.findMany({
          where: { role: { in: ['MANAGER', 'PROJECT_MANAGER', 'ADMIN'] }, isActive: true },
          select: { id: true, email: true, firstName: true, lastName: true },
        });
        const fullNameLower = nameTrimmed.toLowerCase();
        resolvedManager = managers.find(m => {
          const full = `${(m.firstName || '').trim()} ${(m.lastName || '').trim()}`.trim().toLowerCase();
          const first = (m.firstName || '').trim().toLowerCase();
          const last = (m.lastName || '').trim().toLowerCase();
          return full === fullNameLower || first === fullNameLower || last === fullNameLower || full.includes(fullNameLower) || fullNameLower.includes(full);
        }) as { id: string; email: string } | undefined ?? null;
      }
      if (resolvedManager) {
        finalAssignedManagerId = resolvedManager.id;
        finalAssignedManagerEmail = resolvedManager.email;
        console.log('✅ Resolved manager by name (update):', projectManagerName, '->', resolvedManager.email);
      }
    }

    // Handle reference number update (if provided and different from current)
    if (referenceNumber !== undefined && referenceNumber !== null && referenceNumber.trim() !== '') {
      const newReferenceNumber = referenceNumber.trim();
      const currentReferenceNumber = existingContract.referenceNumber;
      
      // Only validate uniqueness if the reference number is being changed
      if (newReferenceNumber !== currentReferenceNumber) {
        // Check if another contract already has this reference number
        const existingContractWithRef = await prisma.contract.findUnique({
          where: { referenceNumber: newReferenceNumber },
        });
        
        if (existingContractWithRef && existingContractWithRef.id !== id) {
          res.status(400).json({
            success: false,
            message: `A contract with reference number "${newReferenceNumber}" already exists`,
          });
          return;
        }
      }
    }

    // Handle document upload
    let contractDocument = existingContract.contractDocument;
    if (req.file) {
      contractDocument = `/uploads/documents/${req.file.filename}`;
      console.log('📄 Contract document updated:', {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        filename: req.file.filename,
        path: contractDocument,
        size: req.file.size,
      });
    }

    // Parse dates
    let parsedStartDate = existingContract.startDate;
    let parsedEndDate = existingContract.endDate;
    let parsedSignedDate = existingContract.signedDate;
    let parsedExpiryDate = existingContract.expiryDate;

    if (startDate !== undefined) {
      if (startDate === null || startDate === '') {
        parsedStartDate = null;
      } else {
        parsedStartDate = new Date(startDate);
        if (isNaN(parsedStartDate.getTime())) {
          res.status(400).json({
            success: false,
            message: 'Invalid start date format',
          });
          return;
        }
      }
    }

    if (endDate !== undefined) {
      if (endDate === null || endDate === '') {
        parsedEndDate = null;
      } else {
        parsedEndDate = new Date(endDate);
        if (isNaN(parsedEndDate.getTime())) {
          res.status(400).json({
            success: false,
            message: 'Invalid end date format',
          });
          return;
        }
      }
    }

    if (signedDate !== undefined) {
      if (signedDate === null || signedDate === '') {
        parsedSignedDate = null;
      } else {
        parsedSignedDate = new Date(signedDate);
        if (isNaN(parsedSignedDate.getTime())) {
          res.status(400).json({
            success: false,
            message: 'Invalid signed date format',
          });
          return;
        }
      }
    }

    if (expiryDate !== undefined) {
      if (expiryDate === null || expiryDate === '') {
        parsedExpiryDate = null;
      } else {
        parsedExpiryDate = new Date(expiryDate);
        if (isNaN(parsedExpiryDate.getTime())) {
          res.status(400).json({
            success: false,
            message: 'Invalid expiry date format',
          });
          return;
        }
      }
    }

    // Parse JSON fields
    let parsedProjectNature = existingContract.projectNature;
    if (projectNature !== undefined) {
      if (projectNature === null || projectNature === '') {
        parsedProjectNature = null;
      } else if (typeof projectNature === 'string') {
        parsedProjectNature = projectNature;
      } else {
        parsedProjectNature = JSON.stringify(projectNature);
      }
    }

    let parsedSelectedClients = existingContract.selectedClients;
    if (selectedClients !== undefined) {
      if (selectedClients === null || selectedClients === '') {
        parsedSelectedClients = null;
      } else if (typeof selectedClients === 'string') {
        parsedSelectedClients = selectedClients;
      } else {
        parsedSelectedClients = JSON.stringify(selectedClients);
      }
    }

    let parsedContractFees = existingContract.contractFees;
    if (contractFees !== undefined) {
      if (contractFees === null || contractFees === '') {
        parsedContractFees = null;
      } else if (typeof contractFees === 'string') {
        parsedContractFees = contractFees;
      } else {
        parsedContractFees = JSON.stringify(contractFees);
      }
    }

    let parsedAttachments = existingContract.attachments;
    if (attachments !== undefined) {
      if (attachments === null || attachments === '') {
        parsedAttachments = null;
      } else if (typeof attachments === 'string') {
        parsedAttachments = attachments;
      } else {
        parsedAttachments = JSON.stringify(attachments);
      }
    }

    // Parse numeric fields
    let parsedLatitude: number | null = existingContract.latitude ? Number(existingContract.latitude) : null;
    if (latitude !== undefined) {
      if (latitude === null || latitude === '') {
        parsedLatitude = null;
      } else {
        const parsed = parseFloat(latitude);
        if (isNaN(parsed)) {
          res.status(400).json({
            success: false,
            message: 'Invalid latitude format',
          });
          return;
        }
        parsedLatitude = parsed;
      }
    }

    let parsedLongitude: number | null = existingContract.longitude ? Number(existingContract.longitude) : null;
    if (longitude !== undefined) {
      if (longitude === null || longitude === '') {
        parsedLongitude = null;
      } else {
        const parsed = parseFloat(longitude);
        if (isNaN(parsed)) {
          res.status(400).json({
            success: false,
            message: 'Invalid longitude format',
          });
          return;
        }
        parsedLongitude = parsed;
      }
    }

    let parsedBuildingCost: number | null = existingContract.buildingCost ? Number(existingContract.buildingCost) : null;
    if (buildingCost !== undefined) {
      if (buildingCost === null || buildingCost === '') {
        parsedBuildingCost = null;
      } else {
        const parsed = parseFloat(buildingCost);
        if (isNaN(parsed)) {
          res.status(400).json({
            success: false,
            message: 'Invalid building cost format',
          });
          return;
        }
        parsedBuildingCost = parsed;
      }
    }

    let parsedBuiltUpArea: number | null = existingContract.builtUpArea ? Number(existingContract.builtUpArea) : null;
    if (builtUpArea !== undefined) {
      if (builtUpArea === null || builtUpArea === '') {
        parsedBuiltUpArea = null;
      } else {
        const parsed = parseFloat(builtUpArea);
        if (isNaN(parsed)) {
          res.status(400).json({
            success: false,
            message: 'Invalid built up area format',
          });
          return;
        }
        parsedBuiltUpArea = parsed;
      }
    }

    let parsedBuildingHeight: number | null = existingContract.buildingHeight ? Number(existingContract.buildingHeight) : null;
    if (buildingHeight !== undefined) {
      if (buildingHeight === null || buildingHeight === '') {
        parsedBuildingHeight = null;
      } else {
        const parsed = parseFloat(buildingHeight);
        if (isNaN(parsed)) {
          res.status(400).json({
            success: false,
            message: 'Invalid building height format',
          });
          return;
        }
        parsedBuildingHeight = parsed;
      }
    }

    let parsedTotalAmount: number | null = existingContract.totalAmount ? Number(existingContract.totalAmount) : null;
    if (totalAmount !== undefined) {
      if (totalAmount === null || totalAmount === '') {
        parsedTotalAmount = null;
      } else {
        const parsed = parseFloat(totalAmount);
        if (isNaN(parsed)) {
          res.status(400).json({
            success: false,
            message: 'Invalid total amount format',
          });
          return;
        }
        parsedTotalAmount = parsed;
      }
    }

    let parsedPerInstallment: number | null = existingContract.perInstallment ? Number(existingContract.perInstallment) : null;
    if (perInstallment !== undefined) {
      if (perInstallment === null || perInstallment === '') {
        parsedPerInstallment = null;
      } else {
        const parsed = parseFloat(perInstallment);
        if (isNaN(parsed)) {
          res.status(400).json({
            success: false,
            message: 'Invalid per installment format',
          });
          return;
        }
        parsedPerInstallment = parsed;
      }
    }

    // Update contract
    const contract = await prisma.contract.update({
      where: { id },
      data: {
        referenceNumber: referenceNumber !== undefined && referenceNumber !== null && referenceNumber.trim() !== '' 
          ? referenceNumber.trim() 
          : undefined,
        title: title !== undefined ? title.trim() : undefined,
        description: description !== undefined ? (description?.trim() || null) : undefined,
        contractType: contractType !== undefined ? contractType : undefined,
        contractCategory: contractCategory !== undefined ? contractCategory : undefined,
        status: status !== undefined ? (status as ContractStatus) : undefined,
        projectId: projectId !== undefined ? (projectId || null) : undefined,
        clientId: clientId !== undefined ? (clientId || null) : undefined,
        selectedClients: selectedClients !== undefined ? parsedSelectedClients : undefined,
        projectNature: projectNature !== undefined ? parsedProjectNature : undefined,
        companyId: companyId !== undefined ? (companyId || null) : undefined,
        companyName: companyName !== undefined ? (companyName?.trim() || null) : undefined,
        contractValue: contractValue !== undefined ? (contractValue ? parseFloat(contractValue) : null) : undefined,
        currency: currency !== undefined ? currency : undefined,
        paymentTerms: paymentTerms !== undefined ? (paymentTerms?.trim() || null) : undefined,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        signedDate: parsedSignedDate,
        expiryDate: parsedExpiryDate,
        // Location
        makaniNumber: makaniNumber !== undefined ? (makaniNumber?.trim() || null) : undefined,
        latitude: latitude !== undefined ? parsedLatitude : undefined,
        longitude: longitude !== undefined ? parsedLongitude : undefined,
        region: region !== undefined ? (region?.trim() || null) : undefined,
        plotNumber: plotNumber !== undefined ? (plotNumber?.trim() || null) : undefined,
        community: community !== undefined ? (community?.trim() || null) : undefined,
        numberOfFloors: numberOfFloors !== undefined ? (numberOfFloors ? parseInt(numberOfFloors) : null) : undefined,
        // Building details
        buildingCost: buildingCost !== undefined ? parsedBuildingCost : undefined,
        builtUpArea: builtUpArea !== undefined ? parsedBuiltUpArea : undefined,
        buildingHeight: buildingHeight !== undefined ? parsedBuildingHeight : undefined,
        structuralSystem: structuralSystem !== undefined ? (structuralSystem?.trim() || null) : undefined,
        buildingType: buildingType !== undefined ? (buildingType?.trim() || null) : undefined,
        // Authority & Community
        authorityApprovalStatus: authorityApprovalStatus !== undefined ? authorityApprovalStatus : undefined,
        developerName: developerName !== undefined ? (developerName?.trim() || null) : undefined,
        authorityApprovalRequired: authorityApprovalRequired !== undefined ? (authorityApprovalRequired === true || authorityApprovalRequired === 'true') : undefined,
        // Project Manager
        projectManager: projectManagerName !== undefined ? (projectManagerName?.trim() ? projectManagerName.trim().substring(0, 100) : null) : undefined,
        // Manager Assignment (only if explicitly provided and user is ADMIN)
        assignedManagerId: finalAssignedManagerId !== undefined ? finalAssignedManagerId : undefined,
        assignedManagerEmail: finalAssignedManagerEmail !== undefined ? finalAssignedManagerEmail : undefined,
        // Contract fees
        contractFees: contractFees !== undefined ? parsedContractFees : undefined,
        // Payment schedule
        paymentScheduleType: paymentScheduleType !== undefined ? paymentScheduleType : undefined,
        totalAmount: totalAmount !== undefined ? parsedTotalAmount : undefined,
        installments: installments !== undefined ? (installments ? parseInt(installments) : null) : undefined,
        perInstallment: perInstallment !== undefined ? parsedPerInstallment : undefined,
        generateInvoice: generateInvoice !== undefined ? (generateInvoice === true || generateInvoice === 'true') : undefined,
        // Parties
        contractorName: contractorName !== undefined ? (contractorName?.trim() || null) : undefined,
        contractorContact: contractorContact !== undefined ? (contractorContact?.trim() || null) : undefined,
        clientName: clientName !== undefined ? (clientName?.trim() || null) : undefined,
        clientContact: clientContact !== undefined ? (clientContact?.trim() || null) : undefined,
        // Legal & Terms
        termsAndConditions: termsAndConditions !== undefined ? (termsAndConditions?.trim() || null) : undefined,
        specialClauses: specialClauses !== undefined ? (specialClauses?.trim() || null) : undefined,
        renewalTerms: renewalTerms !== undefined ? (renewalTerms?.trim() || null) : undefined,
        // Documents
        contractDocument,
        attachments: parsedAttachments,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
          },
        },
        client: {
          select: {
            id: true,
            name: true,
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
      },
    });

    console.log('✅ Contract updated:', contract.referenceNumber);
    if (finalAssignedManagerEmail !== undefined) {
      console.log('✅ Contract manager assignment updated:', finalAssignedManagerEmail || 'removed');
    }

    res.json({
      success: true,
      data: contract,
      message: 'Contract updated successfully',
    });
  } catch (error: any) {
    console.error('❌ Error updating contract:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update contract',
      error: error.message,
    });
  }
};

// Approve a contract
export const approveContract = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const contract = await prisma.contract.findUnique({
      where: { id },
    });

    if (!contract) {
      res.status(404).json({
        success: false,
        message: 'Contract not found',
      });
      return;
    }

    const updatedContract = await prisma.contract.update({
      where: { id },
      data: {
        approvedBy: req.user?.id || null,
        approvedAt: new Date(),
        status: ContractStatus.PENDING_SIGNATURE,
      },
      include: {
        approver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    console.log('✅ Contract approved:', updatedContract.referenceNumber);

    res.json({
      success: true,
      data: updatedContract,
      message: 'Contract approved successfully',
    });
  } catch (error: any) {
    console.error('❌ Error approving contract:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve contract',
      error: error.message,
    });
  }
};

// Delete a contract
export const deleteContract = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const contract = await prisma.contract.findUnique({
      where: { id },
    });

    if (!contract) {
      res.status(404).json({
        success: false,
        message: 'Contract not found',
      });
      return;
    }

    await prisma.contract.delete({
      where: { id },
    });

    console.log('✅ Contract deleted:', contract.referenceNumber);

    res.json({
      success: true,
      message: 'Contract deleted successfully',
    });
  } catch (error: any) {
    console.error('❌ Error deleting contract:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete contract',
      error: error.message,
    });
  }
};

// Load Out: Create project from contract
export const loadOutContract = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const userRole = req.user?.role;
    const userEmail = req.user?.email;

    // Employee role: Cannot create projects
    if (userRole === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to create projects. Please contact your manager.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    // Fetch contract with all details including location fields
    const contract = await prisma.contract.findUnique({
      where: { id },
      select: {
        id: true,
        referenceNumber: true,
        title: true,
        description: true,
        contractType: true,
        contractCategory: true,
        status: true,
        clientId: true,
        projectId: true,
        developerName: true,
        projectManager: true,
        startDate: true,
        endDate: true,
        assignedManagerId: true,
        assignedManagerEmail: true,
        assignedManager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        // Location fields
        makaniNumber: true,
        latitude: true,
        longitude: true,
        region: true,
        plotNumber: true,
        community: true,
        numberOfFloors: true,
        // Additional fields
        specialClauses: true,
        termsAndConditions: true,
        paymentTerms: true,
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
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
            status: true,
          },
        },
      },
    });

    if (!contract) {
      res.status(404).json({
        success: false,
        message: 'Contract not found',
      });
      return;
    }

    // STRICT ROLE-BASED ACCESS CONTROL for load out
    if (userRole === 'ADMIN' || userRole === 'HR' || userRole === 'PROJECT_MANAGER') {
      // Admin, HR, and PROJECT_MANAGER can load out any contract
    } else if (userRole === 'MANAGER') {
      // Manager: Can only load out contracts assigned to them
      if (!userEmail || !req.user?.id) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: Manager email or ID not found in session',
          code: 'ACCESS_DENIED',
        });
        return;
      }
      // Check both assignedManagerEmail and assignedManagerId
      if (contract.assignedManagerEmail !== userEmail && 
          contract.assignedManagerId !== req.user.id) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: You can only load out contracts assigned to you',
          code: 'ACCESS_DENIED',
        });
        return;
      }
    } else {
      // Other roles: No access
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to load out contracts',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    // Allow loading out contracts multiple times - just log if already linked
    if (contract.projectId && contract.project) {
      console.log(`ℹ️ Contract ${contract.referenceNumber} already linked to project ${contract.project.referenceNumber}. Creating new project anyway.`);
    }

    // Use contract reference number as project reference number
    // If a project with this reference number already exists, append a suffix
    const baseReferenceNumber = contract.referenceNumber;
    let projectReferenceNumber: string = baseReferenceNumber;
    let suffix = 1;

    // Check if project with base reference number exists, if so, append suffix
    while (true) {
      const existingProject = await prisma.project.findUnique({
        where: { referenceNumber: projectReferenceNumber },
      });

      if (!existingProject) {
        // This reference number is available, use it
        break;
      }

      // Append suffix to make it unique (e.g., "7896-1", "7896-2")
      projectReferenceNumber = `${baseReferenceNumber}-${suffix}`;
      suffix++;

      // Safety check to prevent infinite loop
      if (suffix > 1000) {
        // Fallback to timestamp-based suffix if too many attempts
        const timestamp = Date.now().toString(36).toUpperCase().substring(0, 6);
        projectReferenceNumber = `${baseReferenceNumber}-${timestamp}`;
        break;
      }
    }

    if (suffix > 1) {
      console.log(`ℹ️ Project with reference number ${baseReferenceNumber} already exists. Using: ${projectReferenceNumber}`);
    }

    // Calculate plan days from contract dates if available
    let planDays: number | null = null;
    if (contract.startDate && contract.endDate) {
      const start = new Date(contract.startDate);
      const end = new Date(contract.endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      planDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
    }

    // Map contract fields to project fields
    const projectName = contract.title || `Project ${contract.referenceNumber}`;
    // Prefer assigned manager's name so project shows correct PM (e.g. muffazzal not mohammednazar)
    const contractWithManager = contract as typeof contract & { assignedManager?: { firstName: string; lastName: string } | null };
    const projectManager = (contractWithManager.assignedManager
      ? `${contractWithManager.assignedManager.firstName} ${contractWithManager.assignedManager.lastName}`.trim().substring(0, 100)
      : null)
      || (contract.projectManager ? contract.projectManager.trim().substring(0, 100) : null)
      || (contract.creator ? `${contract.creator.firstName} ${contract.creator.lastName}`.trim().substring(0, 100) : null);

    // Build location string from coordinates or makani number
    let locationString: string | null = null;
    if (contract.makaniNumber) {
      locationString = contract.makaniNumber;
    } else if (contract.latitude && contract.longitude) {
      locationString = `${contract.latitude}, ${contract.longitude}`;
    }

    // Create project from contract data
    const project = await prisma.$transaction(async (tx) => {
      const projectNumber = await computeNextProjectNumber(tx as any);
      return tx.project.create({
        data: {
          projectNumber,
          name: projectName,
          referenceNumber: projectReferenceNumber,
          pin: null, // Can be set later if needed
          clientId: contract.clientId || null,
          owner: contract.developerName || null,
          description: contract.description || null,
          status: 'OPEN', // Default status
          projectManager: projectManager,
          startDate: contract.startDate ? new Date(contract.startDate) : null,
          endDate: contract.endDate ? new Date(contract.endDate) : null,
          deadline: contract.endDate ? new Date(contract.endDate) : null, // Use end date as deadline
          planDays: planDays,
          remarks: contract.specialClauses || contract.termsAndConditions || null,
          assigneeNotes: contract.paymentTerms || null,
          // Location & Project Details from contract
          location: locationString,
          makaniNumber: contract.makaniNumber || null,
          plotNumber: contract.plotNumber || null,
          community: contract.community || null,
          projectType: contract.contractType || null,
          projectFloor: contract.numberOfFloors ? contract.numberOfFloors.toString() : null,
          developerProject: contract.developerName || null,
          createdBy: req.user?.id || null,
        },
        include: {
          client: true,
          contracts: {
            select: {
              id: true,
              referenceNumber: true,
              title: true,
            },
          },
        },
      });
    }, { isolationLevel: 'Serializable' as any });

    // Link contract to the created project
    await prisma.contract.update({
      where: { id: contract.id },
      data: { projectId: project.id },
    });

    console.log(`✅ Load Out successful: Contract ${contract.referenceNumber} → Project ${project.referenceNumber}`);

    res.json({
      success: true,
      message: `Project ${project.referenceNumber} created successfully from contract ${contract.referenceNumber}`,
      data: {
        project: {
          id: project.id,
          referenceNumber: project.referenceNumber,
          name: project.name,
          status: project.status,
          clientId: project.clientId,
          clientName: project.client?.name || null,
          // Location & Project Details (now stored in project)
          location: project.location || null,
          makaniNumber: project.makaniNumber || null,
          plotNumber: project.plotNumber || null,
          community: project.community || null,
          projectType: project.projectType || null,
          projectFloor: project.projectFloor || null,
          developerProject: project.developerProject || null,
        },
        contract: {
          id: contract.id,
          referenceNumber: contract.referenceNumber,
          title: contract.title,
          // Include full contract data for frontend reference
          plotNumber: contract.plotNumber,
          community: contract.community,
          contractType: contract.contractType,
          numberOfFloors: contract.numberOfFloors,
          makaniNumber: contract.makaniNumber,
          developerName: contract.developerName,
        },
      },
    });
  } catch (error: any) {
    console.error('❌ Error loading out contract:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create project from contract',
      error: error.message,
    });
  }
};

// Bulk Load Out: Create multiple projects from multiple contracts
export const bulkLoadOutContracts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractIds } = req.body;

    const userRole = req.user?.role;
    const userEmail = req.user?.email;

    // Employee role: Cannot create projects
    if (userRole === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to create projects. Please contact your manager.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    // Validate input
    if (!contractIds || !Array.isArray(contractIds) || contractIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Contract IDs array is required and must not be empty',
      });
      return;
    }

    const results: any[] = [];
    const errors: any[] = [];

    // Process each contract
    for (const contractId of contractIds) {
      try {
        // Fetch contract with all details
        const contract = await prisma.contract.findUnique({
          where: { id: contractId },
          select: {
            id: true,
            referenceNumber: true,
            title: true,
            description: true,
            contractType: true,
            contractCategory: true,
            status: true,
            clientId: true,
            projectId: true,
            developerName: true,
            projectManager: true,
            startDate: true,
            endDate: true,
            assignedManagerId: true,
            assignedManagerEmail: true,
            assignedManager: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            makaniNumber: true,
            latitude: true,
            longitude: true,
            region: true,
            plotNumber: true,
            community: true,
            numberOfFloors: true,
            specialClauses: true,
            termsAndConditions: true,
            paymentTerms: true,
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
                email: true,
              },
            },
            project: {
              select: {
                id: true,
                name: true,
                referenceNumber: true,
                status: true,
              },
            },
          },
        });

        if (!contract) {
          errors.push({
            contractId,
            message: 'Contract not found',
          });
          continue;
        }

        // STRICT ROLE-BASED ACCESS CONTROL for bulk load out
        if (userRole === 'ADMIN' || userRole === 'HR' || userRole === 'PROJECT_MANAGER') {
          // Admin, HR, and PROJECT_MANAGER can load out any contract
        } else if (userRole === 'MANAGER') {
          // Manager: Can only load out contracts assigned to them
          if (!userEmail || !req.user?.id) {
            errors.push({
              contractId,
              message: 'Access Denied: Manager email or ID not found in session',
            });
            continue;
          }
          // Check both assignedManagerEmail and assignedManagerId
          if (contract.assignedManagerEmail !== userEmail && 
              contract.assignedManagerId !== req.user.id) {
            errors.push({
              contractId,
              message: `Access Denied: Contract ${contract.referenceNumber} is not assigned to you`,
            });
            continue;
          }
        } else {
          errors.push({
            contractId,
            message: 'Access Denied: You do not have permission to load out contracts',
          });
          continue;
        }

        // Allow loading out contracts multiple times - just log if already linked
        if (contract.projectId && contract.project) {
          console.log(`ℹ️ Contract ${contract.referenceNumber} already linked to project ${contract.project.referenceNumber}. Creating new project anyway.`);
        }

        // Use contract reference number as project reference number
        // If a project with this reference number already exists, append a suffix
        const baseReferenceNumber = contract.referenceNumber;
        let projectReferenceNumber: string = baseReferenceNumber;
        let suffix = 1;

        // Check if project with base reference number exists, if so, append suffix
        while (true) {
          const existingProject = await prisma.project.findUnique({
            where: { referenceNumber: projectReferenceNumber },
          });

          if (!existingProject) {
            // This reference number is available, use it
            break;
          }

          // Append suffix to make it unique (e.g., "7896-1", "7896-2")
          projectReferenceNumber = `${baseReferenceNumber}-${suffix}`;
          suffix++;

          // Safety check to prevent infinite loop
          if (suffix > 1000) {
            // Fallback to timestamp-based suffix if too many attempts
            const timestamp = Date.now().toString(36).toUpperCase().substring(0, 6);
            projectReferenceNumber = `${baseReferenceNumber}-${timestamp}`;
            break;
          }
        }

        if (suffix > 1) {
          console.log(`ℹ️ Project with reference number ${baseReferenceNumber} already exists. Using: ${projectReferenceNumber}`);
        }

        // Calculate plan days
        let planDays: number | null = null;
        if (contract.startDate && contract.endDate) {
          const start = new Date(contract.startDate);
          const end = new Date(contract.endDate);
          const diffTime = Math.abs(end.getTime() - start.getTime());
          planDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        }

        // Map contract fields to project fields
        const projectName = contract.title || `Project ${contract.referenceNumber}`;
        const contractWithManager = contract as typeof contract & { assignedManager?: { firstName: string; lastName: string } | null };
        const projectManager = (contractWithManager.assignedManager
          ? `${contractWithManager.assignedManager.firstName} ${contractWithManager.assignedManager.lastName}`.trim().substring(0, 100)
          : null)
          || (contract.projectManager ? contract.projectManager.trim().substring(0, 100) : null)
          || (contract.creator ? `${contract.creator.firstName} ${contract.creator.lastName}`.trim().substring(0, 100) : null);

        // Build location string
        let locationString: string | null = null;
        if (contract.makaniNumber) {
          locationString = contract.makaniNumber;
        } else if (contract.latitude && contract.longitude) {
          locationString = `${contract.latitude}, ${contract.longitude}`;
        }

        // Create project from contract data
        const project = await prisma.$transaction(async (tx) => {
          const projectNumber = await computeNextProjectNumber(tx as any);
          return tx.project.create({
            data: {
              projectNumber,
              name: projectName,
              referenceNumber: projectReferenceNumber,
              pin: null,
              clientId: contract.clientId || null,
              owner: contract.developerName || null,
              description: contract.description || null,
              status: 'OPEN', // Default status = Active
              projectManager: projectManager,
              startDate: contract.startDate ? new Date(contract.startDate) : null,
              endDate: contract.endDate ? new Date(contract.endDate) : null,
              deadline: contract.endDate ? new Date(contract.endDate) : null,
              planDays: planDays,
              remarks: contract.specialClauses || contract.termsAndConditions || null,
              assigneeNotes: contract.paymentTerms || null,
              location: locationString,
              makaniNumber: contract.makaniNumber || null,
              plotNumber: contract.plotNumber || null,
              community: contract.community || null,
              projectType: contract.contractType || null,
              projectFloor: contract.numberOfFloors ? contract.numberOfFloors.toString() : null,
              developerProject: contract.developerName || null,
              createdBy: req.user?.id || null,
            },
            include: {
              client: true,
            },
          });
        }, { isolationLevel: 'Serializable' as any });

        // Link contract to the created project
        await prisma.contract.update({
          where: { id: contract.id },
          data: { projectId: project.id },
        });

        results.push({
          contractId: contract.id,
          contractReference: contract.referenceNumber,
          projectId: project.id,
          projectReference: project.referenceNumber,
          projectName: project.name,
          success: true,
        });

        console.log(`✅ Load Out successful: Contract ${contract.referenceNumber} → Project ${project.referenceNumber}`);
      } catch (error: any) {
        console.error(`❌ Error loading out contract ${contractId}:`, error);
        errors.push({
          contractId,
          message: error.message || 'Failed to create project from contract',
        });
      }
    }

    // Return results
    res.json({
      success: errors.length === 0,
      message: `Processed ${contractIds.length} contract(s). ${results.length} successful, ${errors.length} failed.`,
      data: {
        successful: results,
        failed: errors,
        totalProcessed: contractIds.length,
        totalSuccessful: results.length,
        totalFailed: errors.length,
      },
    });
  } catch (error: any) {
    console.error('❌ Error in bulk load out:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process bulk load out',
      error: error.message,
    });
  }
};

// Get contract statistics
export const getContractStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stats = await prisma.contract.groupBy({
      by: ['status'],
      _count: {
        id: true,
      },
    });

    const total = await prisma.contract.count();
    const active = await prisma.contract.count({
      where: { status: ContractStatus.ACTIVE },
    });
    const expired = await prisma.contract.count({
      where: { status: ContractStatus.EXPIRED },
    });
    const draft = await prisma.contract.count({
      where: { status: ContractStatus.DRAFT },
    });

    const statsMap: Record<string, number> = {};
    stats.forEach((stat) => {
      statsMap[stat.status] = stat._count.id;
    });

    // Recent contract reference numbers for display in statistics section
    const recentContracts = await prisma.contract.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: { referenceNumber: true },
    });
    const recentReferenceNumbers = recentContracts.map((c) => c.referenceNumber);

    res.json({
      success: true,
      data: {
        total,
        active,
        expired,
        draft,
        byStatus: statsMap,
        recentReferenceNumbers,
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching contract stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contract statistics',
      error: error.message,
    });
  }
};

/**
 * Get all managers for dropdown selection
 * GET /api/contracts/managers
 * Returns users with MANAGER, PROJECT_MANAGER, or ADMIN role (all can be assigned as project managers)
 */
export const getManagers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, companyId } = req.query;

    // Build where clause - MANAGER, PROJECT_MANAGER, or ADMIN role, active users
    const where: any = {
      isActive: true,
      role: {
        in: ['MANAGER', 'PROJECT_MANAGER', 'ADMIN'] as UserRole[],
      },
    };

    // Build AND conditions array for combining filters
    const andConditions: any[] = [];

    // Filter by company if companyId is provided
    if (companyId && typeof companyId === 'string' && companyId.trim()) {
      try {
        // Look up the company name from companyId
        const company = await prisma.company.findUnique({
          where: { id: companyId.trim() },
          select: { name: true },
        });

        if (company) {
          const companyName = company.name.trim();
          
          // If "ONIX ENGINEERING CONSULTANCY" is selected, exclude managers from "onix" company
          if (companyName.toLowerCase() === 'onix engineering consultancy') {
            // Include managers from "ONIX ENGINEERING CONSULTANCY" or null/empty company
            // AND exclude managers whose company field is "onix" (case-insensitive)
            andConditions.push({
              AND: [
                {
                  OR: [
                    { company: { equals: companyName, mode: 'insensitive' } },
                    { company: null },
                    { company: '' },
                  ],
                },
                {
                  NOT: {
                    company: {
                      equals: 'onix',
                      mode: 'insensitive',
                    },
                  },
                },
              ],
            });
          } else {
            // For other companies, filter by exact company name match (case-insensitive)
            andConditions.push({
              OR: [
                { company: { equals: companyName, mode: 'insensitive' } },
                { company: null },
                { company: '' },
              ],
            });
          }
        }
      } catch (error) {
        console.error('Error looking up company:', error);
        // Continue without company filter if lookup fails
      }
    }

    // Add search filter if provided
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = search.trim();
      andConditions.push({
        OR: [
          { firstName: { contains: searchTerm, mode: 'insensitive' } },
          { lastName: { contains: searchTerm, mode: 'insensitive' } },
          { email: { contains: searchTerm, mode: 'insensitive' } },
        ],
      });
    }

    // Combine all AND conditions
    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    // Get managers
    const managers = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        department: true,
        position: true,
        jobTitle: true,
        photo: true,
        employeeId: true,
      },
      orderBy: [
        { firstName: 'asc' },
        { lastName: 'asc' },
      ],
    });

    res.json({
      success: true,
      data: managers,
      count: managers.length,
    });
  } catch (error: any) {
    console.error('❌ Error fetching managers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch managers',
      error: error.message,
    });
  }
};
