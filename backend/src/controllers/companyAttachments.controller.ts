import fs from 'fs';
import path from 'path';
import { Response } from 'express';
import { CompanyAttachmentCategory } from '@prisma/client';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

const CATEGORY_SET = new Set<string>(Object.values(CompanyAttachmentCategory));

function publicPathForStoredFile(filename: string): string {
  return `/uploads/company-attachments/${filename}`;
}

function parseOptionalDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * GET /api/companies/:id/attachments
 */
export const listCompanyAttachments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: companyId } = req.params;

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) {
      res.status(404).json({ success: false, message: 'Company not found' });
      return;
    }

    const data = await prisma.companyAttachment.findMany({
      where: { companyId },
      orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('listCompanyAttachments error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /api/companies/:id/attachments
 * multipart: file, category, optional label
 */
export const createCompanyAttachment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: companyId } = req.params;
    const file = req.file;
    const categoryRaw = (req.body?.category as string | undefined)?.trim();
    const label = (req.body?.label as string | undefined)?.trim() || null;
    const expiresAt = parseOptionalDate(req.body?.expiresAt);

    if (!file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    if (!categoryRaw || !CATEGORY_SET.has(categoryRaw)) {
      res.status(400).json({ success: false, message: 'Invalid or missing category' });
      return;
    }

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      res.status(404).json({ success: false, message: 'Company not found' });
      return;
    }

    const category = categoryRaw as CompanyAttachmentCategory;
    const filePath = publicPathForStoredFile(file.filename);

    const row = await prisma.companyAttachment.create({
      data: {
        companyId,
        category,
        fileName: file.originalname,
        filePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        label,
        expiresAt,
        uploadedById: req.user?.id ?? null,
      },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    res.status(201).json({ success: true, data: row });
  } catch (error) {
    console.error('createCompanyAttachment error:', error);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
    }
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PATCH /api/companies/:id/attachments/:attachmentId
 * Body: { expiresAt?: string | null, label?: string }
 */
export const updateCompanyAttachment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: companyId, attachmentId } = req.params;
    const expiresAtRaw = req.body?.expiresAt;
    const labelRaw = req.body?.label;

    const row = await prisma.companyAttachment.findFirst({
      where: { id: attachmentId, companyId },
    });
    if (!row) {
      res.status(404).json({ success: false, message: 'Attachment not found' });
      return;
    }

    const data: { expiresAt?: Date | null; label?: string | null } = {};
    if (expiresAtRaw !== undefined) {
      data.expiresAt = parseOptionalDate(expiresAtRaw);
    }
    if (labelRaw !== undefined) {
      data.label = typeof labelRaw === 'string' && labelRaw.trim() ? labelRaw.trim() : null;
    }

    if (!Object.keys(data).length) {
      res.status(400).json({ success: false, message: 'No updatable fields provided' });
      return;
    }

    const updated = await prisma.companyAttachment.update({
      where: { id: attachmentId },
      data,
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('updateCompanyAttachment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * DELETE /api/companies/:id/attachments/:attachmentId
 */
export const deleteCompanyAttachment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: companyId, attachmentId } = req.params;

    const row = await prisma.companyAttachment.findFirst({
      where: { id: attachmentId, companyId },
    });

    if (!row) {
      res.status(404).json({ success: false, message: 'Attachment not found' });
      return;
    }

    await prisma.companyAttachment.delete({ where: { id: attachmentId } });

    const rel = row.filePath.replace(/^\//, '');
    const abs = path.join(process.cwd(), rel);
    if (fs.existsSync(abs)) {
      try {
        fs.unlinkSync(abs);
      } catch (e) {
        console.warn('deleteCompanyAttachment: could not remove file', abs, e);
      }
    }

    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    console.error('deleteCompanyAttachment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
