import { PermissionAction } from '../middleware/permissions.middleware';
import { ResourceType } from '../middleware/permissions.middleware';

export const AbilityKeys = {
  COMPANY_READ: 'COMPANY_READ',
  COMPANY_OPEN: 'COMPANY_OPEN', // open company dashboard / departments
  COMPANY_CREATE: 'COMPANY_CREATE',
  COMPANY_UPDATE: 'COMPANY_UPDATE',
  COMPANY_DELETE: 'COMPANY_DELETE',
  COMPANY_ATTACHMENTS_MANAGE: 'COMPANY_ATTACHMENTS_MANAGE',

  // Employees / Directory
  EMPLOYEE_READ: 'EMPLOYEE_READ',
  EMPLOYEE_MANAGE: 'EMPLOYEE_MANAGE', // create/update/delete/import/export/restore

  // Attendance
  ATTENDANCE_VIEW_ALL: 'ATTENDANCE_VIEW_ALL', // admin-style attendance list (/attendance/all)

  // Activity calendar
  ACTIVITY_VIEW: 'ACTIVITY_VIEW', // employee activity calendar events

  // Salary
  SALARY_READ: 'SALARY_READ',
  SALARY_MANAGE: 'SALARY_MANAGE', // create/update/delete structures/allowances/deductions/increments

  // Leaves (HR functions, reports)
  LEAVE_HR_DASHBOARD: 'LEAVE_HR_DASHBOARD',
  LEAVE_REPORTS: 'LEAVE_REPORTS',

  // Resignation workflow
  RESIGNATION_SUBMIT: 'RESIGNATION_SUBMIT',
  RESIGNATION_HR_QUEUE: 'RESIGNATION_HR_QUEUE',
  RESIGNATION_FINANCE_CLEARANCE: 'RESIGNATION_FINANCE_CLEARANCE',
  RESIGNATION_REPORTS: 'RESIGNATION_REPORTS',

  // Company policy
  COMPANY_POLICY_MANAGE: 'COMPANY_POLICY_MANAGE', // create/update/delete policy docs

  // Feedback survey
  FEEDBACK_SURVEY_READ: 'FEEDBACK_SURVEY_READ',
  FEEDBACK_SURVEY_MANAGE: 'FEEDBACK_SURVEY_MANAGE', // create/update/delete/publish/share/actions

  // Sidebar (layout/Sidebar.js) — show/hide menu icon per role; does not change API permissions.
  NAV_SIDEBAR_DASHBOARD: 'NAV_SIDEBAR_DASHBOARD',
  NAV_SIDEBAR_COMPANY: 'NAV_SIDEBAR_COMPANY',
  NAV_SIDEBAR_WORKPLACE_HUB: 'NAV_SIDEBAR_WORKPLACE_HUB',
  NAV_SIDEBAR_TASKS: 'NAV_SIDEBAR_TASKS',
  NAV_SIDEBAR_TEAM_PROJECT_TRACKER: 'NAV_SIDEBAR_TEAM_PROJECT_TRACKER',
  NAV_SIDEBAR_CONTRACTORS: 'NAV_SIDEBAR_CONTRACTORS',
  // Employee ERP (layout/EmployeeSidebar.js)
  NAV_SIDEBAR_MY_PROJECTS: 'NAV_SIDEBAR_MY_PROJECTS',
  NAV_SIDEBAR_MY_TASKS: 'NAV_SIDEBAR_MY_TASKS',
  NAV_SIDEBAR_MY_PAYROLL: 'NAV_SIDEBAR_MY_PAYROLL',
  NAV_SIDEBAR_ATTENDANCE: 'NAV_SIDEBAR_ATTENDANCE',
  NAV_SIDEBAR_ACTIVITY_CALENDAR: 'NAV_SIDEBAR_ACTIVITY_CALENDAR',
  NAV_SIDEBAR_SYSTEM_FEEDBACK: 'NAV_SIDEBAR_SYSTEM_FEEDBACK',
  NAV_SIDEBAR_BALANCE: 'NAV_SIDEBAR_BALANCE',
  NAV_SIDEBAR_BANK_RECONCILIATION: 'NAV_SIDEBAR_BANK_RECONCILIATION',
  NAV_SIDEBAR_SALARY_MANAGEMENT: 'NAV_SIDEBAR_SALARY_MANAGEMENT',
  NAV_SIDEBAR_SALARY_EMPLOYEE_SETUP: 'NAV_SIDEBAR_SALARY_EMPLOYEE_SETUP',
  NAV_SIDEBAR_SALARY_DEDUCTIONS: 'NAV_SIDEBAR_SALARY_DEDUCTIONS',
  NAV_SIDEBAR_SALARY_INCREMENTS: 'NAV_SIDEBAR_SALARY_INCREMENTS',
  NAV_SIDEBAR_PAYROLL: 'NAV_SIDEBAR_PAYROLL',
  NAV_SIDEBAR_MY_SALARY: 'NAV_SIDEBAR_MY_SALARY',
  NAV_SIDEBAR_EMAIL_MANAGEMENT: 'NAV_SIDEBAR_EMAIL_MANAGEMENT',
  NAV_SIDEBAR_IT_SUPPORT: 'NAV_SIDEBAR_IT_SUPPORT',
  NAV_SIDEBAR_AI_EVALUATIONS: 'NAV_SIDEBAR_AI_EVALUATIONS',
  NAV_SIDEBAR_SETTINGS: 'NAV_SIDEBAR_SETTINGS',
  NAV_SIDEBAR_DOCUMENT_EXPIRY: 'NAV_SIDEBAR_DOCUMENT_EXPIRY',

  DOCUMENT_EXPIRY_VIEW: 'DOCUMENT_EXPIRY_VIEW',
  DOCUMENT_EXPIRY_REPORT: 'DOCUMENT_EXPIRY_REPORT',

  // Enterprise Asset Management
  EAM_VIEW: 'EAM_VIEW',
  EAM_MANAGE: 'EAM_MANAGE',
  EAM_WAREHOUSE: 'EAM_WAREHOUSE',
  EAM_CUSTODY: 'EAM_CUSTODY',
  NAV_SIDEBAR_EAM: 'NAV_SIDEBAR_EAM',
} as const;

