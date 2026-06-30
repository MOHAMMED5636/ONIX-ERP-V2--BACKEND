import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { resolveEmployeeCompanyRecords } from '../services/companyAccess.service';
import {
  logPolicyAuditFromRequest,
  POLICY_AUDIT_ACTIONS,
} from '../services/companyPolicyAudit.service';
import {
  materializePolicyAssignments,
  updateAssignmentOnAcknowledge,
  updateAssignmentOnDownload,
  userHasPolicyAssignment,
} from '../services/companyPolicyAssignment.service';
import { CompanyPolicyStatus } from '@prisma/client';
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

function parseDepartmentList(raw: string | null | undefined): string[] {
  const text = String(raw || '').trim();
  if (!text || text === 'All Departments' || text === 'General') return [];
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatDepartmentLabel(raw: string | null | undefined): string {
  const departments = parseDepartmentList(raw);
  if (departments.length === 0) return 'All Departments';
  if (departments.length <= 3) return departments.join(', ');
  return `${departments.length} departments`;
}

function normalizeDepartmentScope(rawDepartment: unknown, rawDepartments: unknown): string {
  if (Array.isArray(rawDepartments) && rawDepartments.length > 0) {
    const names = rawDepartments.map((item) => String(item).trim()).filter(Boolean);
    if (names.includes('All Departments')) return 'All Departments';
    return names.join(', ');
  }

  const text = rawDepartment != null ? String(rawDepartment).trim() : '';
  if (!text) return 'All Departments';
  if (text === 'All Departments') return 'All Departments';

  const parts = text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.includes('All Departments')) return 'All Departments';
  return parts.join(', ');
}

async function getUserCompanyIds(userId: string): Promise<Set<string>> {
  const records = await resolveEmployeeCompanyRecords(userId);
  return new Set(records.map((record) => record.id).filter(Boolean));
}

function userCanViewPolicy(
  policy: { department: string; companyId: string | null },
  userDepartment: string | null | undefined,
  userCompanyIds: Set<string>,
): boolean {
  if (policy.companyId && !userCompanyIds.has(policy.companyId)) {
    return false;
  }

  const targetDepartments = parseDepartmentList(policy.department);
  if (targetDepartments.length === 0) return true;

  const userDept = String(userDepartment || '')
    .trim()
    .toLowerCase();
  if (!userDept) return false;

  return targetDepartments.some((dept) => dept.toLowerCase() === userDept);
}

