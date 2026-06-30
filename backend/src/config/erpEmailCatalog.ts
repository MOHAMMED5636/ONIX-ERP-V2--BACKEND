/**
 * ERP Email Actions — master catalog (templates + triggers + backend wiring status).
 * Admin UI: Email Management → Templates → "Add ready-made templates"
 */

export type ErpEmailWiringStatus = 'wired' | 'template_only' | 'planned';

export type ErpEmailCatalogEntry = {
  id: string;
  module: string;
  phase: 'onboarding' | 'active' | 'exit' | 'system' | 'workflow' | 'ai';
  title: string;
  eventKey: string;
  templateName: string;
  status: ErpEmailWiringStatus;
  description?: string;
};

export const ERP_EMAIL_CATALOG: ErpEmailCatalogEntry[] = [
  // ── 1. Employee lifecycle (HR) ──
  { id: 'hr-welcome', module: 'HR', phase: 'onboarding', title: 'Employee Welcome (login + handbook)', eventKey: 'EMPLOYEE_WELCOME', templateName: 'WELCOME MESSAGE', status: 'wired', description: 'Sent via employee ERP access creation (hardcoded HTML path + optional template).' },
  { id: 'hr-offer-accept', module: 'HR', phase: 'onboarding', title: 'Offer Acceptance Confirmation', eventKey: 'OFFER_ACCEPTED', templateName: 'OFFER ACCEPTANCE', status: 'planned' },
  { id: 'hr-doc-request', module: 'HR', phase: 'onboarding', title: 'Document Submission Request', eventKey: 'DOCUMENT_SUBMISSION_REQUEST', templateName: 'DOCUMENT SUBMISSION REQUEST', status: 'planned' },
  { id: 'hr-it-setup', module: 'HR', phase: 'onboarding', title: 'IT Setup Instructions', eventKey: 'IT_SETUP_INSTRUCTIONS', templateName: 'IT SETUP INSTRUCTIONS', status: 'planned' },
  { id: 'hr-first-day', module: 'HR', phase: 'onboarding', title: 'First Day Instructions', eventKey: 'FIRST_DAY_INSTRUCTIONS', templateName: 'FIRST DAY INSTRUCTIONS', status: 'planned' },
  { id: 'hr-leave-approved', module: 'HR', phase: 'active', title: 'Leave Approval Notification', eventKey: 'LEAVE_APPROVED', templateName: 'LEAVE APPROVED', status: 'wired' },
  { id: 'hr-leave-rejected', module: 'HR', phase: 'active', title: 'Leave Rejection Notification', eventKey: 'LEAVE_REJECTED', templateName: 'LEAVE REJECTED', status: 'wired' },
  { id: 'hr-salary-slip', module: 'HR', phase: 'active', title: 'Salary Slip Release', eventKey: 'SALARY_CREDITED', templateName: 'SALARY CREDITED', status: 'wired' },
  { id: 'hr-policy-update', module: 'HR', phase: 'active', title: 'Policy Update Notification', eventKey: 'POLICY_UPDATED', templateName: 'POLICY UPDATE', status: 'template_only' },
  { id: 'hr-training', module: 'HR', phase: 'active', title: 'Training Assignment', eventKey: 'TRAINING_ASSIGNED', templateName: 'TRAINING ASSIGNMENT', status: 'planned' },
  { id: 'hr-performance', module: 'HR', phase: 'active', title: 'Performance Review Invitation', eventKey: 'PERFORMANCE_REVIEW_INVITE', templateName: 'PERFORMANCE REVIEW', status: 'planned' },
  { id: 'hr-resignation-ack', module: 'HR', phase: 'exit', title: 'Resignation Acknowledgement', eventKey: 'RESIGNATION_ACKNOWLEDGED', templateName: 'RESIGNATION ACKNOWLEDGEMENT', status: 'template_only' },
  { id: 'hr-exit-interview', module: 'HR', phase: 'exit', title: 'Exit Interview Scheduling', eventKey: 'EXIT_INTERVIEW_SCHEDULED', templateName: 'EXIT INTERVIEW', status: 'planned' },
  { id: 'hr-final-settlement', module: 'HR', phase: 'exit', title: 'Final Settlement Summary', eventKey: 'FINAL_SETTLEMENT', templateName: 'FINAL SETTLEMENT', status: 'planned' },
  { id: 'hr-asset-return', module: 'HR', phase: 'exit', title: 'Asset Return Reminder', eventKey: 'ASSET_RETURN_REMINDER', templateName: 'ASSET RETURN REMINDER', status: 'planned' },
  { id: 'hr-access-deactivated', module: 'HR', phase: 'exit', title: 'Access Deactivation Notification', eventKey: 'ACCESS_DEACTIVATED', templateName: 'ACCESS DEACTIVATED', status: 'planned' },

  // ── 2. Contractor management ──
  { id: 'ctr-invite', module: 'Contractor', phase: 'onboarding', title: 'Contractor Invitation', eventKey: 'CONTRACTOR_INVITED', templateName: 'CONTRACTOR INVITATION', status: 'planned' },
  { id: 'ctr-sign', module: 'Contractor', phase: 'onboarding', title: 'Contract Acceptance & Signing', eventKey: 'CONTRACT_SIGNING', templateName: 'CONTRACT SIGNING', status: 'planned' },
  { id: 'ctr-nda', module: 'Contractor', phase: 'onboarding', title: 'NDA / Compliance Agreement', eventKey: 'NDA_REQUEST', templateName: 'NDA REQUEST', status: 'planned' },
  { id: 'ctr-project-assign', module: 'Contractor', phase: 'onboarding', title: 'Project Assignment', eventKey: 'CONTRACTOR_PROJECT_ASSIGNED', templateName: 'CONTRACTOR PROJECT ASSIGNMENT', status: 'planned' },
  { id: 'ctr-task', module: 'Contractor', phase: 'active', title: 'Task Assignment', eventKey: 'TASK_ASSIGNED', templateName: 'TASK ASSIGNMENT', status: 'wired' },
  { id: 'ctr-milestone', module: 'Contractor', phase: 'active', title: 'Milestone Due Reminder', eventKey: 'MILESTONE_DUE_REMINDER', templateName: 'MILESTONE REMINDER', status: 'planned' },
  { id: 'ctr-timesheet', module: 'Contractor', phase: 'active', title: 'Timesheet Submission Reminder', eventKey: 'TIMESHEET_REMINDER', templateName: 'TIMESHEET REMINDER', status: 'planned' },
  { id: 'ctr-payment-status', module: 'Contractor', phase: 'active', title: 'Payment Approval Status', eventKey: 'PAYMENT_APPROVAL_STATUS', templateName: 'PAYMENT STATUS', status: 'planned' },
  { id: 'ctr-project-change', module: 'Contractor', phase: 'active', title: 'Project Change Notification', eventKey: 'PROJECT_CHANGE', templateName: 'PROJECT CHANGE', status: 'planned' },
  { id: 'ctr-complete', module: 'Contractor', phase: 'exit', title: 'Contract Completion Notice', eventKey: 'CONTRACT_COMPLETED', templateName: 'CONTRACT COMPLETION', status: 'planned' },

  // ── 3. Client / CRM ──
  { id: 'crm-welcome', module: 'CRM', phase: 'onboarding', title: 'Client Welcome', eventKey: 'CLIENT_WELCOME', templateName: 'CLIENT WELCOME', status: 'template_only' },
  { id: 'crm-portal', module: 'CRM', phase: 'onboarding', title: 'Portal Access', eventKey: 'CLIENT_PORTAL_ACCESS', templateName: 'CLIENT PORTAL ACCESS', status: 'planned' },
  { id: 'crm-kickoff', module: 'CRM', phase: 'onboarding', title: 'Project Kickoff', eventKey: 'PROJECT_KICKOFF', templateName: 'PROJECT KICKOFF', status: 'template_only' },
  { id: 'crm-weekly-report', module: 'CRM', phase: 'active', title: 'Weekly Progress Report', eventKey: 'WEEKLY_PROGRESS_REPORT', templateName: 'WEEKLY PROGRESS REPORT', status: 'planned' },
  { id: 'crm-milestone-done', module: 'CRM', phase: 'active', title: 'Milestone Completion Update', eventKey: 'MILESTONE_COMPLETED', templateName: 'MILESTONE COMPLETED', status: 'planned' },
  { id: 'crm-completion', module: 'CRM', phase: 'exit', title: 'Project Completion Report', eventKey: 'PROJECT_COMPLETION_REPORT', templateName: 'PROJECT COMPLETION REPORT', status: 'planned' },

  // ── 4. System-wide ──
  { id: 'sys-password-reset', module: 'System', phase: 'system', title: 'Password Reset', eventKey: 'PASSWORD_RESET', templateName: 'PASSWORD RESET', status: 'template_only' },
  { id: 'sys-login-otp', module: 'System', phase: 'system', title: 'Login OTP', eventKey: 'LOGIN_OTP', templateName: 'LOGIN OTP', status: 'wired', description: 'Hardcoded sendLoginOtpEmail service.' },
  { id: 'sys-mfa-alert', module: 'System', phase: 'system', title: 'MFA / Security Alert', eventKey: 'SECURITY_ALERT', templateName: 'SECURITY ALERT', status: 'planned' },
  { id: 'sys-role-change', module: 'System', phase: 'system', title: 'Role / Permission Change', eventKey: 'ROLE_CHANGED', templateName: 'ROLE CHANGE', status: 'planned' },
  { id: 'sys-maintenance', module: 'System', phase: 'system', title: 'System Maintenance Alert', eventKey: 'MAINTENANCE_ALERT', templateName: 'MAINTENANCE ALERT', status: 'planned' },

  // ── 5. Finance / Payroll ──
  { id: 'fin-salary', module: 'Finance', phase: 'active', title: 'Salary Processed', eventKey: 'SALARY_CREDITED', templateName: 'SALARY CREDITED', status: 'wired' },
  { id: 'fin-payroll-review', module: 'Finance', phase: 'active', title: 'Payroll Finance Review', eventKey: 'PAYROLL_FINANCE_REVIEW', templateName: 'PAYROLL FINANCE REVIEW', status: 'wired' },
  { id: 'fin-payroll-ready', module: 'Finance', phase: 'active', title: 'Payroll Payment Ready', eventKey: 'PAYROLL_PAYMENT_READY', templateName: 'PAYROLL PAYMENT READY', status: 'wired' },
  { id: 'fin-payslip-request', module: 'Finance', phase: 'active', title: 'Payslip Request (HR)', eventKey: 'PAYSLIP_REQUEST_RECEIVED', templateName: 'PAYSLIP REQUEST', status: 'wired' },
  { id: 'fin-invoice-sent', module: 'Finance', phase: 'active', title: 'Invoice Generated / Sent', eventKey: 'INVOICE_SENT', templateName: 'INVOICE SENT', status: 'planned' },
  { id: 'fin-expense', module: 'Finance', phase: 'active', title: 'Expense Approval / Rejection', eventKey: 'EXPENSE_DECISION', templateName: 'EXPENSE DECISION', status: 'planned' },

  // ── Projects / ERP core (cross-module) ──
  { id: 'prj-pm-assigned', module: 'Projects', phase: 'onboarding', title: 'Project Manager Assignment', eventKey: 'PROJECT_MANAGER_ASSIGNED', templateName: 'PROJECT MANAGER ASSIGNMENT', status: 'wired' },
  { id: 'prj-contract-created', module: 'Projects', phase: 'onboarding', title: 'Contract Created (PM assigned)', eventKey: 'CONTRACT_CREATED', templateName: 'CONTRACT CREATED', status: 'wired' },
  { id: 'prj-task-assigned', module: 'Projects', phase: 'active', title: 'Task Assignment', eventKey: 'TASK_ASSIGNED', templateName: 'TASK ASSIGNMENT', status: 'wired' },
  { id: 'prj-tender', module: 'Projects', phase: 'active', title: 'Tender Assignment', eventKey: 'TENDER_ASSIGNED', templateName: 'TENDER ASSIGNMENT', status: 'wired' },
  { id: 'prj-status-change', module: 'Projects', phase: 'workflow', title: 'Project Status Change', eventKey: 'PROJECT_STATUS_CHANGED', templateName: 'PROJECT STATUS CHANGE', status: 'planned' },
  { id: 'doc-expiry', module: 'Documents', phase: 'active', title: 'Document Expiry Warning', eventKey: 'DOCUMENT_EXPIRY_WARNING', templateName: 'DOCUMENT EXPIRY WARNING', status: 'template_only' },
];

export function getEmailCatalogSummary() {
  const total = ERP_EMAIL_CATALOG.length;
  const wired = ERP_EMAIL_CATALOG.filter((e) => e.status === 'wired').length;
  const templateOnly = ERP_EMAIL_CATALOG.filter((e) => e.status === 'template_only').length;
  const planned = ERP_EMAIL_CATALOG.filter((e) => e.status === 'planned').length;
  const byModule = ERP_EMAIL_CATALOG.reduce<Record<string, number>>((acc, e) => {
    acc[e.module] = (acc[e.module] || 0) + 1;
    return acc;
  }, {});
  return { total, wired, templateOnly, planned, byModule };
}
