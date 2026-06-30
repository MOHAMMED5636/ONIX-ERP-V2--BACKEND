import crypto from 'crypto';
import prisma from '../config/database';
import { UserRole } from '@prisma/client';

export type EngineeringRoleSection =
  | 'ARCHITECT'
  | 'BIM'
  | 'SITE'
  | 'QA_QC'
  | 'PLANNING'
  | 'GENERAL';

export type DailyReportPayload = {
  common?: Record<string, unknown>;
  roleSection?: Record<string, unknown>;
};

const EXEMPT_ROLES: UserRole[] = ['ADMIN', 'HR', 'SUPER_ADMIN'];

export function requiresEngineeringDailyReport(user: {
  role: UserRole;
  department?: string | null;
  position?: string | null;
}): boolean {
  if (EXEMPT_ROLES.includes(user.role)) return false;
  return true;
}

export function resolveEngineeringRoleSection(user: {
  department?: string | null;
  position?: string | null;
  jobTitle?: string | null;
}): EngineeringRoleSection {
  const hay = `${user.position || ''} ${user.jobTitle || ''} ${user.department || ''}`.toLowerCase();

  if (/\b(architect|design engineer|designer)\b/.test(hay)) return 'ARCHITECT';
  if (/\b(bim|interior|modelling|modeling)\b/.test(hay)) return 'BIM';
  if (/\b(site engineer|site supervisor|construction engineer)\b/.test(hay)) return 'SITE';
  if (/\b(qa|qc|quality|inspection)\b/.test(hay)) return 'QA_QC';
  if (/\b(planning engineer|planner|planning)\b/.test(hay)) return 'PLANNING';
  return 'GENERAL';
}

export function emptyDailyReportPayload(): DailyReportPayload {
  return {
    common: {
      tasksAssignedToday: '',
      tasksCompletedToday: '',
      pendingTasks: '',
      mostTimeConsumingTask: '',
      completedTasksList: [''],
      allTasksCompleted: '',
      incompleteReason: '',
      projectsWorkedOn: [{ name: '', progressPercent: '' }],
      milestonesCompleted: '',
      deadlinesOnTrack: '',
      deadlineDelayReason: '',
      meetingsAttended: '',
      coordinationIssues: '',
      coordinationIssueReason: '',
    },
    roleSection: {},
  };
}

function asNum(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v != null ? String(v).trim() : '';
}

function asBool(v: unknown): boolean | null {
  if (v === true || v === 'true' || v === 'yes' || v === 'Yes') return true;
  if (v === false || v === 'false' || v === 'no' || v === 'No') return false;
  return null;
}