export type AbilityKey = (typeof AbilityKeys)[keyof typeof AbilityKeys];

export const MANAGED_ROLES = ['ADMIN', 'HR', 'PROJECT_MANAGER', 'EMPLOYEE', 'ACCOUNTANT'] as const;
export type ManagedRole = (typeof MANAGED_ROLES)[number];

export const ALL_ABILITIES: AbilityKey[] = [
  AbilityKeys.COMPANY_READ,
  AbilityKeys.COMPANY_OPEN,
  AbilityKeys.COMPANY_CREATE,
  AbilityKeys.COMPANY_UPDATE,
  AbilityKeys.COMPANY_DELETE,
  AbilityKeys.COMPANY_ATTACHMENTS_MANAGE,

  AbilityKeys.EMPLOYEE_READ,
  AbilityKeys.EMPLOYEE_MANAGE,

  AbilityKeys.ATTENDANCE_VIEW_ALL,
  AbilityKeys.ACTIVITY_VIEW,

  AbilityKeys.SALARY_READ,
  AbilityKeys.SALARY_MANAGE,

  AbilityKeys.LEAVE_HR_DASHBOARD,
  AbilityKeys.LEAVE_REPORTS,

  AbilityKeys.RESIGNATION_SUBMIT,
  AbilityKeys.RESIGNATION_HR_QUEUE,
  AbilityKeys.RESIGNATION_FINANCE_CLEARANCE,
  AbilityKeys.RESIGNATION_REPORTS,

  AbilityKeys.COMPANY_POLICY_MANAGE,

  AbilityKeys.FEEDBACK_SURVEY_READ,
  AbilityKeys.FEEDBACK_SURVEY_MANAGE,

  AbilityKeys.NAV_SIDEBAR_DASHBOARD,
  AbilityKeys.NAV_SIDEBAR_COMPANY,
  AbilityKeys.NAV_SIDEBAR_WORKPLACE_HUB,
  AbilityKeys.NAV_SIDEBAR_TASKS,
  AbilityKeys.NAV_SIDEBAR_TEAM_PROJECT_TRACKER,
  AbilityKeys.NAV_SIDEBAR_CONTRACTORS,
  AbilityKeys.NAV_SIDEBAR_MY_PROJECTS,
  AbilityKeys.NAV_SIDEBAR_MY_TASKS,
  AbilityKeys.NAV_SIDEBAR_MY_PAYROLL,
  AbilityKeys.NAV_SIDEBAR_ATTENDANCE,
  AbilityKeys.NAV_SIDEBAR_ACTIVITY_CALENDAR,
  AbilityKeys.NAV_SIDEBAR_SYSTEM_FEEDBACK,
  AbilityKeys.NAV_SIDEBAR_BALANCE,
  AbilityKeys.NAV_SIDEBAR_BANK_RECONCILIATION,
  AbilityKeys.NAV_SIDEBAR_SALARY_MANAGEMENT,
  AbilityKeys.NAV_SIDEBAR_SALARY_EMPLOYEE_SETUP,
  AbilityKeys.NAV_SIDEBAR_SALARY_DEDUCTIONS,
  AbilityKeys.NAV_SIDEBAR_SALARY_INCREMENTS,
  AbilityKeys.NAV_SIDEBAR_PAYROLL,
  AbilityKeys.NAV_SIDEBAR_MY_SALARY,
  AbilityKeys.NAV_SIDEBAR_EMAIL_MANAGEMENT,
  AbilityKeys.NAV_SIDEBAR_IT_SUPPORT,
  AbilityKeys.NAV_SIDEBAR_AI_EVALUATIONS,
  AbilityKeys.NAV_SIDEBAR_SETTINGS,
  AbilityKeys.NAV_SIDEBAR_DOCUMENT_EXPIRY,

  AbilityKeys.DOCUMENT_EXPIRY_VIEW,
  AbilityKeys.DOCUMENT_EXPIRY_REPORT,

  AbilityKeys.EAM_VIEW,
  AbilityKeys.EAM_MANAGE,
  AbilityKeys.EAM_WAREHOUSE,
  AbilityKeys.EAM_CUSTODY,
  AbilityKeys.NAV_SIDEBAR_EAM,
];

