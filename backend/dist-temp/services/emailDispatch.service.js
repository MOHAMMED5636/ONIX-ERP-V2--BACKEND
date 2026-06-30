"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.erpFrontendBaseUrl = erpFrontendBaseUrl;
exports.erpLoginUrl = erpLoginUrl;
exports.erpProjectUrl = erpProjectUrl;
exports.erpTaskUrl = erpTaskUrl;
exports.dispatchEmailEvent = dispatchEmailEvent;
exports.notifyTaskAssignedEmail = notifyTaskAssignedEmail;
exports.notifyTenderAssignedEmail = notifyTenderAssignedEmail;
exports.notifyProjectManagerAssignedEmail = notifyProjectManagerAssignedEmail;
exports.resolveProjectManagerUser = resolveProjectManagerUser;
const database_1 = __importDefault(require("../config/database"));
const env_1 = require("../config/env");
const email_service_1 = require("./email.service");
const network_1 = require("../utils/network");
function renderTemplate(template, vars) {
    return Object.entries(vars).reduce((acc, [key, value]) => acc.split(`%${key}%`).join(String(value ?? '')), template);
}
function resolveRecipientPath(context, path) {
    const trimmed = String(path || '').trim();
    if (!trimmed)
        return '';
    if (trimmed.includes('@'))
        return trimmed;
    const parts = trimmed.split('.');
    let cur = context;
    for (const part of parts) {
        if (cur == null || typeof cur !== 'object')
            return '';
        cur = cur[part];
    }
    return cur != null ? String(cur).trim() : '';
}
function erpFrontendBaseUrl() {
    const explicit = String(env_1.config.frontendUrl || '').trim();
    if (explicit && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(explicit)) {
        return explicit.replace(/\/+$/, '');
    }
    return (0, network_1.resolveCertificateVerifyBaseUrl)();
}
function erpLoginUrl() {
    return `${erpFrontendBaseUrl()}/login`;
}
function erpProjectUrl(projectId) {
    return `${erpFrontendBaseUrl()}/projects/${projectId}`;
}
function erpTaskUrl(projectId, taskId) {
    return `${erpFrontendBaseUrl()}/projects/${projectId}?task=${taskId}`;
}
async function dispatchEmailEvent(eventKey, payload) {
    const trigger = await database_1.default.emailTrigger.findFirst({
        where: { eventKey, enabled: true },
        include: { template: true },
        orderBy: { updatedAt: 'desc' },
    });
    let template = trigger?.template?.isActive ? trigger.template : null;
    if (!template && payload.templateName) {
        template = await database_1.default.emailTemplate.findFirst({
            where: { name: payload.templateName, isActive: true },
        });
    }
    if (!template)
        return { sent: false, reason: 'no_template' };
    const ctx = payload.context || {};
    let toEmail = String(payload.toEmail || '').trim();
    if (!toEmail && trigger?.recipients) {
        try {
            const map = JSON.parse(trigger.recipients);
            toEmail = resolveRecipientPath(ctx, map.to || '');
        }
        catch {
            // ignore invalid JSON
        }
    }
    if (!toEmail)
        return { sent: false, reason: 'no_recipient' };
    const vars = { LoginURL: erpLoginUrl(), ...payload.variables };
    const subject = renderTemplate(template.subject, vars);
    const html = renderTemplate(template.html, vars);
    const templateKey = template.name;
    try {
        await (0, email_service_1.sendEmail)(toEmail, subject, html);
        await database_1.default.emailLog.create({
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
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await database_1.default.emailLog.create({
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
function formatDate(value) {
    if (!value)
        return '—';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime()))
        return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function personName(user) {
    if (!user)
        return 'System';
    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    return name || 'User';
}
async function notifyTaskAssignedEmail(params) {
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
async function notifyTenderAssignedEmail(params) {
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
async function notifyProjectManagerAssignedEmail(params) {
    await dispatchEmailEvent('PROJECT_MANAGER_ASSIGNED', {
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
            ClientName: params.project.client?.name || '—',
            StartDate: formatDate(params.project.startDate),
            Deadline: formatDate(params.project.deadline),
            AssignedBy: personName(params.assignedBy),
            ProjectURL: erpProjectUrl(params.project.id),
        },
    });
}
async function resolveProjectManagerUser(projectManagerText) {
    const raw = String(projectManagerText || '').trim();
    if (!raw)
        return null;
    if (raw.includes('@')) {
        return database_1.default.user.findFirst({
            where: { email: { equals: raw, mode: 'insensitive' }, isActive: true },
            select: { id: true, email: true, firstName: true, lastName: true },
        });
    }
    const needle = raw.toLowerCase();
    const users = await database_1.default.user.findMany({
        where: {
            isActive: true,
            role: { in: ['PROJECT_MANAGER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
        },
        select: { id: true, email: true, firstName: true, lastName: true },
        take: 500,
    });
    return (users.find((u) => {
        const full = `${u.firstName || ''} ${u.lastName || ''}`.trim().toLowerCase();
        return full === needle || full.includes(needle) || needle.includes(full);
    }) || null);
}
//# sourceMappingURL=emailDispatch.service.js.map