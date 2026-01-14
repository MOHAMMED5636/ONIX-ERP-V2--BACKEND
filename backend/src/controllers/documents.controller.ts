import { Request, Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Generate reference code for document
 */
const generateReferenceCode = (module: string, documentType: string, year: number, sequence: string): string => {
  return `${module}-${documentType}-${year}-${sequence}`;
};

/**
 * List all documents
 * GET /api/documents
 */
export const listDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, module, documentType } = req.query;

    const where: any = {};
    
    if (projectId) {
      where.projectId = projectId as string;
    }
    
    if (module) {
      where.module = module as string;
    }
    
    if (documentType) {
      where.documentType = documentType as string;
    }

    const documents = await prisma.document.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
          },
        },
      },
      orderBy: {
        uploadedAt: 'desc',
      },
    });

    res.json({
      success: true,
      data: documents,
      count: documents.length,
    });
  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch documents',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get a single document by ID
 * GET /api/documents/:id
 */
export const getDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const document = await prisma.document.findUnique({
      where: {
        id: id,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
          },
        },
      },
    });

    if (!document) {
      res.status(404).json({
        success: false,
        message: 'Document not found',
      });
      return;
    }

    res.json({
      success: true,
      data: document,
    });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch document',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Upload a new document
 * POST /api/documents/upload
 */
export const uploadDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('📄 Document upload request received');
    console.log('   User ID:', req.user?.id);
    console.log('   Has file:', !!req.file);
    console.log('   Request body:', req.body);
    
    const file = req.file;

    if (!file) {
      console.log('   ❌ No file uploaded');
      res.status(400).json({
        success: false,
        message: 'No file uploaded. Please select a file.',
      });
      return;
    }

    console.log('   File details:', {
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path
    });

    const { projectId, module, documentType, entityCode, year, sequence } = req.body;

    // Validate required fields - make them optional for now to allow simple uploads
    // If not provided, use defaults
    const docModule = module || 'GEN';
    const docType = documentType || 'OTHER';
    const docYear = year ? parseInt(year) : new Date().getFullYear();
    const docSequence = sequence || Date.now().toString();
    
    console.log('   Document metadata:', {
      module: docModule,
      documentType: docType,
      year: docYear,
      sequence: docSequence,
      projectId: projectId || 'none'
    });

    // Generate reference code
    const referenceCode = generateReferenceCode(
      docModule,
      docType,
      docYear,
      docSequence
    );
    
    console.log('   Generated reference code:', referenceCode);

    // Check if reference code already exists
    const existing = await prisma.document.findUnique({
      where: { referenceCode },
    });

    if (existing) {
      res.status(400).json({
        success: false,
        message: 'Document with this reference code already exists',
      });
      return;
    }

    const document = await prisma.document.create({
      data: {
        module: docModule,
        entityCode: entityCode || '',
        documentType: docType,
        year: docYear,
        sequence: docSequence,
        referenceCode,
        fileName: file.filename || file.originalname,
        filePath: file.path || `/uploads/documents/${file.filename}`,
        fileUrl: `/uploads/documents/${file.filename}`,
        fileSize: file.size,
        mimeType: file.mimetype,
        projectId: projectId || null,
        uploadedBy: req.user?.id || null,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
          },
        },
      },
    });

    console.log('   ✅ Document created successfully:', document.id);

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: document,
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload document',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Delete a document
 * DELETE /api/documents/:id
 */
export const deleteDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const document = await prisma.document.findUnique({
      where: {
        id: id,
      },
    });

    if (!document) {
      res.status(404).json({
        success: false,
        message: 'Document not found',
      });
      return;
    }

    // Delete the document
    await prisma.document.delete({
      where: {
        id: id,
      },
    });

    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete document',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

