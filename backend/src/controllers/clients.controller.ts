import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// Generate unique reference number for client
async function generateReferenceNumber(): Promise<string> {
  const prefix = 'O-CL-';
  let referenceNumber: string;
  let exists = true;
  let attempts = 0;
  const maxAttempts = 100;

  while (exists && attempts < maxAttempts) {
    // Generate a random alphanumeric string (8 characters)
    const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
    referenceNumber = `${prefix}${randomPart}`;

    // Check if it already exists
    const existing = await prisma.client.findUnique({
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

// Get all clients with filters
export const getAllClients = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      search,
      type, // isCorporate filter
      leadSource,
      rank,
      page = '1',
      limit = '50',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { referenceNumber: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (type) {
      where.isCorporate = type as string;
    }

    if (leadSource) {
      where.leadSource = leadSource as string;
    }

    if (rank) {
      where.rank = rank as string;
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: {
          [sortBy as string]: sortOrder as 'asc' | 'desc',
        },
        include: {
          _count: {
            select: {
              projects: true,
              tenders: true,
            },
          },
        },
      }),
      prisma.client.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        clients,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching clients:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch clients',
      error: error.message,
    });
  }
};

// Get client statistics
export const getClientStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [totalClients, clientsByType, clientsBySource, clientsByRank] = await Promise.all([
      prisma.client.count(),
      prisma.client.groupBy({
        by: ['isCorporate'],
        _count: {
          id: true,
        },
      }),
      prisma.client.groupBy({
        by: ['leadSource'],
        _count: {
          id: true,
        },
        where: {
          leadSource: {
            not: null,
          },
        },
      }),
      prisma.client.groupBy({
        by: ['rank'],
        _count: {
          id: true,
        },
        where: {
          rank: {
            not: null,
          },
        },
      }),
    ]);

    // Transform data for frontend
    const statsByType: Record<string, number> = {};
    clientsByType.forEach((item) => {
      const key = item.isCorporate || 'Unknown';
      statsByType[key] = item._count.id;
    });

    const statsBySource: Record<string, number> = {};
    clientsBySource.forEach((item) => {
      const key = item.leadSource || 'Unknown';
      statsBySource[key] = item._count.id;
    });

    const statsByRank: Record<string, number> = {};
    clientsByRank.forEach((item) => {
      const key = item.rank || 'Unknown';
      statsByRank[key] = item._count.id;
    });

    res.json({
      success: true,
      data: {
        totalClients,
        byType: statsByType,
        bySource: statsBySource,
        byRank: statsByRank,
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching client statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch client statistics',
      error: error.message,
    });
  }
};

// Get a single client by ID
export const getClientById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        projects: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
            status: true,
            createdAt: true,
          },
          take: 10,
          orderBy: {
            createdAt: 'desc',
          },
        },
        tenders: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
            status: true,
            createdAt: true,
          },
          take: 10,
          orderBy: {
            createdAt: 'desc',
          },
        },
        _count: {
          select: {
            projects: true,
            tenders: true,
          },
        },
      },
    });

    if (!client) {
      res.status(404).json({
        success: false,
        message: 'Client not found',
      });
      return;
    }

    res.json({
      success: true,
      data: client,
    });
  } catch (error: any) {
    console.error('❌ Error fetching client:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch client',
      error: error.message,
    });
  }
};

// Create a new client
export const createClient = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      name,
      isCorporate,
      leadSource,
      rank,
      email,
      phone,
      address,
      nationality,
      idNumber,
      idExpiryDate,
      passportNumber,
      birthDate,
      documentType,
    } = req.body;

    // Validation
    if (!name || !name.trim()) {
      res.status(400).json({
        success: false,
        message: 'Client name is required',
      });
      return;
    }

    if (!isCorporate) {
      res.status(400).json({
        success: false,
        message: 'Client type (Person/Company) is required',
      });
      return;
    }

    // Generate reference number
    const referenceNumber = await generateReferenceNumber();

    // Handle document upload (field name: 'document')
    let documentAttachment: string | null = null;
    if (req.file) {
      documentAttachment = `/uploads/documents/${req.file.filename}`;
      console.log('📄 Client document uploaded:', {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        filename: req.file.filename,
        path: documentAttachment,
        size: req.file.size,
      });
    }

    // Parse dates
    let parsedBirthDate: Date | null = null;
    let parsedIdExpiryDate: Date | null = null;

    if (birthDate) {
      parsedBirthDate = new Date(birthDate);
      if (isNaN(parsedBirthDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid birth date format',
        });
        return;
      }
    }

    if (idExpiryDate) {
      parsedIdExpiryDate = new Date(idExpiryDate);
      if (isNaN(parsedIdExpiryDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid ID expiry date format',
        });
        return;
      }
    }

    // Create client
    const client = await prisma.client.create({
      data: {
        referenceNumber,
        name: name.trim(),
        isCorporate,
        leadSource: leadSource || null,
        rank: rank || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        nationality: nationality || null,
        idNumber: idNumber?.trim() || null,
        idExpiryDate: parsedIdExpiryDate,
        passportNumber: passportNumber?.trim() || null,
        birthDate: parsedBirthDate,
        documentType: documentType || null,
        documentAttachment,
      },
      include: {
        _count: {
          select: {
            projects: true,
            tenders: true,
          },
        },
      },
    });

    console.log('✅ Client created:', client.referenceNumber);

    res.status(201).json({
      success: true,
      data: client,
      message: 'Client created successfully',
    });
  } catch (error: any) {
    console.error('❌ Error creating client:', error);

    // Handle unique constraint violations
    if (error.code === 'P2002') {
      res.status(400).json({
        success: false,
        message: 'A client with this reference number already exists',
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create client',
      error: error.message,
    });
  }
};

