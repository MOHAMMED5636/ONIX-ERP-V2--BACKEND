import prisma from '../config/database';
import { notifyLeaveStatusEmail } from './emailDispatch.service';
import { LeaveType, LeaveWorkflowStage } from '@prisma/client';
import { sendBrowserPushToUsers } from './browserPush.service';
import { generateAnnualLeaveCertificate, computeReturnToWorkDate } from './leaveCertificate.service';

export function usesAnnualEnterpriseWorkflow(type: LeaveType): boolean {
  return type === 'ANNUAL';
}

const STAGE_LABELS: Record<LeaveWorkflowStage, string> = {
  DRAFT: 'Draft',
  PENDING_LINE_MANAGER: 'Pending Line Manager Approval',
  PENDING_HR_REVIEW: 'Pending HR Review',
  PENDING_PROJECT_CONFIRMATION: 'Pending Project Confirmation',
  PROJECT_CONFLICT_REPORTED: 'Project Conflict Reported',
  ON_HOLD: 'On Hold',
  PENDING_FINANCE_CLEARANCE: 'Pending Finance Clearance',
  FINANCE_CLEARED: 'Finance Cleared',
  FINANCE_ISSUE_FOUND: 'Finance Issue Found',
  PENDING_HR_FINAL: 'Pending HR Final Approval',
  APPROVED: 'Approved',
  CERTIFICATE_GENERATED: 'Leave Certificate Generated',
  REJECTED_BY_MANAGER: 'Rejected by Line Manager',
  REJECTED_BY_HR: 'Rejected by HR',
};

export function workflowStageLabel(stage: LeaveWorkflowStage | null | undefined): string {
  if (!stage) return '—';
  return STAGE_LABELS[stage] || stage;
}

/** Authorized finance clearance officers (Mohammed Khaled Taan, Khaled Taan) + Finance dept leads + Admin. */
export async function getFinanceClearanceUserIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { lastName: { equals: 'Taan', mode: 'insensitive' } },
        {
          AND: [
            { department: { contains: 'Finance', mode: 'insensitive' } },
            {
              OR: [
                { position: { contains: 'Finance', mode: 'insensitive' } },
                { jobTitle: { contains: 'Finance', mode: 'insensitive' } },
                { email: { contains: 'accounting', mode: 'insensitive' } },
              ],
            },
          ],
        },
        { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
      ],
    },
    select: { id: true },
  });
  return [...new Set(users.map((u) => u.id))];
}

export async function isFinanceClearanceUser(userId: string): Promise<boolean> {
  const ids = await getFinanceClearanceUserIds();
  return ids.includes(userId);
}

export async function getHrUserIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['HR', 'ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export async function appendWorkflowLog(params: {
  leaveId: string;
  actorId?: string | null;
  action: string;
  previousStage?: LeaveWorkflowStage | null;
  newStage?: LeaveWorkflowStage | null;
  comment?: string | null;
}): Promise<void> {
  await prisma.leaveWorkflowLog.create({
    data: {
      leaveId: params.leaveId,
      actorId: params.actorId || null,
      action: params.action,
      previousStage: params.previousStage ?? null,
      newStage: params.newStage ?? null,
      comment: params.comment?.trim() || null,
    },
  });
}

async function notifyUsers(
  userIds: string[],
  title: string,
  body: string,
  url = '/workplace/leaves',
): Promise<void> {
  try {
    await sendBrowserPushToUsers(userIds, { title, body, url, tag: 'leave-workflow' });
  } catch {
    /* push optional */
  }
}