// Defaults until Ramiz changes them in Role Builder
export const DEFAULT_ROLE_ABILITIES: Record<string, Partial<Record<AbilityKey, boolean>>> = {
  ADMIN: Object.fromEntries(ALL_ABILITIES.map((k) => [k, true] as const)),
  SUPER_ADMIN: Object.fromEntries(ALL_ABILITIES.map((k) => [k, true] as const)),
  HR: {
    [AbilityKeys.COMPANY_READ]: true,
    // OPEN + UPDATE + attachments are toggled together as “Manage” in Role Builder.
    [AbilityKeys.COMPANY_OPEN]: true,
    [AbilityKeys.COMPANY_CREATE]: false,
    [AbilityKeys.COMPANY_UPDATE]: true,
    [AbilityKeys.COMPANY_DELETE]: false,
    [AbilityKeys.COMPANY_ATTACHMENTS_MANAGE]: true,

    [AbilityKeys.EMPLOYEE_READ]: true,
    [AbilityKeys.EMPLOYEE_MANAGE]: true,

    [AbilityKeys.ATTENDANCE_VIEW_ALL]: true,
    [AbilityKeys.ACTIVITY_VIEW]: true,

    [AbilityKeys.SALARY_READ]: true,
    [AbilityKeys.SALARY_MANAGE]: true,

    [AbilityKeys.LEAVE_HR_DASHBOARD]: true,
    [AbilityKeys.LEAVE_REPORTS]: true,

    [AbilityKeys.RESIGNATION_HR_QUEUE]: true,
    [AbilityKeys.RESIGNATION_REPORTS]: true,

    [AbilityKeys.COMPANY_POLICY_MANAGE]: true,

    [AbilityKeys.FEEDBACK_SURVEY_READ]: true,
    [AbilityKeys.FEEDBACK_SURVEY_MANAGE]: true,

    [AbilityKeys.DOCUMENT_EXPIRY_VIEW]: true,
    [AbilityKeys.DOCUMENT_EXPIRY_REPORT]: true,
    [AbilityKeys.NAV_SIDEBAR_DOCUMENT_EXPIRY]: true,

    [AbilityKeys.EAM_VIEW]: true,
    [AbilityKeys.EAM_MANAGE]: true,
    [AbilityKeys.EAM_WAREHOUSE]: true,
    [AbilityKeys.EAM_CUSTODY]: true,
    [AbilityKeys.NAV_SIDEBAR_EAM]: true,
  },
  PROJECT_MANAGER: {
    [AbilityKeys.COMPANY_READ]: false,
  },
  EMPLOYEE: {
    [AbilityKeys.COMPANY_READ]: false,
    [AbilityKeys.RESIGNATION_SUBMIT]: true,
  },
  ACCOUNTANT: {
    [AbilityKeys.SALARY_READ]: true,
    [AbilityKeys.SALARY_MANAGE]: true,
    [AbilityKeys.RESIGNATION_FINANCE_CLEARANCE]: true,
    [AbilityKeys.NAV_SIDEBAR_PAYROLL]: true,
    [AbilityKeys.NAV_SIDEBAR_BALANCE]: true,
    [AbilityKeys.NAV_SIDEBAR_BANK_RECONCILIATION]: true,
    [AbilityKeys.NAV_SIDEBAR_MY_SALARY]: true,
    [AbilityKeys.NAV_SIDEBAR_SALARY_MANAGEMENT]: true,
    [AbilityKeys.NAV_SIDEBAR_SALARY_EMPLOYEE_SETUP]: true,
    [AbilityKeys.NAV_SIDEBAR_SALARY_DEDUCTIONS]: true,
    [AbilityKeys.NAV_SIDEBAR_SALARY_INCREMENTS]: true,
  },
};