// Update a client
export const updateClient = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      name,
      isCorporate,
      leadSource,
      rank,
      email,
      phone,
      address,
      nationality,
      idNumber,
      idExpiryDate,
      passportNumber,
      birthDate,
      documentType,
    } = req.body;

    // Check if client exists
    const existingClient = await prisma.client.findUnique({
      where: { id },
    });

    if (!existingClient) {
      res.status(404).json({
        success: false,
        message: 'Client not found',
      });
      return;
    }

    // Handle document upload (if new file is uploaded)
    let documentAttachment = existingClient.documentAttachment;
    if (req.file) {
      documentAttachment = `/uploads/documents/${req.file.filename}`;
      console.log('📄 Client document updated:', {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        filename: req.file.filename,
        path: documentAttachment,
        size: req.file.size,
      });
    }

    // Parse dates
    let parsedBirthDate: Date | null | undefined = undefined;
    let parsedIdExpiryDate: Date | null | undefined = undefined;

    if (birthDate !== undefined) {
      if (birthDate === null || birthDate === '') {
        parsedBirthDate = null;
      } else {
        parsedBirthDate = new Date(birthDate);
        if (isNaN(parsedBirthDate.getTime())) {
          res.status(400).json({
            success: false,
            message: 'Invalid birth date format',
          });
          return;
        }
      }
    }

    if (idExpiryDate !== undefined) {
      if (idExpiryDate === null || idExpiryDate === '') {
        parsedIdExpiryDate = null;
      } else {
        parsedIdExpiryDate = new Date(idExpiryDate);
        if (isNaN(parsedIdExpiryDate.getTime())) {
          res.status(400).json({
            success: false,
            message: 'Invalid ID expiry date format',
          });
          return;
        }
      }
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (isCorporate !== undefined) updateData.isCorporate = isCorporate;
    if (leadSource !== undefined) updateData.leadSource = leadSource || null;
    if (rank !== undefined) updateData.rank = rank || null;
    if (email !== undefined) updateData.email = email?.trim() || null;
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (address !== undefined) updateData.address = address?.trim() || null;
    if (nationality !== undefined) updateData.nationality = nationality || null;
    if (idNumber !== undefined) updateData.idNumber = idNumber?.trim() || null;
    if (parsedIdExpiryDate !== undefined) updateData.idExpiryDate = parsedIdExpiryDate;
    if (passportNumber !== undefined) updateData.passportNumber = passportNumber?.trim() || null;
    if (parsedBirthDate !== undefined) updateData.birthDate = parsedBirthDate;
    if (documentType !== undefined) updateData.documentType = documentType || null;
    if (documentAttachment !== undefined) updateData.documentAttachment = documentAttachment;

    // Update client
    const updatedClient = await prisma.client.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: {
            projects: true,
            tenders: true,
          },
        },
      },
    });

    console.log('✅ Client updated:', updatedClient.referenceNumber);

    res.json({
      success: true,
      data: updatedClient,
      message: 'Client updated successfully',
    });
  } catch (error: any) {
    console.error('❌ Error updating client:', error);

    if (error.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'Client not found',
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update client',
      error: error.message,
    });
  }
};

// Delete a client
export const deleteClient = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if client exists
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            projects: true,
            tenders: true,
          },
        },
      },
    });

    if (!client) {
      res.status(404).json({
        success: false,
        message: 'Client not found',
      });
      return;
    }

    // Check if client has associated projects or tenders
    if (client._count.projects > 0 || client._count.tenders > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete client. Client has ${client._count.projects} project(s) and ${client._count.tenders} tender(s) associated.`,
      });
      return;
    }

    // Delete document file if exists
    if (client.documentAttachment) {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), client.documentAttachment);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log('📄 Deleted client document:', filePath);
        }
      } catch (fileError) {
        console.error('⚠️ Error deleting document file:', fileError);
        // Continue with client deletion even if file deletion fails
      }
    }

    // Delete client
    await prisma.client.delete({
      where: { id },
    });

    console.log('✅ Client deleted:', client.referenceNumber);

    res.json({
      success: true,
      message: 'Client deleted successfully',
    });
  } catch (error: any) {
    console.error('❌ Error deleting client:', error);

    if (error.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'Client not found',
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Failed to delete client',
      error: error.message,
    });
  }
};

// Delete all clients (admin only)
export const deleteAllClients = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get all clients first to handle document attachments
    const allClients = await prisma.client.findMany({
      select: {
        id: true,
        referenceNumber: true,
        documentAttachment: true,
      },
    });

    // Delete document files if they exist
    const fs = require('fs');
    const path = require('path');
    
    for (const client of allClients) {
      if (client.documentAttachment) {
        const filePath = path.join(process.cwd(), client.documentAttachment);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('📄 Deleted client document:', filePath);
          }
        } catch (fileError) {
          console.error('⚠️ Error deleting document file:', fileError);
          // Continue even if file deletion fails
        }
      }
    }

    // First, set clientId to null in all projects and tenders
    await Promise.all([
      prisma.project.updateMany({
        where: {
          clientId: {
            not: null,
          },
        },
        data: {
          clientId: null,
        },
      }),
      prisma.tender.updateMany({
        where: {
          clientId: {
            not: null,
          },
        },
        data: {
          clientId: null,
        },
      }),
    ]);

    // Delete all clients
    const deleteResult = await prisma.client.deleteMany({});

    console.log(`✅ Deleted ${deleteResult.count} client(s)`);

    res.json({
      success: true,
      message: `Successfully deleted ${deleteResult.count} client(s)`,
      data: {
        deletedCount: deleteResult.count,
      },
    });
  } catch (error: any) {
    console.error('❌ Error deleting all clients:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete all clients',
      error: error.message,
    });
  }
};
