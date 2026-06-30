import prisma from '../config/database';
import { config } from '../config/env';
import { sendEmail } from './email.service';

function renderTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.split(`%${key}%`).join(String(value ?? '')),
    template,
  );
}

function resolveRecipientPath(context: Record<string, unknown>, path: string): string {
  const trimmed = String(path || '').trim();
  if (!trimmed) return '';
  if (trimmed.includes('@')) return trimmed;
  const parts = trimmed.split('.');
  let cur: unknown = context;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return '';
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur != null ? String(cur).trim() : '';
}

export function erpLoginUrl(): string {
  const base = String(config.frontendUrl || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/login`;
}

export function erpProjectUrl(projectId: string): string {
  const base = String(config.frontendUrl || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/projects/${projectId}`;
}

export function erpTaskUrl(projectId: string, taskId: string): string {
  const base = String(config.frontendUrl || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/projects/${projectId}?task=${taskId}`;
}

export function erpSalaryUrl(): string {
  const base = String(config.frontendUrl || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/my-salary`;
}

export function erpPayrollUrl(): string {
  const base = String(config.frontendUrl || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/payroll`;
}

export function erpLeaveUrl(leaveId?: string): string {
  const base = String(config.frontendUrl || 'http://localhost:3000').replace(/\/$/, '');
  return leaveId ? `${base}/workplace/leaves?leaveId=${leaveId}` : `${base}/workplace/leaves`;
}

export function erpContractsUrl(): string {
  const base = String(config.frontendUrl || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/contracts`;
}

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatPayPeriod(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1] || month} ${year}`;
}

async function resolveHrPayrollRecipientEmails(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      email: { not: '' },
      role: { in: ['ADMIN', 'SUPER_ADMIN', 'HR'] },
    },
    select: { email: true },
    take: 50,
  });
  return [...new Set(users.map((u) => String(u.email || '').trim()).filter(Boolean))];
}

async function dispatchEmailToMany(
  eventKey: string,
  emails: string[],
  payload: Omit<Parameters<typeof dispatchEmailEvent>[1], 'toEmail'>,
): Promise<void> {
  const unique = [...new Set(emails.map((e) => e.trim()).filter(Boolean))];
  for (const toEmail of unique) {
    await dispatchEmailEvent(eventKey, { ...payload, toEmail });
  }
}

export async function dispatchEmailEvent(
  eventKey: string,
  payload: {
    variables: Record<string, string>;
    context?: Record<string, unknown>;
    toEmail?: string;
    relatedEmployeeId?: string | null;
    templateName?: string;
  },
): Promise<{ sent: boolean; reason?: string }> {
  const logSkipped = async (
    reason: string,
    partial?: { recipientEmail?: string; subject?: string; template?: string },
  ) => {
    const recipient = partial?.recipientEmail || String(payload.toEmail || '').trim() || '—';
    const subject = partial?.subject || `[${eventKey}] ${reason}`;
    const template = partial?.template || payload.templateName || eventKey;
    try {
      await prisma.emailLog.create({
        data: {
          recipientEmail: recipient,
          subject,
          template,
          status: 'FAILED',
          relatedEmployeeId: payload.relatedEmployeeId || null,
          errorMessage: reason,
        },
      });
    } catch (logErr) {
      console.warn(`dispatchEmailEvent(${eventKey}) could not write email log:`, logErr);
    }
    console.warn(`dispatchEmailEvent(${eventKey}) skipped: ${reason}`);
    return { sent: false, reason };
  };

  const trigger = await prisma.emailTrigger.findFirst({
    where: { eventKey, enabled: true },
    include: { template: true },
    orderBy: { updatedAt: 'desc' },
  });

  let template = trigger?.template?.isActive ? trigger.template : null;
  if (!template && payload.templateName) {
    template = await prisma.emailTemplate.findFirst({
      where: { name: payload.templateName, isActive: true },
    });
  }
  if (!template) {
    return logSkipped('no_template');
  }

  const ctx = payload.context || {};
  let toEmail = String(payload.toEmail || '').trim();
  if (!toEmail && trigger?.recipients) {
    try {
      const map = JSON.parse(trigger.recipients) as { to?: string; cc?: string; bcc?: string };
      toEmail = resolveRecipientPath(ctx, map.to || '');
    } catch {
      // ignore invalid JSON
    }
  }
  if (!toEmail) {
    return logSkipped('no_recipient', { template: template.name });
  }

  const vars = { LoginURL: erpLoginUrl(), ...payload.variables };
  const subject = renderTemplate(template.subject, vars);
  const html = renderTemplate(template.html, vars);
  const templateKey = template.name;

  try {
    await sendEmail(toEmail, subject, html);
    await prisma.emailLog.create({
      data: {
        recipientEmail: toEmail,
        subject,
        template: templateKey,
        status: 'SENT',
        relatedEmployeeId: payload.relatedEmployeeId || null,
        errorMessage: null,
      },
    });
    return { sent: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.emailLog.create({
      data: {
        recipientEmail: toEmail,
        subject,
        template: templateKey,
        status: 'FAILED',
        relatedEmployeeId: payload.relatedEmployeeId || null,
        errorMessage: msg,
      },
    });
    console.warn(`dispatchEmailEvent(${eventKey}) failed:`, msg);
    return { sent: false, reason: msg };
  }
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function personName(user: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  if (!user) return 'System';
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return name || 'User';
}

export async function notifyTaskAssignedEmail(params: {
  assignee: { id: string; email: string; firstName?: string | null; lastName?: string | null };
  task: { id: string; title: string; dueDate?: Date | string | null };
  project: { id: string; name: string; referenceNumber?: string | null };
  assignedBy?: { firstName?: string | null; lastName?: string | null } | null;
}): Promise<void> {
  await dispatchEmailEvent('TASK_ASSIGNED', {
    toEmail: params.assignee.email,
    relatedEmployeeId: params.assignee.id,
    templateName: 'TASK ASSIGNMENT',
    context: {
      assignee: { email: params.assignee.email, name: personName(params.assignee) },
    },
    variables: {
      AssigneeName: personName(params.assignee),
      TaskTitle: params.task.title,
      ProjectName: params.project.name,
      ProjectReference: params.project.referenceNumber || '—',
      DueDate: formatDate(params.task.dueDate),
      AssignedBy: personName(params.assignedBy),
      TaskURL: erpTaskUrl(params.project.id, params.task.id),
    },
  });
}

export async function notifyTenderAssignedEmail(params: {
  engineer: { id: string; email: string; firstName?: string | null; lastName?: string | null };
  tender: { name: string; referenceNumber?: string | null; client?: string | null };
  invitationLink: string;
  assignedBy?: { firstName?: string | null; lastName?: string | null } | null;
}): Promise<{ sent: boolean; reason?: string }> {
  return dispatchEmailEvent('TENDER_ASSIGNED', {
    toEmail: params.engineer.email,
    relatedEmployeeId: params.engineer.id,
    templateName: 'TENDER ASSIGNMENT',
    context: {
      engineer: { email: params.engineer.email, name: personName(params.engineer) },
    },
    variables: {
      EngineerName: personName(params.engineer),
      TenderName: params.tender.name,
      ReferenceNumber: params.tender.referenceNumber || '—',
      ClientName: params.tender.client || '—',
      InvitationLink: params.invitationLink,
      AssignedBy: personName(params.assignedBy),
    },
  });
}

export async function notifyProjectManagerAssignedEmail(params: {
  manager: { id: string; email: string; firstName?: string | null; lastName?: string | null };
  project: {
    id: string;
    name: string;
    referenceNumber?: string | null;
    projectNumber?: number | null;
    startDate?: Date | string | null;
    deadline?: Date | string | null;
    client?: { name?: string | null } | null;
  };
  assignedBy?: { firstName?: string | null; lastName?: string | null } | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const result = await dispatchEmailEvent('PROJECT_MANAGER_ASSIGNED', {
    toEmail: params.manager.email,
    relatedEmployeeId: params.manager.id,
    templateName: 'PROJECT MANAGER ASSIGNMENT',
    context: {
      manager: { email: params.manager.email, name: personName(params.manager) },
    },
    variables: {
      ProjectManagerName: personName(params.manager),
      ProjectName: params.project.name,
      ProjectReference: params.project.referenceNumber || '—',
      ProjectID:
        params.project.referenceNumber ||
        (params.project.projectNumber != null ? String(params.project.projectNumber) : '') ||
        params.project.id,
      ClientName: params.project.client?.name || '—',
      StartDate: formatDate(params.project.startDate),
      Deadline: formatDate(params.project.deadline),
      AssignedBy: personName(params.assignedBy),
      ProjectURL: erpProjectUrl(params.project.id),
    },
  });
  if (!result.sent) {
    console.warn('notifyProjectManagerAssignedEmail:', result.reason || 'not sent');
  }
  return result;
}

export async function notifyContractCreatedForPm(params: {
  manager: { id: string; email: string; firstName?: string | null; lastName?: string | null };
  contract: {
    id: string;
    referenceNumber?: string | null;
    title?: string | null;
    client?: { name?: string | null } | null;
  };
  assignedBy?: { firstName?: string | null; lastName?: string | null } | null;
}): Promise<{ sent: boolean; reason?: string }> {
  return dispatchEmailEvent('CONTRACT_CREATED', {
    toEmail: params.manager.email,
    relatedEmployeeId: params.manager.id,
    templateName: 'CONTRACT CREATED',
    context: {
      manager: { email: params.manager.email, name: personName(params.manager) },
    },
    variables: {
      ProjectManagerName: personName(params.manager),
      ContractReference: params.contract.referenceNumber || '—',
      ContractTitle: params.contract.title || params.contract.referenceNumber || '—',
      ClientName: params.contract.client?.name || '—',
      AssignedBy: personName(params.assignedBy),
      ContractURL: erpContractsUrl(),
      LoginURL: erpLoginUrl(),
    },
  });
}

export async function resolveProjectManagerUser(projectManagerText: string | null | undefined) {
  const raw = String(projectManagerText || '').trim();
  if (!raw) return null;
  if (raw.includes('@')) {
    return prisma.user.findFirst({
      where: { email: { equals: raw, mode: 'insensitive' }, isActive: true },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
  }
  const needle = raw.toLowerCase();
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ['PROJECT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
    },
    select: { id: true, email: true, firstName: true, lastName: true },
    take: 500,
  });
  return (
    users.find((u) => {
      const full = `${u.firstName || ''} ${u.lastName || ''}`.trim().toLowerCase();
      return full === needle || full.includes(needle) || needle.includes(full);
    }) || null
  );
}

function formatMoney(amount: number | null | undefined, currency = 'AED'): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return `${amount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export async function notifySalaryCreditedEmail(params: {
  employee: { id: string; email: string; firstName?: string | null; lastName?: string | null; employeeId?: string | null };
  year: number;
  month: number;
  netSalary: number;
  currency?: string;
  companyName?: string | null;
}): Promise<void> {
  const payPeriod = formatPayPeriod(params.year, params.month);
  await dispatchEmailEvent('SALARY_CREDITED', {
    toEmail: params.employee.email,
    relatedEmployeeId: params.employee.id,
    templateName: 'SALARY CREDITED',
    context: {
      employee: { email: params.employee.email, name: personName(params.employee) },
    },
    variables: {
      EmployeeName: personName(params.employee),
      EmployeeNo: params.employee.employeeId || '—',
      PayPeriod: payPeriod,
      NetSalary: params.netSalary.toLocaleString('en-AE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      Currency: params.currency || 'AED',
      CompanyName: params.companyName || 'ONIX Group',
      SalaryURL: erpSalaryUrl(),
    },
  });
}

export async function notifyPayrollFinanceReviewEmail(params: {
  payrollRun: { id: string; periodYear: number; periodMonth: number; totalNetSalary?: unknown };
  approvedBy?: { firstName?: string | null; lastName?: string | null } | null;
  employeeCount?: number;
}): Promise<void> {
  const emails = await resolveHrPayrollRecipientEmails();
  if (!emails.length) return;
  const payPeriod = formatPayPeriod(params.payrollRun.periodYear, params.payrollRun.periodMonth);
  const totalNet = Number(params.payrollRun.totalNetSalary ?? 0);
  await dispatchEmailToMany('PAYROLL_FINANCE_REVIEW', emails, {
    templateName: 'PAYROLL FINANCE REVIEW',
    variables: {
      RecipientName: 'Finance Team',
      PayPeriod: payPeriod,
      EmployeeCount: String(params.employeeCount ?? '—'),
      TotalNetPay: formatMoney(totalNet),
      ApprovedBy: personName(params.approvedBy),
      PayrollURL: erpPayrollUrl(),
    },
  });
}

export async function notifyPayrollPaymentReadyEmail(params: {
  payrollRun: { id: string; periodYear: number; periodMonth: number; totalNetSalary?: unknown };
  approvedBy?: { firstName?: string | null; lastName?: string | null } | null;
}): Promise<void> {
  const emails = await resolveHrPayrollRecipientEmails();
  if (!emails.length) return;
  const payPeriod = formatPayPeriod(params.payrollRun.periodYear, params.payrollRun.periodMonth);
  const totalNet = Number(params.payrollRun.totalNetSalary ?? 0);
  await dispatchEmailToMany('PAYROLL_PAYMENT_READY', emails, {
    templateName: 'PAYROLL PAYMENT READY',
    variables: {
      RecipientName: 'Accounts Team',
      PayPeriod: payPeriod,
      TotalNetPay: formatMoney(totalNet),
      ApprovedBy: personName(params.approvedBy),
      PayrollURL: erpPayrollUrl(),
    },
  });
}

export async function notifyPayslipRequestEmail(params: {
  employee: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    employeeId?: string | null;
    department?: string | null;
  };
  year: number;
  month: number;
  message: string;
}): Promise<void> {
  const emails = await resolveHrPayrollRecipientEmails();
  if (!emails.length) return;
  const payPeriod = formatPayPeriod(params.year, params.month);
  await dispatchEmailToMany('PAYSLIP_REQUEST_RECEIVED', emails, {
    relatedEmployeeId: params.employee.id,
    templateName: 'PAYSLIP REQUEST',
    variables: {
      RecipientName: 'HR / Accounts',
      EmployeeName: personName(params.employee),
      EmployeeNo: params.employee.employeeId || '—',
      Department: params.employee.department || '—',
      PayPeriod: payPeriod,
      RequestMessage: params.message,
      PayrollURL: erpPayrollUrl(),
    },
  });
}

function formatLeaveDateRange(start: Date | string | null | undefined, end: Date | string | null | undefined): string {
  const s = formatDate(start);
  const e = formatDate(end);
  if (s === '—' && e === '—') return '—';
  if (s === e) return s;
  return `${s} → ${e}`;
}

export async function notifyLeaveStatusEmail(params: {
  leaveId: string;
  decision: 'approved' | 'rejected';
  rejectedBy?: 'manager' | 'hr';
  reason?: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const leave = await prisma.leave.findUnique({
    where: { id: params.leaveId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          department: true,
        },
      },
    },
  });
  if (!leave?.user?.email) return { sent: false, reason: 'no_recipient' };

  const eventKey = params.decision === 'approved' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED';
  const templateName = params.decision === 'approved' ? 'LEAVE APPROVED' : 'LEAVE REJECTED';
  const decisionLabel =
    params.decision === 'approved'
      ? 'Approved'
      : params.rejectedBy === 'manager'
        ? 'Rejected by Line Manager'
        : 'Rejected by HR';

  return dispatchEmailEvent(eventKey, {
    toEmail: leave.user.email,
    relatedEmployeeId: leave.user.id,
    templateName,
    context: {
      employee: { email: leave.user.email, name: personName(leave.user) },
    },
    variables: {
      EmployeeName: personName(leave.user),
      LeaveType: String(leave.type || 'Leave').replace(/_/g, ' '),
      LeaveDates: formatLeaveDateRange(leave.startDate, leave.endDate),
      TotalDays: leave.days != null ? String(leave.days) : '—',
      Decision: decisionLabel,
      RejectionReason: params.reason?.trim() || '—',
      Department: leave.user.department || '—',
      LeaveURL: erpLeaveUrl(leave.id),
    },
  });
}