export function roleCanDefault(role: string, ability: AbilityKey): boolean {
  const row = DEFAULT_ROLE_ABILITIES[role];
  if (!row) {
    return String(ability).startsWith('NAV_SIDEBAR_');
  }
  if (Object.prototype.hasOwnProperty.call(row, ability)) {
    return Boolean(row[ability]);
  }
  // Sidebar toggles default on unless explicitly set (so HR/MANAGER rows stay permissive).
  if (String(ability).startsWith('NAV_SIDEBAR_')) return true;
  return false;
}

/** Role Builder UI: one row per area, four action columns (View / Add / Delete / Manage). */
export type BuilderActionKind = 'view' | 'add' | 'delete' | 'manage';

export type AbilityBuilderGroup = {
  id: string;
  label: string;
  /** Keys toggled together when that column’s button is used. Empty / omitted column = hidden in UI. */
  actions: Partial<Record<BuilderActionKind, readonly AbilityKey[]>>;
};

/** One row under an HR / Management module (matches spreadsheet-style submodule lists). */
export type AbilityBuilderSubmodule = AbilityBuilderGroup;

export type AbilityBuilderCategory = {
  id: string;
  label: string;
  submodules: readonly AbilityBuilderSubmodule[];
};

const SUBMODULE_COMPANY: AbilityBuilderSubmodule = {
  id: 'company',
  label: 'Companies',
  actions: {
    view: [AbilityKeys.COMPANY_READ],
    add: [AbilityKeys.COMPANY_CREATE],
    delete: [AbilityKeys.COMPANY_DELETE],
    manage: [
      AbilityKeys.COMPANY_OPEN,
      AbilityKeys.COMPANY_UPDATE,
      AbilityKeys.COMPANY_ATTACHMENTS_MANAGE,
    ],
  },
};

