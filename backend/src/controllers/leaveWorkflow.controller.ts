import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { LeaveWorkflowStage } from '@prisma/client';
import {
  usesAnnualEnterpriseWorkflow,
  appendWorkflowLog,
  notifyLeaveWorkflow,
  transitionLeaveStage,
  finalizeHrApproval,
  isFinanceClearanceUser,
  getFinanceClearanceUserIds,
} from '../services/leaveAnnualWorkflow.service';
import {
  getCertificatePath,
  certificateExists,
  buildCertificateRefNo,
} from '../services/leaveCertificate.service';

function isHrLeaveRole(role: string | undefined): boolean {
  return role === 'ADMIN' || role === 'HR' || role === 'SUPER_ADMIN';
}

async function employeeIsManagedByLineManager(employeeUserId: string, managerUserId: string): Promise<boolean> {
  const direct = await prisma.user.findFirst({
    where: { id: employeeUserId, managerId: managerUserId },
    select: { id: true },
  });
  if (direct) return true;
  const leave = await prisma.leave.findFirst({
    where: { userId: employeeUserId, assignedLineManagerId: managerUserId },
    select: { id: true },
  });
  return !!leave;
}

async function canActAsLineManager(leaveUserId: string, actorId: string, assignedLineManagerId: string | null, assignedSecondLineManagerId?: string | null): Promise<boolean> {
  if (assignedLineManagerId === actorId || assignedSecondLineManagerId === actorId) return true;
  const u = await prisma.user.findUnique({
    where: { id: leaveUserId },
    select: { managerId: true },
  });
  if (u?.managerId === actorId) return true;
  return employeeIsManagedByLineManager(leaveUserId, actorId);
}

const workflowInclude = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      department: true,
      position: true,
      managerId: true,
    },
  },
  assignedLineManager: { select: { id: true, firstName: true, lastName: true } },
  assignedSecondLineManager: { select: { id: true, firstName: true, lastName: true } },
  secondManagerActionBy: { select: { id: true, firstName: true, lastName: true } },
  managerActionBy: { select: { id: true, firstName: true, lastName: true } },
  projectConfirmedBy: { select: { id: true, firstName: true, lastName: true } },
  financeActionBy: { select: { id: true, firstName: true, lastName: true } },
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
  rejectedBy: { select: { id: true, firstName: true, lastName: true } },
};

function requireAnnualWorkflow(leave: { type: string; workflowStage: LeaveWorkflowStage | null }) {
  if (!usesAnnualEnterpriseWorkflow(leave.type as any)) {
    throw new Error('NOT_ANNUAL_WORKFLOW');
  }
  if (!leave.workflowStage) {
    throw new Error('NO_WORKFLOW');
  }
}