function shapePolicy(
  row: {
    id: string;
    title: string;
    description: string;
    department: string;
    companyId?: string | null;
    company?: { id: string; name: string } | null;
    fileName: string | null;
    filePath?: string | null;
    fileType: string;
    fileSize: string;
    isActive: boolean;
    status?: CompanyPolicyStatus;
    publishDate?: Date | null;
    expiryDate?: Date | null;
    dueDays?: number | null;
    contentHtml?: string | null;
    assignRoles?: string[];
    assignUserIds?: string[];
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: { id: string; firstName: string; lastName: string; email: string } | null;
  },
  ackMap: Map<string, Date>,
  assignmentStatus?: string | null,
) {
  const ackAt = ackMap.get(row.id);
  const lastUpdated = toDateOnly(row.updatedAt) || toDateOnly(row.createdAt);
  const departments = parseDepartmentList(row.department);

  // Employee UI uses pending | acknowledged | expired; assignment row has finer states.
  let complianceStatus: string = ackAt ? 'acknowledged' : 'pending';
  if (assignmentStatus) {
    const as = String(assignmentStatus).toUpperCase();
    if (as === 'ACKNOWLEDGED') complianceStatus = 'acknowledged';
    else if (as === 'EXPIRED') complianceStatus = 'expired';
    else complianceStatus = 'pending';
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    department: formatDepartmentLabel(row.department),
    departments,
    companyId: row.companyId || null,
    companyName: row.company?.name || null,
    /** Original uploaded filename (safe to expose; used for downloads / UI). */
    fileName: row.fileName || null,
    fileType: row.fileType || 'PDF',
    fileSize: row.fileSize || '—',
    hasFile: Boolean(row.filePath || row.fileName),
    contentHtml: row.contentHtml || null,
    lifecycleStatus: row.status || CompanyPolicyStatus.DRAFT,
    publishDate: row.publishDate ? toDateOnly(row.publishDate) : null,
    expiryDate: row.expiryDate ? toDateOnly(row.expiryDate) : null,
    dueDays: row.dueDays ?? null,
    assignRoles: row.assignRoles || [],
    assignUserIds: row.assignUserIds || [],
    lastUpdated,
    status: complianceStatus,
    assignmentStatus: assignmentStatus ? String(assignmentStatus).toLowerCase() : null,
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

const MANAGE_ROLES = ['ADMIN', 'HR', 'SUPER_ADMIN'];

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

const policyInclude = {
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  company: { select: { id: true, name: true } },
} as const;

async function loadPolicyForUser(id: string, userId: string, role: string | undefined) {
  const policy = await prisma.companyPolicy.findFirst({
    where: { id, isActive: true },
    include: policyInclude,
  });
  if (!policy) return null;

  if (!requirePolicyManager(role)) {
    const hasAssignment = await userHasPolicyAssignment(userId, id);
    if (hasAssignment) return policy;

    const [user, userCompanyIds] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { department: true },
      }),
      getUserCompanyIds(userId),
    ]);
    if (!userCanViewPolicy(policy, user?.department, userCompanyIds)) {
      return null;
    }
  }

  return policy;
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
      include: policyInclude,
      orderBy: { updatedAt: 'desc' },
    });

    const acks = await prisma.companyPolicyAcknowledgement.findMany({
      where: { userId },
    });
    const ackMap = buildAckMap(acks);

    const assignments = await prisma.companyPolicyAssignment.findMany({
      where: { userId },
      select: { policyId: true, status: true },
    });
    const assignmentMap = new Map(assignments.map((a) => [a.policyId, a.status]));

    let visibleRows = rows;
    if (!requirePolicyManager(req.user?.role)) {
      const [user, userCompanyIds] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { department: true },
        }),
        getUserCompanyIds(userId),
      ]);
      visibleRows = rows.filter((row) => {
        if (assignmentMap.has(row.id)) return true;
        return userCanViewPolicy(row, user?.department, userCompanyIds);
      });
    }

    const policies = visibleRows.map((row) =>
      shapePolicy(row, ackMap, assignmentMap.get(row.id) ?? null),
    );
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
    const body = req.body || {};
    const { title, description, department, companyId, dueDays, contentHtml, publishNow } = body;
    let departmentsRaw = body.departments;
    let assignRolesRaw = body.assignRoles;
    let assignUserIdsRaw = body.assignUserIds;
    if (typeof departmentsRaw === 'string' && departmentsRaw.trim()) {
      try {
        departmentsRaw = JSON.parse(departmentsRaw);
      } catch {
        departmentsRaw = departmentsRaw.split(',').map((part: string) => part.trim()).filter(Boolean);
      }
    }

    if (!title || !String(title).trim()) {
      res.status(400).json({ success: false, message: 'Title is required' });
      return;
    }
    if (!description || !String(description).trim()) {
      res.status(400).json({ success: false, message: 'Description is required' });
      return;
    }

    const departmentScope = normalizeDepartmentScope(department, departmentsRaw);
    const scopedCompanyId =
      companyId != null && String(companyId).trim() ? String(companyId).trim() : null;

    if (scopedCompanyId) {
      const company = await prisma.company.findFirst({
        where: { id: scopedCompanyId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!company) {
        res.status(400).json({ success: false, message: 'Selected company/branch not found' });
        return;
      }
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

    const assignRoles = Array.isArray(assignRolesRaw)
      ? assignRolesRaw.map((r: unknown) => String(r).trim()).filter(Boolean)
      : typeof assignRolesRaw === 'string' && assignRolesRaw.trim()
        ? assignRolesRaw.split(',').map((p: string) => p.trim()).filter(Boolean)
        : [];

    const assignUserIds = Array.isArray(assignUserIdsRaw)
      ? assignUserIdsRaw.map((r: unknown) => String(r).trim()).filter(Boolean)
      : [];

    const shouldPublish = publishNow === true || publishNow === 'true' || publishNow === '1';

    const row = await prisma.companyPolicy.create({
      data: {
        title: String(title).trim(),
        description: String(description).trim(),
        department: departmentScope,
        companyId: scopedCompanyId,
        fileName: originalName,
        filePath,
        fileType,
        fileSize,
        contentHtml: contentHtml != null ? String(contentHtml) : null,
        dueDays: dueDays != null && Number.isFinite(Number(dueDays)) ? Number(dueDays) : null,
        assignRoles,
        assignUserIds,
        createdById: req.user!.id,
        isActive: true,
        status: shouldPublish ? CompanyPolicyStatus.PUBLISHED : CompanyPolicyStatus.DRAFT,
        publishDate: shouldPublish ? new Date() : null,
      },
      include: policyInclude,
    });

    if (shouldPublish) {
      await materializePolicyAssignments(row.id);
    }

    await logPolicyAuditFromRequest(req, {
      policyId: row.id,
      action: POLICY_AUDIT_ACTIONS.POLICY_CREATED,
      policyTitle: row.title,
      metadata: { published: shouldPublish },
    });

    const policy = shapePolicy(row, new Map());
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
    const { title, description, department, companyId, fileName, fileType, fileSize, isActive, dueDays, contentHtml, expiryDate } =
      req.body || {};
    let departmentsRaw = req.body?.departments;
    let assignRolesRaw = req.body?.assignRoles;
    let assignUserIdsRaw = req.body?.assignUserIds;

    const existing = await prisma.companyPolicy.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Policy not found' });
      return;
    }

    const data: {
      title?: string;
      description?: string;
      department?: string;
      companyId?: string | null;
      fileName?: string | null;
      fileType?: string;
      fileSize?: string;
      isActive?: boolean;
      dueDays?: number | null;
      contentHtml?: string | null;
      expiryDate?: Date | null;
      assignRoles?: string[];
      assignUserIds?: string[];
    } = {};

    if (title != null) data.title = String(title).trim();
    if (description != null) data.description = String(description).trim();
    if (department != null || departmentsRaw != null) {
      data.department = normalizeDepartmentScope(department, departmentsRaw);
    }
    if (companyId !== undefined) {
      const scopedCompanyId =
        companyId != null && String(companyId).trim() ? String(companyId).trim() : null;
      if (scopedCompanyId) {
        const company = await prisma.company.findFirst({
          where: { id: scopedCompanyId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!company) {
          res.status(400).json({ success: false, message: 'Selected company/branch not found' });
          return;
        }
      }
      data.companyId = scopedCompanyId;
    }
    if (fileName !== undefined) data.fileName = fileName ? String(fileName) : null;
    if (fileType != null) data.fileType = String(fileType).toUpperCase();
    if (fileSize != null) data.fileSize = String(fileSize);
    if (typeof isActive === 'boolean') data.isActive = isActive;
    if (dueDays !== undefined) {
      data.dueDays =
        dueDays != null && Number.isFinite(Number(dueDays)) ? Number(dueDays) : null;
    }
    if (contentHtml !== undefined) data.contentHtml = contentHtml != null ? String(contentHtml) : null;
    if (expiryDate !== undefined) {
      data.expiryDate = expiryDate ? new Date(expiryDate) : null;
    }
    if (assignRolesRaw !== undefined) {
      data.assignRoles = Array.isArray(assignRolesRaw)
        ? assignRolesRaw.map((r: unknown) => String(r).trim()).filter(Boolean)
        : [];
    }
    if (assignUserIdsRaw !== undefined) {
      data.assignUserIds = Array.isArray(assignUserIdsRaw)
        ? assignUserIdsRaw.map((r: unknown) => String(r).trim()).filter(Boolean)
        : [];
    }

    const row = await prisma.companyPolicy.update({
      where: { id },
      data,
      include: policyInclude,
    });

    const acks = await prisma.companyPolicyAcknowledgement.findMany({
      where: { userId: req.user!.id, policyId: id },
    });
    const ackMap = buildAckMap(acks);
    const policy = shapePolicy(row, ackMap);

    await logPolicyAuditFromRequest(req, {
      policyId: id,
      action: POLICY_AUDIT_ACTIONS.POLICY_UPDATED,
      policyTitle: row.title,
    });

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
      data: { isActive: false, status: CompanyPolicyStatus.ARCHIVED },
    });
    await logPolicyAuditFromRequest(req, {
      policyId: id,
      action: POLICY_AUDIT_ACTIONS.POLICY_ARCHIVED,
      policyTitle: existing.title,
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
    const policy = await loadPolicyForUser(id, userId, req.user?.role);
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

    await updateAssignmentOnDownload(id, userId);
    await logPolicyAuditFromRequest(req, {
      policyId: id,
      userId,
      action: POLICY_AUDIT_ACTIONS.POLICY_DOWNLOADED,
      policyTitle: policy.title,
    });

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
    const policy = await loadPolicyForUser(id, userId, req.user?.role);
    if (!policy) {
      res.status(404).json({ success: false, message: 'Policy not found' });
      return;
    }

    const { confirmed } = req.body || {};
    if (!confirmed) {
      res.status(400).json({
        success: false,
        message: 'You must confirm that you have read and understood the policy',
      });
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

    await updateAssignmentOnAcknowledge(id, userId);
    await logPolicyAuditFromRequest(req, {
      policyId: id,
      userId,
      action: POLICY_AUDIT_ACTIONS.POLICY_ACKNOWLEDGED,
      policyTitle: policy.title,
    });

    const policyOut = shapePolicy(policy, ackMap, 'ACKNOWLEDGED');
    res.json({ success: true, data: { policy: policyOut } });
  } catch (e) {
    console.error('acknowledgeCompanyPolicy', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
