import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import path from 'path';
import fs from 'fs';

function toDateOnly(d: Date | null | undefined): string | null {
  if (!d) return null;
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function creatorName(u: { firstName: string; lastName: string; email: string } | null): string {
  if (!u) return '—';
  const n = `${u.firstName || ''} ${u.lastName || ''}`.trim();
  return n || u.email || '—';
}

function shapePolicy(
  row: {
    id: string;
    title: string;
    description: string;
    department: string;
    fileName: string | null;
    filePath?: string | null;
    fileType: string;
    fileSize: string;
    isActive: boolean;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: { id: string; firstName: string; lastName: string; email: string } | null;
  },
  userId: string,
  ackMap: Map<string, Date>,
) {
  const ackAt = ackMap.get(row.id);
  const lastUpdated = toDateOnly(row.updatedAt) || toDateOnly(row.createdAt);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    department: row.department || 'General',
    /** Original uploaded filename (safe to expose; used for downloads / UI). */
    fileName: row.fileName || null,
    fileType: row.fileType || 'PDF',
    fileSize: row.fileSize || '—',
    hasFile: Boolean(row.filePath || row.fileName),
    lastUpdated,
    status: ackAt ? 'acknowledged' : 'pending',
    acknowledgedAt: ackAt ? toDateOnly(ackAt) : null,
    createdBy: {
      id: row.createdById || row.createdBy?.id || '—',
      name: creatorName(row.createdBy),
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isActive: row.isActive !== false,
  };
}

const MANAGE_ROLES = ['ADMIN', 'HR'];

function requirePolicyManager(role: string | undefined): boolean {
  return !!role && MANAGE_ROLES.includes(role);
}

function buildAckMap(acks: { policyId: string; acknowledgedAt: Date }[]): Map<string, Date> {
  const m = new Map<string, Date>();
  for (const a of acks) {
    m.set(a.policyId, a.acknowledgedAt);
  }
  return m;
}

export const listCompanyPolicies = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const rows = await prisma.companyPolicy.findMany({
      where: { isActive: true },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const acks = await prisma.companyPolicyAcknowledgement.findMany({
      where: { userId },
    });
    const ackMap = buildAckMap(acks);

    const policies = rows.map((r) => shapePolicy(r, userId, ackMap));
    res.json({ success: true, data: { policies } });
  } catch (e) {
    console.error('listCompanyPolicies', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const createCompanyPolicy = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requirePolicyManager(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Forbidden: only Admin and HR can create policies' });
      return;
    }
    const { title, description, department } = req.body || {};
    if (!title || !String(title).trim()) {
      res.status(400).json({ success: false, message: 'Title is required' });
      return;
    }
    if (!description || !String(description).trim()) {
      res.status(400).json({ success: false, message: 'Description is required' });
      return;
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    const originalName = file?.originalname ? String(file.originalname) : null;
    const filePath = file?.filename ?? null;
    const fileType = file?.mimetype
      ? file.mimetype === 'application/pdf'
        ? 'PDF'
        : originalName?.toLowerCase().endsWith('.docx')
          ? 'DOCX'
          : originalName?.toLowerCase().endsWith('.doc')
            ? 'DOC'
            : 'FILE'
      : 'PDF';
    const fileSize = file?.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : '—';

    const row = await prisma.companyPolicy.create({
      data: {
        title: String(title).trim(),
        description: String(description).trim(),
        department: department ? String(department).trim() : 'General',
        fileName: originalName,
        filePath,
        fileType,
        fileSize,
        createdById: req.user!.id,
        isActive: true,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    const policy = shapePolicy(row, req.user!.id, new Map());
    res.status(201).json({ success: true, data: { policy } });
  } catch (e) {
    console.error('createCompanyPolicy', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateCompanyPolicy = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requirePolicyManager(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    const { id } = req.params;
    const { title, description, department, fileName, fileType, fileSize, isActive } = req.body || {};

    const existing = await prisma.companyPolicy.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Policy not found' });
      return;
    }

    const row = await prisma.companyPolicy.update({
      where: { id },
      data: {
        ...(title != null && { title: String(title).trim() }),
        ...(description != null && { description: String(description).trim() }),
        ...(department != null && { department: String(department).trim() }),
        ...(fileName !== undefined && { fileName: fileName ? String(fileName) : null }),
        ...(fileType != null && { fileType: String(fileType).toUpperCase() }),
        ...(fileSize != null && { fileSize: String(fileSize) }),
        ...(typeof isActive === 'boolean' && { isActive }),
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    const acks = await prisma.companyPolicyAcknowledgement.findMany({
      where: { userId: req.user!.id, policyId: id },
    });
    const ackMap = buildAckMap(acks);
    const policy = shapePolicy(row, req.user!.id, ackMap);
    res.json({ success: true, data: { policy } });
  } catch (e) {
    console.error('updateCompanyPolicy', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const deleteCompanyPolicy = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requirePolicyManager(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    const { id } = req.params;
    const existing = await prisma.companyPolicy.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Policy not found' });
      return;
    }
    await prisma.companyPolicy.update({
      where: { id },
      data: { isActive: false },
    });
    res.json({ success: true, data: { id, isActive: false } });
  } catch (e) {
    console.error('deleteCompanyPolicy', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const downloadCompanyPolicyFile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const { id } = req.params;
    const policy = await prisma.companyPolicy.findFirst({
      where: { id, isActive: true },
      select: { id: true, title: true, fileName: true, filePath: true },
    });
    if (!policy) {
      res.status(404).json({ success: false, message: 'Policy not found' });
      return;
    }
    if (!policy.filePath) {
      res.status(404).json({ success: false, message: 'No file attached to this policy' });
      return;
    }
    const abs = path.join(process.cwd(), 'uploads', 'policies', policy.filePath);
    if (!fs.existsSync(abs)) {
      res.status(404).json({ success: false, message: 'Policy file missing on server' });
      return;
    }
    const downloadName =
      policy.fileName ||
      `${policy.title.replace(/[^a-zA-Z0-9_-]+/g, '_')}.pdf`;
    res.download(abs, downloadName);
  } catch (e) {
    console.error('downloadCompanyPolicyFile', e);
    res.status(500).json({ success: false, message: 'Failed to download policy file' });
  }
};

export const acknowledgeCompanyPolicy = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const { id } = req.params;
    const policy = await prisma.companyPolicy.findFirst({
      where: { id, isActive: true },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!policy) {
      res.status(404).json({ success: false, message: 'Policy not found' });
      return;
    }

    await prisma.companyPolicyAcknowledgement.upsert({
      where: {
        policyId_userId: { policyId: id, userId },
      },
      create: { policyId: id, userId },
      update: {},
    });

    const ack = await prisma.companyPolicyAcknowledgement.findUnique({
      where: { policyId_userId: { policyId: id, userId } },
    });
    const ackMap = new Map<string, Date>();
    if (ack) ackMap.set(id, ack.acknowledgedAt);

    const policyOut = shapePolicy(policy, userId, ackMap);
    res.json({ success: true, data: { policy: policyOut } });
  } catch (e) {
    console.error('acknowledgeCompanyPolicy', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
