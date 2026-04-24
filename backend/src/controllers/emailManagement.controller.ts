import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendEmail } from '../services/email.service';

function requireAdminOrHr(req: AuthRequest, res: Response): boolean {
  const role = req.user?.role;
  if (!role || !['ADMIN', 'HR'].includes(role)) {
    res.status(403).json({ success: false, message: 'Forbidden' });
    return false;
  }
  return true;
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// -------- Templates --------
export const listEmailTemplates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireAdminOrHr(req, res)) return;
    const rows = await prisma.emailTemplate.findMany({ orderBy: { updatedAt: 'desc' } });
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('listEmailTemplates error:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const createEmailTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireAdminOrHr(req, res)) return;
    const { name, fromEmail, cc, bcc, subject, html, variables, isActive } = req.body as Record<string, unknown>;
    if (!name || !String(name).trim()) {
      res.status(400).json({ success: false, message: 'name is required' });
      return;
    }
    if (!subject || !String(subject).trim()) {
      res.status(400).json({ success: false, message: 'subject is required' });
      return;
    }
    if (!html || !String(html).trim()) {
      res.status(400).json({ success: false, message: 'html is required' });
      return;
    }
    const row = await prisma.emailTemplate.create({
      data: {
        name: String(name).trim(),
        fromEmail: fromEmail !== undefined && String(fromEmail).trim() ? String(fromEmail).trim() : null,
        cc: cc !== undefined && String(cc).trim() ? String(cc) : null,
        bcc: bcc !== undefined && String(bcc).trim() ? String(bcc) : null,
        subject: String(subject),
        html: String(html),
        variables: variables ? JSON.stringify(variables) : null,
        isActive: isActive === undefined ? true : Boolean(isActive),
        createdBy: req.user?.id || null,
      },
    });
    res.status(201).json({ success: true, data: row });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      res.status(409).json({ success: false, message: 'Template name already exists.' });
      return;
    }
    console.error('createEmailTemplate error:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateEmailTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireAdminOrHr(req, res)) return;
    const { id } = req.params;
    const { name, fromEmail, cc, bcc, subject, html, variables, isActive } = req.body as Record<string, unknown>;
    const row = await prisma.emailTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(fromEmail !== undefined ? { fromEmail: String(fromEmail).trim() ? String(fromEmail).trim() : null } : {}),
        ...(cc !== undefined ? { cc: String(cc).trim() ? String(cc) : null } : {}),
        ...(bcc !== undefined ? { bcc: String(bcc).trim() ? String(bcc) : null } : {}),
        ...(subject !== undefined ? { subject: String(subject) } : {}),
        ...(html !== undefined ? { html: String(html) } : {}),
        ...(variables !== undefined ? { variables: variables ? JSON.stringify(variables) : null } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });
    res.json({ success: true, data: row });
  } catch (e: any) {
    if (e?.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    console.error('updateEmailTemplate error:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const deleteEmailTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireAdminOrHr(req, res)) return;
    const { id } = req.params;
    await prisma.emailTemplate.delete({ where: { id } });
    res.json({ success: true });
  } catch (e: any) {
    if (e?.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    console.error('deleteEmailTemplate error:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const testEmailTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireAdminOrHr(req, res)) return;
    const { id } = req.params;
    const { toEmail, variables } = req.body as { toEmail?: string; variables?: Record<string, string> };
    if (!toEmail) {
      res.status(400).json({ success: false, message: 'toEmail is required' });
      return;
    }
    const tpl = await prisma.emailTemplate.findUnique({ where: { id } });
    if (!tpl) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    const vars = variables || {};
    const render = (s: string) =>
      Object.entries(vars).reduce((acc, [k, v]) => acc.split(`%${k}%`).join(String(v ?? '')), s);
    const subject = render(tpl.subject);
    const html = render(tpl.html);

    await sendEmail(toEmail, subject, html);
    res.json({ success: true, message: 'Test email sent.' });
  } catch (e) {
    console.error('testEmailTemplate error:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// -------- Triggers --------
export const listEmailTriggers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireAdminOrHr(req, res)) return;
    const rows = await prisma.emailTrigger.findMany({
      include: { template: true },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('listEmailTriggers error:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const upsertEmailTrigger = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireAdminOrHr(req, res)) return;
    const { id } = req.params;
    const { name, eventKey, templateId, enabled, recipients } = req.body as Record<string, unknown>;
    if (!name || !String(name).trim()) {
      res.status(400).json({ success: false, message: 'name is required' });
      return;
    }
    if (!eventKey || !String(eventKey).trim()) {
      res.status(400).json({ success: false, message: 'eventKey is required' });
      return;
    }
    if (!templateId || !String(templateId).trim()) {
      res.status(400).json({ success: false, message: 'templateId is required' });
      return;
    }
    const data = {
      name: String(name).trim(),
      eventKey: String(eventKey).trim(),
      templateId: String(templateId).trim(),
      enabled: enabled === undefined ? true : Boolean(enabled),
      recipients: recipients ? JSON.stringify(recipients) : null,
    };
    const row = id
      ? await prisma.emailTrigger.update({ where: { id }, data })
      : await prisma.emailTrigger.create({ data });
    res.status(id ? 200 : 201).json({ success: true, data: row });
  } catch (e: any) {
    if (e?.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    console.error('upsertEmailTrigger error:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const deleteEmailTrigger = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireAdminOrHr(req, res)) return;
    const { id } = req.params;
    await prisma.emailTrigger.delete({ where: { id } });
    res.json({ success: true });
  } catch (e: any) {
    if (e?.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    console.error('deleteEmailTrigger error:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// -------- Logs --------
export const listEmailLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireAdminOrHr(req, res)) return;
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const skip = (page - 1) * limit;
    const status = String(req.query.status || '').trim().toUpperCase();
    const q = String(req.query.q || '').trim();

    const where: any = {};
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { recipientEmail: { contains: q, mode: 'insensitive' } },
        { subject: { contains: q, mode: 'insensitive' } },
        { template: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.emailLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.emailLog.count({ where }),
    ]);

    res.json({ success: true, data: { items, total, page, limit } });
  } catch (e) {
    console.error('listEmailLogs error:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// -------- Queue --------
export const listEmailQueue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireAdminOrHr(req, res)) return;
    const status = String(req.query.status || 'PENDING').trim().toUpperCase();
    const rows = await prisma.emailQueueItem.findMany({
      where: status ? { status } : undefined,
      orderBy: { scheduledAt: 'asc' },
      take: 500,
    });
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('listEmailQueue error:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const retryQueueItem = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!requireAdminOrHr(req, res)) return;
    const { id } = req.params;
    const row = await prisma.emailQueueItem.findUnique({ where: { id } });
    if (!row) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    if (row.status === 'SENT') {
      res.status(400).json({ success: false, message: 'Already sent' });
      return;
    }

    await prisma.emailQueueItem.update({
      where: { id },
      data: { status: 'SENDING', attempts: { increment: 1 }, lastError: null },
    });

    try {
      await sendEmail(row.toEmail, row.subject, row.html);
      await prisma.emailQueueItem.update({ where: { id }, data: { status: 'SENT' } });
      await prisma.emailLog.create({
        data: {
          recipientEmail: row.toEmail,
          subject: row.subject,
          template: row.templateId || 'queue',
          status: 'SENT',
          relatedEmployeeId: row.relatedEmployeeId,
          errorMessage: null,
        },
      });
      res.json({ success: true, message: 'Sent.' });
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : String(e);
      await prisma.emailQueueItem.update({ where: { id }, data: { status: 'FAILED', lastError: msg } });
      await prisma.emailLog.create({
        data: {
          recipientEmail: row.toEmail,
          subject: row.subject,
          template: row.templateId || 'queue',
          status: 'FAILED',
          relatedEmployeeId: row.relatedEmployeeId,
          errorMessage: msg,
        },
      });
      res.status(500).json({ success: false, message: msg });
    }
  } catch (e) {
    console.error('retryQueueItem error:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