const SUBMODULE_EMPLOYEES: AbilityBuilderSubmodule = {
  id: 'employees',
  label: 'Employee master data',
  actions: {
    view: [AbilityKeys.EMPLOYEE_READ],
    add: [AbilityKeys.EMPLOYEE_MANAGE],
    delete: [AbilityKeys.EMPLOYEE_MANAGE],
    manage: [AbilityKeys.EMPLOYEE_MANAGE],
  },
};

const SUBMODULE_ATTENDANCE: AbilityBuilderSubmodule = {
  id: 'attendance',
  label: 'Attendance',
  actions: { view: [AbilityKeys.ATTENDANCE_VIEW_ALL] },
};

const SUBMODULE_ACTIVITY: AbilityBuilderSubmodule = {
  id: 'activity',
  label: 'Activity',
  actions: { view: [AbilityKeys.ACTIVITY_VIEW] },
};

const SUBMODULE_SALARY: AbilityBuilderSubmodule = {
  id: 'salary',
  label: 'Salary',
  actions: {
    view: [AbilityKeys.SALARY_READ],
    add: [AbilityKeys.SALARY_MANAGE],
    delete: [AbilityKeys.SALARY_MANAGE],
    manage: [AbilityKeys.SALARY_MANAGE],
  },
};

const SUBMODULE_LEAVE: AbilityBuilderSubmodule = {
  id: 'leave',
  label: 'Leave (dashboard, balances & reports)',
  actions: {
    view: [AbilityKeys.LEAVE_HR_DASHBOARD, AbilityKeys.LEAVE_REPORTS],
  },
};

const SUBMODULE_RESIGNATION: AbilityBuilderSubmodule = {
  id: 'resignation',
  label: 'Employee resignation workflow',
  actions: {
    view: [AbilityKeys.RESIGNATION_HR_QUEUE, AbilityKeys.RESIGNATION_REPORTS],
    manage: [AbilityKeys.RESIGNATION_HR_QUEUE],
  },
};

const SUBMODULE_POLICY: AbilityBuilderSubmodule = {
  id: 'company_policy',
  label: 'Policy documents',
  actions: { manage: [AbilityKeys.COMPANY_POLICY_MANAGE] },
};

const SUBMODULE_FEEDBACK: AbilityBuilderSubmodule = {
  id: 'feedback_survey',
  label: 'Feedback & surveys',
  actions: {
    view: [AbilityKeys.FEEDBACK_SURVEY_READ],
    add: [AbilityKeys.FEEDBACK_SURVEY_MANAGE],
    delete: [AbilityKeys.FEEDBACK_SURVEY_MANAGE],
    manage: [AbilityKeys.FEEDBACK_SURVEY_MANAGE],
  },
};

/** Placeholder submodules (no ability keys yet) — UI shows row; toggles stay inactive until APIs expose flags. */
function placeholderSubmodule(id: string, label: string): AbilityBuilderSubmodule {
  return { id, label, actions: {} };
}

/** Left-rail menu item: single View column toggles show/hide for that role. */
function navSidebarSubmodule(id: string, label: string, key: AbilityKey): AbilityBuilderSubmodule {
  return { id, label, actions: { view: [key] } };
}

