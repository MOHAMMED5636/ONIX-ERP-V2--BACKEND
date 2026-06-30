import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  ensureProjectWriteAllowed,
  PROJECT_SUSPENDED_MESSAGE,
} from '../utils/project-suspension';

function resolveDocumentAbsolutePath(filePath: string | null | undefined): string | null {
  if (!filePath || !String(filePath).trim()) return null;
  const raw = String(filePath).trim();
  return path.isAbsolute(raw) ? path.normalize(raw) : path.join(process.cwd(), raw.replace(/^[/\\]+/, ''));
}

async function removeDocumentFileFromDisk(filePath: string | null | undefined): Promise<void> {
  const abs = resolveDocumentAbsolutePath(filePath);
  if (!abs) return;
  try {
    await fs.unlink(abs);
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code !== 'ENOENT') {
      console.warn('Could not remove document file from disk:', abs, err);
    }
  }
}

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
    const { projectId, module, documentType, entityCode } = req.query;

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

    if (entityCode) {
      where.entityCode = entityCode as string;
    }

    // Visibility rule:
    // - EMPLOYEE can only see documents they uploaded (their own tasks/projects)
    // - Admin/Manager/HR roles can see all matching documents
    if (req.user?.role === 'EMPLOYEE' && req.user.id) {
      where.uploadedBy = req.user.id;
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
 * Download a document file
 * GET /api/documents/:id/download
 */
export const downloadDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      res.status(404).json({
        success: false,
        message: 'Document not found',
      });
      return;
    }

    if (req.user?.role === 'EMPLOYEE') {
      if (!document.uploadedBy || document.uploadedBy !== req.user.id) {
        res.status(403).json({
          success: false,
          message: 'You can only download documents you uploaded.',
        });
        return;
      }
    }

    const absolutePath = resolveDocumentAbsolutePath(document.filePath || document.fileUrl);
    if (!absolutePath) {
      res.status(404).json({
        success: false,
        message: 'Document file is missing',
      });
      return;
    }

    try {
      await fs.access(absolutePath);
    } catch {
      res.status(404).json({
        success: false,
        message: 'Document file not found on disk',
      });
      return;
    }

    const downloadName = String(document.fileName || `document-${document.id}`).replace(/[\\/:*?"<>|]+/g, '-');

    res.download(absolutePath, downloadName, (error) => {
      if (!error) return;
      console.error('Download document error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Failed to download document',
          error: error.message,
        });
      }
    });
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download document',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Update document metadata (e.g. expiry date)
 * PATCH /api/documents/:id
 */
export const patchDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { expiresAt } = req.body as { expiresAt?: string | null };

    if (expiresAt === undefined) {
      res.status(400).json({
        success: false,
        message: 'No updatable fields provided (expected expiresAt)',
      });
      return;
    }

    const existing = await prisma.document.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Document not found',
      });
      return;
    }

    try {
      await ensureProjectWriteAllowed(existing.projectId ?? null, req.user, prisma);
    } catch (error: any) {
      if (error?.code === 'PROJECT_SUSPENDED') {
        res.status(error.statusCode || 423).json({
          success: false,
          message: PROJECT_SUSPENDED_MESSAGE,
          code: 'PROJECT_SUSPENDED',
        });
        return;
      }
      throw error;
    }

    if (req.user?.role === 'EMPLOYEE') {
      if (!existing.uploadedBy || existing.uploadedBy !== req.user.id) {
        res.status(403).json({
          success: false,
          message: 'You can only update documents you uploaded.',
        });
        return;
      }
    }

    let expiresAtDate: Date | null = null;
    if (expiresAt !== null && expiresAt !== '') {
      const parsed = new Date(expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid expiresAt date',
        });
        return;
      }
      expiresAtDate = parsed;
    }

    const document = await prisma.document.update({
      where: { id },
      data: { expiresAt: expiresAtDate },
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

    res.json({
      success: true,
      message: 'Document updated',
      data: document,
    });
  } catch (error) {
    console.error('Patch document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update document',
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

    try {
      await ensureProjectWriteAllowed(projectId || null, req.user, prisma);
    } catch (error: any) {
      if (error?.code === 'PROJECT_SUSPENDED') {
        res.status(error.statusCode || 423).json({
          success: false,
          message: PROJECT_SUSPENDED_MESSAGE,
          code: 'PROJECT_SUSPENDED',
        });
        return;
      }
      throw error;
    }

    // Validate required fields - make them optional for now to allow simple uploads
    // If not provided, use defaults
    const docModule = module || 'GEN';
    const docType = documentType || 'OTHER';
    const docYear = year ? parseInt(year) : new Date().getFullYear();
    // Placeholder "XXX" from the UI is not unique — each upload needs a distinct reference code.
    let docSequence = sequence != null && String(sequence).trim() !== '' ? String(sequence).trim() : String(Date.now());
    if (/^xxx$/i.test(docSequence)) {
      docSequence = String(Date.now());
    }

    console.log('   Document metadata:', {
      module: docModule,
      documentType: docType,
      year: docYear,
      sequence: docSequence,
      projectId: projectId || 'none',
    });

    let referenceCode = generateReferenceCode(docModule, docType, docYear, docSequence);
    let existing = await prisma.document.findUnique({
      where: { referenceCode },
    });
    let bump = 0;
    while (existing && bump < 20) {
      bump += 1;
      docSequence = `${Date.now()}-${bump}`;
      referenceCode = generateReferenceCode(docModule, docType, docYear, docSequence);
      existing = await prisma.document.findUnique({
        where: { referenceCode },
      });
    }

    if (existing) {
      res.status(500).json({
        success: false,
        message: 'Could not generate a unique document reference. Try again.',
      });
      return;
    }

    console.log('   Generated reference code:', referenceCode);

    const entityKey = String(entityCode ?? '').trim();

    const document = await prisma.document.create({
      data: {
        module: docModule,
        entityCode: entityKey,
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

    try {
      await ensureProjectWriteAllowed(document.projectId ?? null, req.user, prisma);
    } catch (error: any) {
      if (error?.code === 'PROJECT_SUSPENDED') {
        res.status(error.statusCode || 423).json({
          success: false,
          message: PROJECT_SUSPENDED_MESSAGE,
          code: 'PROJECT_SUSPENDED',
        });
        return;
      }
      throw error;
    }

    const role = String(req.user?.role || '');
    const canDeleteAnyDocument = ['ADMIN', 'HR', 'PROJECT_MANAGER', 'SUPER_ADMIN', 'MANAGER'].includes(role);

    if (!canDeleteAnyDocument) {
      if (!document.uploadedBy || document.uploadedBy !== req.user?.id) {
        res.status(403).json({
          success: false,
          message: 'Access Denied: You can only delete documents you uploaded.',
          code: 'ACCESS_DENIED',
        });
        return;
      }
    }

    await removeDocumentFileFromDisk(document.filePath);

    // Delete the document record
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

