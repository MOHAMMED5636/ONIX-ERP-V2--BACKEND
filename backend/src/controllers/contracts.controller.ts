import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { ContractStatus } from '@prisma/client';

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
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

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

    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { referenceNumber: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
        { contractorName: { contains: search as string, mode: 'insensitive' } },
        { clientName: { contains: search as string, mode: 'insensitive' } },
      ];
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
      },
    });

    if (!contract) {
      res.status(404).json({
        success: false,
        message: 'Contract not found',
      });
      return;
    }

    res.json({
      success: true,
      data: contract,
    });
  } catch (error: any) {
    console.error('❌ Error fetching contract by reference number:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contract',
      error: error.message,
    });
  }
};

// Get a single contract by ID
export const getContractById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

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
      },
    });

    if (!contract) {
      res.status(404).json({
        success: false,
        message: 'Contract not found',
      });
      return;
    }

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
      // Note: referenceNumber is auto-generated, not taken from request
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

    // Generate reference number (always auto-generated, never from request)
    const referenceNumber = await generateReferenceNumber();
    console.log('✅ Generated reference number:', referenceNumber);

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

    res.json({
      success: true,
      data: {
        total,
        active,
        expired,
        draft,
        byStatus: statsMap,
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