const CATEGORY_SIDEBAR_NAV: AbilityBuilderCategory = {
  id: 'sidebar_navigation',
  label: 'Sidebar (navigation)',
  submodules: [
    navSidebarSubmodule('nav_dashboard', 'Dashboard', AbilityKeys.NAV_SIDEBAR_DASHBOARD),
    navSidebarSubmodule('nav_company', 'Company', AbilityKeys.NAV_SIDEBAR_COMPANY),
    navSidebarSubmodule('nav_workplace_hub', 'Workplace Hub', AbilityKeys.NAV_SIDEBAR_WORKPLACE_HUB),
    navSidebarSubmodule('nav_tasks', 'Tasks', AbilityKeys.NAV_SIDEBAR_TASKS),
    navSidebarSubmodule(
      'nav_team_project_tracker',
      'Team Project Tracker',
      AbilityKeys.NAV_SIDEBAR_TEAM_PROJECT_TRACKER
    ),
    navSidebarSubmodule('nav_contractors', 'Contractors', AbilityKeys.NAV_SIDEBAR_CONTRACTORS),
    navSidebarSubmodule('nav_my_projects', 'My Projects', AbilityKeys.NAV_SIDEBAR_MY_PROJECTS),
    navSidebarSubmodule('nav_my_tasks', 'My Tasks', AbilityKeys.NAV_SIDEBAR_MY_TASKS),
    navSidebarSubmodule('nav_my_payroll', 'My Payroll', AbilityKeys.NAV_SIDEBAR_MY_PAYROLL),
    navSidebarSubmodule('nav_attendance', 'Attendance', AbilityKeys.NAV_SIDEBAR_ATTENDANCE),
    navSidebarSubmodule(
      'nav_activity_calendar',
      'Activity calendar',
      AbilityKeys.NAV_SIDEBAR_ACTIVITY_CALENDAR
    ),
    navSidebarSubmodule('nav_system_feedback', 'System feedback', AbilityKeys.NAV_SIDEBAR_SYSTEM_FEEDBACK),
    navSidebarSubmodule('nav_balance', 'Balance', AbilityKeys.NAV_SIDEBAR_BALANCE),
    navSidebarSubmodule(
      'nav_bank_reconciliation',
      'Bank reconciliation',
      AbilityKeys.NAV_SIDEBAR_BANK_RECONCILIATION
    ),
    navSidebarSubmodule(
      'nav_salary_management',
      'Salary management',
      AbilityKeys.NAV_SIDEBAR_SALARY_MANAGEMENT
    ),
    navSidebarSubmodule(
      'nav_salary_employee_setup',
      'Salary employee setup',
      AbilityKeys.NAV_SIDEBAR_SALARY_EMPLOYEE_SETUP
    ),
    navSidebarSubmodule(
      'nav_salary_deductions',
      'Salary deductions',
      AbilityKeys.NAV_SIDEBAR_SALARY_DEDUCTIONS
    ),
    navSidebarSubmodule(
      'nav_salary_increments',
      'Salary increments',
      AbilityKeys.NAV_SIDEBAR_SALARY_INCREMENTS
    ),
    navSidebarSubmodule('nav_payroll', 'Payroll', AbilityKeys.NAV_SIDEBAR_PAYROLL),
    navSidebarSubmodule('nav_my_salary', 'My salary', AbilityKeys.NAV_SIDEBAR_MY_SALARY),
    navSidebarSubmodule(
      'nav_email_management',
      'Email management',
      AbilityKeys.NAV_SIDEBAR_EMAIL_MANAGEMENT
    ),
    navSidebarSubmodule('nav_it_support', 'IT support', AbilityKeys.NAV_SIDEBAR_IT_SUPPORT),
    navSidebarSubmodule(
      'nav_ai_evaluations',
      'AI evaluations',
      AbilityKeys.NAV_SIDEBAR_AI_EVALUATIONS
    ),
    navSidebarSubmodule('nav_settings', 'Settings', AbilityKeys.NAV_SIDEBAR_SETTINGS),
  ],
};