/** HR: move from PENDING_HR_REVIEW → PENDING_PROJECT_CONFIRMATION and notify line manager */
export const hrRequestProjectConfirmation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    if (!userId || !isHrLeaveRole(role)) {
      res.status(403).json({ success: false, message: 'Only HR can request project confirmation' });
      return;
    }

    const leave = await prisma.leave.findUnique({ where: { id } });
    if (!leave) {
      res.status(404).json({ success: false, message: 'Leave not found' });
      return;
    }
    requireAnnualWorkflow(leave);

    if (leave.workflowStage !== 'PENDING_HR_REVIEW') {
      res.status(400).json({ success: false, message: 'Leave is not at HR review stage' });
      return;
    }

    await transitionLeaveStage({
      leaveId: id,
      actorId: userId,
      action: 'HR_REQUEST_PROJECT_CONFIRMATION',
      newStage: 'PENDING_PROJECT_CONFIRMATION',
      comment: req.body?.notes,
    });

    await notifyLeaveWorkflow({
      leaveId: id,
      event: 'project_confirmation_request',
      employeeUserId: leave.userId,
      lineManagerId: leave.assignedLineManagerId,
      secondLineManagerId: leave.assignedSecondLineManagerId,
    });

    const updated = await prisma.leave.findUnique({ where: { id }, include: workflowInclude });
    res.json({ success: true, message: 'Project confirmation request sent to line manager', data: updated });
  } catch (e: any) {
    if (e.message === 'NOT_ANNUAL_WORKFLOW') {
      res.status(400).json({ success: false, message: 'Enterprise workflow applies to annual leave only' });
      return;
    }
    console.error('hrRequestProjectConfirmation:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Line manager: respond to project confirmation */
export const respondProjectConfirmation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { hasConflict, notes } = req.body || {};
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const leave = await prisma.leave.findUnique({ where: { id } });
    if (!leave) {
      res.status(404).json({ success: false, message: 'Leave not found' });
      return;
    }
    requireAnnualWorkflow(leave);

    if (leave.workflowStage !== 'PENDING_PROJECT_CONFIRMATION') {
      res.status(400).json({ success: false, message: 'No pending project confirmation for this request' });
      return;
    }

    const canAct = await canActAsLineManager(
      leave.userId,
      userId,
      leave.assignedLineManagerId,
      leave.assignedSecondLineManagerId,
    );
    if (!canAct) {
      res.status(403).json({ success: false, message: 'Only the assigned line manager can respond' });
      return;
    }

    const conflict = Boolean(hasConflict);
    const noteText = notes ? String(notes).trim() : '';

    if (conflict) {
      await transitionLeaveStage({
        leaveId: id,
        actorId: userId,
        action: 'PROJECT_CONFLICT_REPORTED',
        newStage: 'PROJECT_CONFLICT_REPORTED',
        comment: noteText,
        extraData: {
          projectConflict: true,
          projectConfirmationNotes: noteText || null,
          projectConfirmedById: userId,
          projectConfirmedAt: new Date(),
        },
      });
      await notifyLeaveWorkflow({
        leaveId: id,
        event: 'project_conflict',
        employeeUserId: leave.userId,
      });
    } else {
      await transitionLeaveStage({
        leaveId: id,
        actorId: userId,
        action: 'PROJECT_CONFIRMED_CLEAR',
        newStage: 'PENDING_FINANCE_CLEARANCE',
        comment: noteText,
        extraData: {
          projectConflict: false,
          projectConfirmationNotes: noteText || null,
          projectConfirmedById: userId,
          projectConfirmedAt: new Date(),
          financeClearanceStatus: 'PENDING',
        },
      });
      await notifyLeaveWorkflow({
        leaveId: id,
        event: 'finance_request',
        employeeUserId: leave.userId,
      });
    }

    const updated = await prisma.leave.findUnique({ where: { id }, include: workflowInclude });
    res.json({ success: true, message: conflict ? 'Project conflict reported to HR' : 'Forwarded to finance clearance', data: updated });
  } catch (e: any) {
    console.error('respondProjectConfirmation:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Finance/Admin: clearance decision */
export const financeClearance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { cleared, remarks } = req.body || {};
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    if (!(await isFinanceClearanceUser(userId))) {
      res.status(403).json({ success: false, message: 'Not authorized for finance clearance' });
      return;
    }

    const leave = await prisma.leave.findUnique({ where: { id } });
    if (!leave) {
      res.status(404).json({ success: false, message: 'Leave not found' });
      return;
    }
    requireAnnualWorkflow(leave);

    if (leave.workflowStage !== 'PENDING_FINANCE_CLEARANCE') {
      res.status(400).json({ success: false, message: 'Leave is not awaiting finance clearance' });
      return;
    }

    const isCleared = Boolean(cleared);
    const remarkText = remarks ? String(remarks).trim() : '';

    if (!isCleared && !remarkText) {
      res.status(400).json({ success: false, message: 'Remarks are required when finance issue is found' });
      return;
    }

    if (isCleared) {
      await transitionLeaveStage({
        leaveId: id,
        actorId: userId,
        action: 'FINANCE_CLEARED',
        newStage: 'PENDING_HR_FINAL',
        comment: remarkText,
        extraData: {
          financeClearanceStatus: 'CLEARED',
          financeRemarks: remarkText || null,
          financeActionById: userId,
          financeActionAt: new Date(),
        },
      });
      await notifyLeaveWorkflow({ leaveId: id, event: 'finance_cleared', employeeUserId: leave.userId });
    } else {
      await transitionLeaveStage({
        leaveId: id,
        actorId: userId,
        action: 'FINANCE_ISSUE_FOUND',
        newStage: 'FINANCE_ISSUE_FOUND',
        comment: remarkText,
        extraData: {
          financeClearanceStatus: 'ISSUE_FOUND',
          financeRemarks: remarkText,
          financeActionById: userId,
          financeActionAt: new Date(),
        },
      });
      await notifyLeaveWorkflow({ leaveId: id, event: 'finance_issue', employeeUserId: leave.userId });
    }

    const updated = await prisma.leave.findUnique({ where: { id }, include: workflowInclude });
    res.json({
      success: true,
      message: isCleared ? 'Finance cleared — returned to HR for final approval' : 'Finance issue reported to HR',
      data: updated,
    });
  } catch (e: any) {
    console.error('financeClearance:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** HR: final approval after all clearances */
export const hrFinalApprove = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    if (!userId || !isHrLeaveRole(role)) {
      res.status(403).json({ success: false, message: 'Only HR can give final approval' });
      return;
    }

    const leave = await prisma.leave.findUnique({ where: { id } });
    if (!leave) {
      res.status(404).json({ success: false, message: 'Leave not found' });
      return;
    }
    requireAnnualWorkflow(leave);

    const allowed: LeaveWorkflowStage[] = ['PENDING_HR_FINAL', 'FINANCE_CLEARED'];
    const needsCertRecovery =
      leave.workflowStage === 'APPROVED' && !leave.certificateFilename && !!leave.hrFinalApprovedAt;

    if (!needsCertRecovery && (!leave.workflowStage || !allowed.includes(leave.workflowStage))) {
      res.status(400).json({
        success: false,
        message: 'Leave must complete manager, project, and finance clearance before final approval',
      });
      return;
    }

    await finalizeHrApproval(id, userId);
    const updated = await prisma.leave.findUnique({ where: { id }, include: workflowInclude });
    res.json({
      success: true,
      message: needsCertRecovery ? 'Leave certificate generated' : 'Leave approved and certificate generated',
      data: updated,
    });
  } catch (e: any) {
    console.error('hrFinalApprove:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** HR: reject or put on hold */
export const hrWorkflowReject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    const { reason, onHold } = req.body || {};
    if (!userId || !isHrLeaveRole(role)) {
      res.status(403).json({ success: false, message: 'Only HR can reject or hold leave' });
      return;
    }

    const trimmed = reason ? String(reason).trim() : '';
    if (!onHold && !trimmed) {
      res.status(400).json({ success: false, message: 'Rejection reason is required' });
      return;
    }

    const leave = await prisma.leave.findUnique({ where: { id } });
    if (!leave) {
      res.status(404).json({ success: false, message: 'Leave not found' });
      return;
    }
    requireAnnualWorkflow(leave);

    const prev = leave.workflowStage;
    if (onHold) {
      await prisma.leave.update({
        where: { id },
        data: {
          workflowStage: 'ON_HOLD',
          onHoldReason: trimmed || null,
        },
      });
      await appendWorkflowLog({
        leaveId: id,
        actorId: userId,
        action: 'HR_ON_HOLD',
        previousStage: prev,
        newStage: 'ON_HOLD',
        comment: trimmed,
      });
      await notifyLeaveWorkflow({ leaveId: id, event: 'on_hold', employeeUserId: leave.userId });
    } else {
      await prisma.leave.update({
        where: { id },
        data: {
          status: 'REJECTED',
          workflowStage: 'REJECTED_BY_HR',
          rejectedById: userId,
          rejectedAt: new Date(),
          rejectionReason: trimmed,
        },
      });
      await appendWorkflowLog({
        leaveId: id,
        actorId: userId,
        action: 'HR_REJECT',
        previousStage: prev,
        newStage: 'REJECTED_BY_HR',
        comment: trimmed,
      });
      await notifyLeaveWorkflow({ leaveId: id, event: 'hr_rejected', employeeUserId: leave.userId });
    }

    const updated = await prisma.leave.findUnique({ where: { id }, include: workflowInclude });
    res.json({
      success: true,
      message: onHold ? 'Leave placed on hold' : 'Leave rejected by HR',
      data: updated,
    });
  } catch (e: any) {
    console.error('hrWorkflowReject:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** HR: resume from on hold → back to project confirmation or finance as appropriate */
export const hrResumeFromHold = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    const { targetStage } = req.body || {};
    if (!userId || !isHrLeaveRole(role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    const leave = await prisma.leave.findUnique({ where: { id } });
    if (!leave || leave.workflowStage !== 'ON_HOLD') {
      res.status(400).json({ success: false, message: 'Leave is not on hold' });
      return;
    }

    const next = (targetStage as LeaveWorkflowStage) || 'PENDING_PROJECT_CONFIRMATION';
    await transitionLeaveStage({
      leaveId: id,
      actorId: userId,
      action: 'HR_RESUME_FROM_HOLD',
      newStage: next,
      comment: req.body?.notes,
      extraData: { onHoldReason: null },
    });

    const updated = await prisma.leave.findUnique({ where: { id }, include: workflowInclude });
    res.json({ success: true, message: 'Leave resumed from hold', data: updated });
  } catch (e: any) {
    console.error('hrResumeFromHold:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Workflow audit log */
export const getWorkflowLog = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const leave = await prisma.leave.findUnique({
      where: { id },
      select: {
        userId: true,
        assignedLineManagerId: true,
        assignedSecondLineManagerId: true,
        type: true,
        workflowStage: true,
        financeActionById: true,
      },
    });
    if (!leave) {
      res.status(404).json({ success: false, message: 'Leave not found' });
      return;
    }

    const isFinance = await isFinanceClearanceUser(userId);
    const isFinanceHistoryLeave = leave.type === 'ANNUAL' && leave.workflowStage != null;
    const canSee =
      leave.userId === userId ||
      isHrLeaveRole(role) ||
      leave.assignedLineManagerId === userId ||
      leave.assignedSecondLineManagerId === userId ||
      (isFinance && isFinanceHistoryLeave) ||
      leave.financeActionById === userId;
    if (!canSee) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    const logs = await prisma.leaveWorkflowLog.findMany({
      where: { leaveId: id },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { id: true, firstName: true, lastName: true } } },
    });

    res.json({ success: true, data: logs });
  } catch (e) {
    console.error('getWorkflowLog:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Finance queue */
export const listFinanceClearanceQueue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId || !(await isFinanceClearanceUser(userId))) {
      res.status(403).json({ success: false, message: 'Not authorized' });
      return;
    }

    const leaves = await prisma.leave.findMany({
      where: {
        type: 'ANNUAL',
        workflowStage: { in: ['PENDING_FINANCE_CLEARANCE', 'FINANCE_ISSUE_FOUND'] },
      },
      orderBy: { updatedAt: 'desc' },
      include: workflowInclude,
    });

    res.json({ success: true, data: leaves });
  } catch (e) {
    console.error('listFinanceClearanceQueue:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Project confirmation queue for line managers */
export const listProjectConfirmationQueue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const leaves = await prisma.leave.findMany({
      where: {
        type: 'ANNUAL',
        workflowStage: 'PENDING_PROJECT_CONFIRMATION',
        OR: [{ assignedLineManagerId: userId }, { assignedSecondLineManagerId: userId }, { user: { managerId: userId } }],
      },
      orderBy: { updatedAt: 'desc' },
      include: workflowInclude,
    });

    res.json({ success: true, data: leaves });
  } catch (e) {
    console.error('listProjectConfirmationQueue:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Shared validation for public certificate verify + meta (no login). */
async function resolvePublicCertificateAccess(id: string, ref: string) {
  const leave = await prisma.leave.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      type: true,
      startDate: true,
      endDate: true,
      days: true,
      certificateFilename: true,
      hrFinalApprovedAt: true,
      approvedAt: true,
      returnToWorkDate: true,
      user: { select: { firstName: true, lastName: true, employeeId: true, company: true } },
    },
  });

  if (!leave?.certificateFilename || leave.status !== 'APPROVED' || leave.type !== 'ANNUAL') {
    return { error: { status: 404, message: 'Certificate not found' } as const };
  }

  const approvalDate = leave.hrFinalApprovedAt || leave.approvedAt;
  if (!approvalDate) {
    return { error: { status: 404, message: 'Certificate not found' } as const };
  }

  const expectedRef = buildCertificateRefNo(leave.id, approvalDate);
  if (!ref || ref !== expectedRef) {
    return { error: { status: 403, message: 'Invalid verification reference' } as const };
  }

  if (!certificateExists(leave.certificateFilename)) {
    return { error: { status: 404, message: 'Certificate file missing' } as const };
  }

  return {
    leave,
    expectedRef,
    filePath: getCertificatePath(leave.certificateFilename),
  };
}

/** Public JSON summary for verify page (no login). */
export const publicLeaveCertificateMeta = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const ref = String(req.query.ref || '').trim();
    const resolved = await resolvePublicCertificateAccess(id, ref);
    if ('error' in resolved && resolved.error) {
      res.status(resolved.error.status).json({ success: false, message: resolved.error.message });
      return;
    }
    if (!('filePath' in resolved)) {
      res.status(500).json({ success: false, message: 'Internal server error' });
      return;
    }

    const { leave, expectedRef } = resolved;
    const employeeName = `${leave.user.firstName || ''} ${leave.user.lastName || ''}`.trim();
    res.json({
      success: true,
      data: {
        ref: expectedRef,
        employeeName,
        employeeId: leave.user.employeeId || null,
        company: leave.user.company || null,
        startDate: leave.startDate,
        endDate: leave.endDate,
        days: leave.days,
        returnToWorkDate: leave.returnToWorkDate,
        approvedAt: leave.hrFinalApprovedAt || leave.approvedAt,
      },
    });
  } catch (e) {
    console.error('publicLeaveCertificateMeta:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Public: scan QR on certificate PDF to open the original document (no login). */
export const publicVerifyLeaveCertificate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const ref = String(req.query.ref || '').trim();
    const resolved = await resolvePublicCertificateAccess(id, ref);
    if ('error' in resolved && resolved.error) {
      res.status(resolved.error.status).json({ success: false, message: resolved.error.message });
      return;
    }
    if (!('filePath' in resolved)) {
      res.status(500).json({ success: false, message: 'Internal server error' });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="annual-leave-certificate.pdf"');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(resolved.filePath);
  } catch (e) {
    console.error('publicVerifyLeaveCertificate:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Download leave certificate PDF */
export const downloadLeaveCertificate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const leave = await prisma.leave.findUnique({
      where: { id },
      select: { userId: true, certificateFilename: true, workflowStage: true },
    });
    if (!leave?.certificateFilename) {
      res.status(404).json({ success: false, message: 'Certificate not found' });
      return;
    }

    const canDownload =
      leave.userId === userId ||
      isHrLeaveRole(role) ||
      role === 'MANAGER' ||
      role === 'PROJECT_MANAGER' ||
      role === 'ADMIN';
    if (!canDownload) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    if (!certificateExists(leave.certificateFilename)) {
      res.status(404).json({ success: false, message: 'Certificate file missing' });
      return;
    }

    const filePath = getCertificatePath(leave.certificateFilename);
    res.download(filePath, leave.certificateFilename);
  } catch (e) {
    console.error('downloadLeaveCertificate:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Regenerate certificate (HR only) */
export const regenerateCertificate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    if (!userId || !isHrLeaveRole(role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    const leave = await prisma.leave.findUnique({ where: { id } });
    if (!leave || leave.status !== 'APPROVED') {
      res.status(400).json({ success: false, message: 'Leave must be approved' });
      return;
    }

    const { generateAnnualLeaveCertificate } = await import('../services/leaveCertificate.service');
    const filename = await generateAnnualLeaveCertificate(id);
    res.json({ success: true, message: 'Certificate regenerated', data: { certificateFilename: filename } });
  } catch (e) {
    console.error('regenerateCertificate:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const listHrFinalApprovalQueue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    if (!isHrLeaveRole(role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    const leaves = await prisma.leave.findMany({
      where: {
        type: 'ANNUAL',
        workflowStage: { in: ['PENDING_HR_FINAL', 'FINANCE_CLEARED', 'PENDING_HR_REVIEW', 'PROJECT_CONFLICT_REPORTED', 'FINANCE_ISSUE_FOUND', 'ON_HOLD'] },
        status: 'PENDING',
      },
      orderBy: { updatedAt: 'desc' },
      include: workflowInclude,
    });

    res.json({ success: true, data: leaves });
  } catch (e) {
    console.error('listHrFinalApprovalQueue:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