export function validateDailyReportPayload(
  payload: DailyReportPayload,
  roleSection: EngineeringRoleSection,
  partial = false,
): string[] {
  const errors: string[] = [];
  const c = payload.common || {};

  if (partial) return errors;

  const assigned = asNum(c.tasksAssignedToday);
  const completed = asNum(c.tasksCompletedToday);
  if (assigned === null) errors.push('Tasks assigned today is required');
  if (completed === null) errors.push('Tasks completed today is required');
  if (assigned !== null && completed !== null && completed > assigned) {
    errors.push('Tasks completed cannot exceed tasks assigned');
  }

  if (!asStr(c.mostTimeConsumingTask)) errors.push('Most time-consuming task is required');

  const list = Array.isArray(c.completedTasksList)
    ? c.completedTasksList.map(asStr).filter(Boolean)
    : [];
  if (completed !== null && completed > 0 && list.length === 0) {
    errors.push('List at least one completed task');
  }

  const allDone = asBool(c.allTasksCompleted);
  if (allDone === null) errors.push('Indicate whether all tasks were completed');
  if (allDone === false && !asStr(c.incompleteReason)) {
    errors.push('Reason is required when not all tasks were completed');
  }

  const projects = Array.isArray(c.projectsWorkedOn) ? c.projectsWorkedOn : [];
  const validProjects = projects.filter(
    (p: { name?: string; progressPercent?: unknown }) => asStr(p?.name) && asNum(p?.progressPercent) !== null,
  );
  if (validProjects.length === 0) errors.push('Add at least one project with progress %');

  const milestones = asBool(c.milestonesCompleted);
  if (milestones === null) errors.push('Milestones completed (Yes/No) is required');

  const deadlines = asBool(c.deadlinesOnTrack);
  if (deadlines === null) errors.push('Deadlines achieved/delayed (Yes/No) is required');
  if (deadlines === false && !asStr(c.deadlineDelayReason)) {
    errors.push('Delay reason is required when deadlines were not achieved');
  }

  if (asNum(c.meetingsAttended) === null) errors.push('Meetings attended is required');

  const coordIssues = asBool(c.coordinationIssues);
  if (coordIssues === null) errors.push('Coordination issues (Yes/No) is required');
  if (coordIssues === true && !asStr(c.coordinationIssueReason)) {
    errors.push('Coordination issue details are required');
  }

  const rs = payload.roleSection || {};
  if (roleSection === 'ARCHITECT') {
    if (asNum(rs.drawingsProduced) === null) errors.push('Drawings produced today is required');
    if (asNum(rs.revisionsDone) === null) errors.push('Revisions done is required');
  }
  if (roleSection === 'BIM') {
    if (asNum(rs.modelsUpdated) === null) errors.push('BIM models updated is required');
    if (asNum(rs.clashesResolved) === null) errors.push('Clashes resolved is required');
  }
  if (roleSection === 'SITE') {
    if (asNum(rs.siteVisits) === null) errors.push('Site visits today is required');
    if (asNum(rs.inspectionsDone) === null) errors.push('Inspections done is required');
  }
  if (roleSection === 'QA_QC') {
    if (asNum(rs.inspectionsCompleted) === null) errors.push('QA/QC inspections completed is required');
    if (asNum(rs.nonConformances) === null) errors.push('Non-conformances logged is required');
  }
  if (roleSection === 'PLANNING') {
    if (asNum(rs.schedulesUpdated) === null) errors.push('Schedules updated is required');
    if (asNum(rs.delaysIdentified) === null) errors.push('Delays identified is required');
  }

  return errors;
}

export function normalizeDailyReportPayload(payload: DailyReportPayload): DailyReportPayload {
  const c = payload.common || {};
  const assigned = asNum(c.tasksAssignedToday) ?? 0;
  const completed = asNum(c.tasksCompletedToday) ?? 0;
  const pending = asNum(c.pendingTasks);
  return {
    common: {
      ...c,
      tasksAssignedToday: assigned,
      tasksCompletedToday: completed,
      pendingTasks: pending !== null ? pending : Math.max(0, assigned - completed),
      completedTasksList: Array.isArray(c.completedTasksList)
        ? c.completedTasksList.map(asStr).filter(Boolean)
        : [],
      projectsWorkedOn: (Array.isArray(c.projectsWorkedOn) ? c.projectsWorkedOn : [])
        .map((p: { name?: string; progressPercent?: unknown }) => ({
          name: asStr(p?.name),
          progressPercent: asNum(p?.progressPercent) ?? 0,
        }))
        .filter((p) => p.name),
    },
    roleSection: payload.roleSection || {},
  };
}

export function createCheckoutToken(): string {
  return crypto.randomUUID();
}

export async function getSubmittedReportForDate(userId: string, reportDate: Date) {
  return prisma.engineeringDailyReport.findUnique({
    where: {
      userId_reportDate: { userId, reportDate },
    },
  });
}

export async function assertReportSubmittedForDate(userId: string, reportDate: Date): Promise<boolean> {
  const report = await getSubmittedReportForDate(userId, reportDate);
  return report?.status === 'SUBMITTED';
}