/** HR module: spreadsheet-style **submodules** with View/Add/Delete/Manage. */
export const ABILITY_BUILDER_CATEGORIES: readonly AbilityBuilderCategory[] = [
  {
    id: 'hr',
    label: 'HR',
    submodules: [
      SUBMODULE_COMPANY,
      placeholderSubmodule('hr_departments', 'Departments'),
      placeholderSubmodule('hr_authorities', 'Authorities'),
      placeholderSubmodule('hr_branches', 'Branches'),
      placeholderSubmodule('hr_designations', 'Designations'),
      SUBMODULE_EMPLOYEES,
      placeholderSubmodule('hr_employee_documents', 'Employee documents'),
      {
        id: 'hr_employee_expiry',
        label: 'Employee expiry tracker',
        actions: {
          view: [AbilityKeys.DOCUMENT_EXPIRY_VIEW],
          manage: [AbilityKeys.DOCUMENT_EXPIRY_REPORT],
        },
      },
      {
        id: 'hr_eam',
        label: 'Asset management (EAM)',
        actions: {
          view: [AbilityKeys.EAM_VIEW],
          add: [AbilityKeys.EAM_WAREHOUSE],
          manage: [AbilityKeys.EAM_MANAGE, AbilityKeys.EAM_CUSTODY],
        },
      },
      placeholderSubmodule('hr_onboarding', 'Employee onboarding'),
      SUBMODULE_RESIGNATION,
      placeholderSubmodule('hr_offboarding_legacy', 'Employee offboarding (legacy)'),
      placeholderSubmodule('hr_employee_notes', 'Employee notes'),
      placeholderSubmodule('hr_employee_roles', 'Employee roles & permissions'),
      placeholderSubmodule('hr_policy_categories', 'Policy categories'),
      SUBMODULE_POLICY,
      placeholderSubmodule('hr_policy_acknowledgment', 'Policy acknowledgment'),
      placeholderSubmodule('hr_leave_types', 'Leave types'),
      placeholderSubmodule('hr_leave_requests', 'Leave requests'),
      placeholderSubmodule('hr_leave_balances', 'Leave balances'),
      placeholderSubmodule('hr_leave_calendar', 'Leave calendar'),
      placeholderSubmodule('hr_leave_approvals', 'Leave approvals'),
      SUBMODULE_LEAVE,
      placeholderSubmodule('hr_surveys_employee', 'Employee surveys'),
      placeholderSubmodule('hr_surveys_client', 'Client surveys'),
      placeholderSubmodule('hr_surveys_performance', 'Performance surveys'),
      placeholderSubmodule('hr_surveys_results', 'Survey results dashboard'),
      SUBMODULE_FEEDBACK,
      SUBMODULE_ATTENDANCE,
      SUBMODULE_ACTIVITY,
      SUBMODULE_SALARY,

      // Sidebar visibility toggles (single View column) merged into the same Role Builder table.
      ...CATEGORY_SIDEBAR_NAV.submodules,
    ],
  },
] as const;

/** Flat list for backward-compatible clients and `findBuilderGroupAction`. */
export const ABILITY_BUILDER_GROUPS: readonly AbilityBuilderGroup[] = ABILITY_BUILDER_CATEGORIES.flatMap(
  (c) => [...c.submodules]
);

/**
 * When an ability is turned **on**, these are also turned on (e.g. company delete implies employee access).
 * Does not run on disable.
 */
export const ABILITY_ENABLE_IMPLIES: Partial<Record<AbilityKey, readonly AbilityKey[]>> = {
  [AbilityKeys.COMPANY_DELETE]: [AbilityKeys.EMPLOYEE_READ, AbilityKeys.EMPLOYEE_MANAGE],
};

export function getBuilderMetadata() {
  return {
    actionOrder: ['view', 'add', 'delete', 'manage'] as const satisfies readonly BuilderActionKind[],
    categories: ABILITY_BUILDER_CATEGORIES,
    groups: ABILITY_BUILDER_GROUPS,
    enableImplications: ABILITY_ENABLE_IMPLIES,
  };
}

export function findBuilderGroupAction(
  groupId: string,
  action: string
): readonly AbilityKey[] | null {
  const g = ABILITY_BUILDER_GROUPS.find((x) => x.id === groupId);
  if (!g) return null;
  const k = action as BuilderActionKind;
  const keys = g.actions[k];
  return keys && keys.length > 0 ? keys : null;
}