export async function notifyLeaveWorkflow(params: {
  leaveId: string;
  event:
    | 'submitted'
    | 'manager_approved'
    | 'manager_rejected'
    | 'hr_review'
    | 'project_confirmation_request'
    | 'project_conflict'
    | 'finance_request'
    | 'finance_cleared'
    | 'finance_issue'
    | 'hr_approved'
    | 'hr_rejected'
    | 'certificate_ready'
    | 'on_hold'
    | 'second_manager_approval_needed';
  employeeUserId: string;
  lineManagerId?: string | null;
  secondLineManagerId?: string | null;
}): Promise<void> {
  const { leaveId, event, employeeUserId, lineManagerId, secondLineManagerId } = params;
  const url = `/workplace/leaves?leaveId=${leaveId}`;
  const hrIds = await getHrUserIds();
  const financeIds = await getFinanceClearanceUserIds();

  switch (event) {
    case 'submitted':
      await notifyUsers([employeeUserId], 'Leave Request Submitted', 'Your annual leave request has been submitted.', url);
      {
        const mgrIds = [lineManagerId, secondLineManagerId].filter(Boolean) as string[];
        if (mgrIds.length) {
          await notifyUsers(
            mgrIds,
            'New Leave Request',
            'A team member submitted an annual leave request for your approval.',
            '/workplace/leaves/team',
          );
        }
      }
      break;
    case 'second_manager_approval_needed':
      if (secondLineManagerId) {
        await notifyUsers(
          [secondLineManagerId],
          'Second Line Manager Approval Required',
          'Primary line manager approved — your approval is needed before HR review.',
          '/workplace/leaves/team',
        );
      }
      await notifyUsers(
        [employeeUserId],
        'Manager Approved (1 of 2)',
        'Your primary line manager approved. Awaiting second line manager approval.',
        url,
      );
      break;
    case 'manager_approved':
      await notifyUsers([employeeUserId], 'Manager Approved', 'Your leave request was approved by your line manager and forwarded to HR.', url);
      await notifyUsers(hrIds, 'Manager Approval Received', 'An annual leave request is ready for HR review.', '/workplace/leaves');
      break;
    case 'manager_rejected':
      await notifyUsers([employeeUserId], 'Leave Rejected by Manager', 'Your line manager rejected your leave request.', url);
      void notifyLeaveStatusEmail({ leaveId, decision: 'rejected', rejectedBy: 'manager' });
      break;
    case 'project_confirmation_request':
      {
        const mgrIds = [lineManagerId, secondLineManagerId].filter(Boolean) as string[];
        if (mgrIds.length) {
          await notifyUsers(
            mgrIds,
            'Project Confirmation Required',
            'HR needs your confirmation on project availability during the requested leave period.',
            '/workplace/leaves/team',
          );
        }
      }
      break;
    case 'project_conflict':
      await notifyUsers(hrIds, 'Project Conflict Reported', 'Line manager reported project conflicts for a leave request.', '/workplace/leaves');
      break;
    case 'finance_request':
      await notifyUsers(financeIds, 'Finance Clearance Required', 'A leave request requires finance/admin clearance.', '/workplace/leaves/finance');
      break;
    case 'finance_cleared':
      await notifyUsers(hrIds, 'Finance Cleared', 'Finance clearance completed — ready for HR final approval.', '/workplace/leaves');
      break;
    case 'finance_issue':
      await notifyUsers(hrIds, 'Finance Issue Found', 'Finance reported an issue on a leave clearance request.', '/workplace/leaves');
      await notifyUsers([employeeUserId], 'Finance Issue on Leave', 'Finance reported an issue with your leave request. HR will follow up.', url);
      break;
    case 'hr_approved':
      await notifyUsers([employeeUserId], 'Leave Approved', 'Your annual leave has been approved by HR.', url);
      void notifyLeaveStatusEmail({ leaveId, decision: 'approved' });
      break;
    case 'hr_rejected':
      await notifyUsers([employeeUserId], 'Leave Rejected by HR', 'Your leave request was rejected by HR.', url);
      void notifyLeaveStatusEmail({ leaveId, decision: 'rejected', rejectedBy: 'hr' });
      break;
    case 'certificate_ready':
      await notifyUsers([employeeUserId], 'Leave Certificate Ready', 'Your annual leave certificate is ready to download.', url);
      break;
    case 'on_hold':
      await notifyUsers([employeeUserId], 'Leave On Hold', 'Your leave request has been placed on hold.', url);
      break;
    default:
      break;
  }
}

export async function transitionLeaveStage(params: {
  leaveId: string;
  actorId: string;
  action: string;
  newStage: LeaveWorkflowStage;
  comment?: string;
  extraData?: Record<string, unknown>;
}): Promise<void> {
  const leave = await prisma.leave.findUnique({ where: { id: params.leaveId } });
  if (!leave) throw new Error('Leave not found');

  const prev = leave.workflowStage;
  await prisma.leave.update({
    where: { id: params.leaveId },
    data: {
      workflowStage: params.newStage,
      ...(params.extraData as object),
    },
  });

  await appendWorkflowLog({
    leaveId: params.leaveId,
    actorId: params.actorId,
    action: params.action,
    previousStage: prev,
    newStage: params.newStage,
    comment: params.comment,
  });
}

export async function finalizeHrApproval(leaveId: string, hrUserId: string): Promise<void> {
  const leave = await prisma.leave.findUnique({ where: { id: leaveId } });
  if (!leave) throw new Error('Leave not found');

  const returnToWork = computeReturnToWorkDate(leave.endDate);
  const prev = leave.workflowStage;
  const alreadyApproved = leave.workflowStage === 'APPROVED' && !!leave.hrFinalApprovedAt;

  if (!alreadyApproved) {
    await prisma.leave.update({
      where: { id: leaveId },
      data: {
        status: 'APPROVED',
        workflowStage: 'APPROVED',
        approvedById: hrUserId,
        approvedAt: new Date(),
        hrFinalApprovedAt: new Date(),
        returnToWorkDate: returnToWork,
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
      },
    });

    await appendWorkflowLog({
      leaveId,
      actorId: hrUserId,
      action: 'HR_FINAL_APPROVE',
      previousStage: prev,
      newStage: 'APPROVED',
    });
  }

  if (!leave.certificateFilename) {
    await generateAnnualLeaveCertificate(leaveId);

    await appendWorkflowLog({
      leaveId,
      actorId: hrUserId,
      action: 'CERTIFICATE_GENERATED',
      previousStage: 'APPROVED',
      newStage: 'CERTIFICATE_GENERATED',
    });

    await notifyLeaveWorkflow({
      leaveId,
      event: 'certificate_ready',
      employeeUserId: leave.userId,
    });
  }

  if (!alreadyApproved) {
    await notifyLeaveWorkflow({
      leaveId,
      event: 'hr_approved',
      employeeUserId: leave.userId,
      lineManagerId: leave.assignedLineManagerId,
    });
  }
}
