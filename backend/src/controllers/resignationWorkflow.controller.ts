import { Response } from 'express';
import { RetentionRecommendation } from '@prisma/client';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  appendResignationLog,
  canActAsProjectManager,
  finalizeResignation,
  isFinanceUser,
  isGeneralManagerUser,
  isHrRole,
  notifyResignationWorkflow,
  resignationInclude,
  retentionRequiresGm,
  transitionResignationStage,
  defaultAssetChecklist,
  defaultExitChecklist,
  defaultFinanceChecklist,
} from '../services/resignationWorkflow.service';
import { countAssignedAssets } from '../services/eam/custody.service';
import {
  generateResignationDocuments,
  getResignationDocumentPath,
  resignationDocumentExists,
} from '../services/resignationDocument.service';

const VALID_RETENTION: RetentionRecommendation[] = [
  'NO_RETENTION',
  'RETAIN_EMPLOYEE',
  'SALARY_INCREMENT',
  'PROMOTION',
  'DEPARTMENT_TRANSFER',
  'ADDITIONAL_BENEFITS',
  'CRITICAL_RESOURCE_MGMT_REVIEW',
];

function requireComment(body: { comments?: string; comment?: string; reason?: string }, label = 'Comments'): string | null {
  const c = body.comments || body.comment || body.reason;
  if (!c || !String(c).trim()) return null;
  return String(c).trim();
}

async function loadResignation(id: string) {
  return prisma.resignationRequest.findUnique({ where: { id }, include: resignationInclude });
}

/** GET /api/resignations/team/queue — project manager: all team resignations (any stage) */
export const listPmQueue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const rows = await prisma.resignationRequest.findMany({
      where: {
        OR: [
          { assignedProjectManagerId: userId },
          { user: { managerId: userId } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: resignationInclude,
    });
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('listPmQueue:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** GET /api/resignations/gm/queue — all resignations (permanent approval history) */
export const listGmQueue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId || !(await isGeneralManagerUser(userId))) {
      res.status(403).json({ success: false, message: 'General Manager access required' });
      return;
    }
    const rows = await prisma.resignationRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: resignationInclude,
    });
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('listGmQueue:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** GET /api/resignations/finance/queue — all resignations (permanent approval history) */
export const listFinanceQueue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId || !(await isFinanceUser(userId))) {
      res.status(403).json({ success: false, message: 'Finance clearance access required' });
      return;
    }
    const rows = await prisma.resignationRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: resignationInclude,
    });
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('listFinanceQueue:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** POST /api/resignations/:id/pm/approve */
export const pmApprove = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const row = await prisma.resignationRequest.findUnique({ where: { id } });
    if (!row) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    if (!['PENDING_PROJECT_MANAGER', 'DISCUSSION_REQUESTED'].includes(row.workflowStage)) {
      res.status(400).json({ success: false, message: 'Not awaiting project manager action' });
      return;
    }
    if (!(await canActAsProjectManager(row.userId, userId, row.assignedProjectManagerId))) {
      res.status(403).json({ success: false, message: 'Not assigned project manager' });
      return;
    }

    const comment = requireComment(req.body);
    if (!comment) {
      res.status(400).json({ success: false, message: 'Manager comments are mandatory' });
      return;
    }

    const {
      retentionRecommendation,
      performanceAssessment,
      businessImpactAssessment,
      retentionNotes,
    } = req.body;

    const rec = retentionRecommendation as RetentionRecommendation;
    if (!rec || !VALID_RETENTION.includes(rec)) {
      res.status(400).json({ success: false, message: 'Retention recommendation is required' });
      return;
    }

    const pmData = {
      retentionRecommendation: rec,
      performanceAssessment: performanceAssessment ? String(performanceAssessment) : null,
      businessImpactAssessment: businessImpactAssessment ? String(businessImpactAssessment) : null,
      retentionNotes: retentionNotes ? String(retentionNotes) : null,
      pmActionById: userId,
      pmActionAt: new Date(),
      pmComments: comment,
    };

    if (retentionRequiresGm(rec)) {
      await transitionResignationStage({
        resignationId: id,
        actorId: userId,
        action: 'PM_APPROVED_RETENTION',
        newStage: 'PENDING_GM_RETENTION_REVIEW',
        comment,
        data: pmData,
      });
      await notifyResignationWorkflow({
        resignationId: id,
        event: 'pm_approved_gm',
        employeeUserId: row.userId,
        projectManagerId: userId,
      });
    } else {
      await transitionResignationStage({
        resignationId: id,
        actorId: userId,
        action: 'PM_APPROVED',
        newStage: 'PENDING_HR_REVIEW',
        comment,
        data: pmData,
      });
      await notifyResignationWorkflow({
        resignationId: id,
        event: 'pm_approved_hr',
        employeeUserId: row.userId,
        projectManagerId: userId,
      });
    }

    const updated = await loadResignation(id);
    res.json({ success: true, message: 'Project manager approval recorded', data: updated });
  } catch (e) {
    console.error('pmApprove:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** POST /api/resignations/:id/pm/reject */
export const pmReject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const comment = requireComment(req.body);
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    if (!comment) {
      res.status(400).json({ success: false, message: 'Rejection reason is mandatory' });
      return;
    }

    const row = await prisma.resignationRequest.findUnique({ where: { id } });
    if (!row) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    if (!(await canActAsProjectManager(row.userId, userId, row.assignedProjectManagerId))) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    await transitionResignationStage({
      resignationId: id,
      actorId: userId,
      action: 'PM_REJECTED',
      newStage: 'REJECTED_BY_PROJECT_MANAGER',
      newStatus: 'REJECTED',
      comment,
      data: { pmActionById: userId, pmActionAt: new Date(), pmComments: comment },
    });

    await notifyResignationWorkflow({
      resignationId: id,
      event: 'pm_rejected',
      employeeUserId: row.userId,
      projectManagerId: userId,
    });

    const updated = await loadResignation(id);
    res.json({ success: true, message: 'Resignation rejected', data: updated });
  } catch (e) {
    console.error('pmReject:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** POST /api/resignations/:id/pm/discussion */
export const pmRequestDiscussion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const comment = requireComment(req.body);
    if (!userId || !comment) {
      res.status(400).json({ success: false, message: 'Comments are mandatory' });
      return;
    }

    const row = await prisma.resignationRequest.findUnique({ where: { id } });
    if (!row) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    if (!(await canActAsProjectManager(row.userId, userId, row.assignedProjectManagerId))) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    await transitionResignationStage({
      resignationId: id,
      actorId: userId,
      action: 'PM_REQUEST_DISCUSSION',
      newStage: 'DISCUSSION_REQUESTED',
      comment,
      data: { pmComments: comment, pmActionById: userId, pmActionAt: new Date() },
    });

    await notifyResignationWorkflow({
      resignationId: id,
      event: 'pm_discussion',
      employeeUserId: row.userId,
      projectManagerId: userId,
    });

    const updated = await loadResignation(id);
    res.json({ success: true, message: 'Discussion requested', data: updated });
  } catch (e) {
    console.error('pmRequestDiscussion:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** POST /api/resignations/:id/gm/retention-approve */
export const gmApproveRetention = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const comment = requireComment(req.body);
    if (!userId || !(await isGeneralManagerUser(userId))) {
      res.status(403).json({ success: false, message: 'GM/Director access required' });
      return;
    }
    if (!comment) {
      res.status(400).json({ success: false, message: 'Comments are mandatory' });
      return;
    }

    const row = await prisma.resignationRequest.findUnique({ where: { id } });
    if (!row || row.workflowStage !== 'PENDING_GM_RETENTION_REVIEW') {
      res.status(400).json({ success: false, message: 'Not at GM retention review stage' });
      return;
    }

    const offer = {
      recommendation: row.retentionRecommendation,
      performanceAssessment: row.performanceAssessment,
      businessImpactAssessment: row.businessImpactAssessment,
      retentionNotes: row.retentionNotes,
      gmComments: comment,
      offeredAt: new Date().toISOString(),
      ...(req.body.offerDetails || {}),
    };

    await transitionResignationStage({
      resignationId: id,
      actorId: userId,
      action: 'GM_RETENTION_APPROVED',
      newStage: 'PENDING_EMPLOYEE_RETENTION_RESPONSE',
      comment,
      data: {
        gmActionById: userId,
        gmActionAt: new Date(),
        gmComments: comment,
        retentionOffer: offer,
      },
    });

    await notifyResignationWorkflow({
      resignationId: id,
      event: 'gm_retention_approved',
      employeeUserId: row.userId,
      projectManagerId: row.assignedProjectManagerId,
    });

    const updated = await loadResignation(id);
    res.json({ success: true, message: 'Retention offer sent to employee', data: updated });
  } catch (e) {
    console.error('gmApproveRetention:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** POST /api/resignations/:id/gm/retention-reject */
export const gmRejectRetention = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const comment = requireComment(req.body);
    if (!userId || !(await isGeneralManagerUser(userId))) {
      res.status(403).json({ success: false, message: 'GM/Director access required' });
      return;
    }
    if (!comment) {
      res.status(400).json({ success: false, message: 'Comments are mandatory' });
      return;
    }

    const row = await prisma.resignationRequest.findUnique({ where: { id } });
    if (!row || row.workflowStage !== 'PENDING_GM_RETENTION_REVIEW') {
      res.status(400).json({ success: false, message: 'Invalid stage' });
      return;
    }

    await transitionResignationStage({
      resignationId: id,
      actorId: userId,
      action: 'GM_RETENTION_REJECTED',
      newStage: 'PENDING_HR_REVIEW',
      comment,
      data: { gmActionById: userId, gmActionAt: new Date(), gmComments: comment },
    });

    await notifyResignationWorkflow({
      resignationId: id,
      event: 'gm_retention_rejected',
      employeeUserId: row.userId,
      projectManagerId: row.assignedProjectManagerId,
    });

    const updated = await loadResignation(id);
    res.json({ success: true, message: 'Retention rejected — forwarded to HR', data: updated });
  } catch (e) {
    console.error('gmRejectRetention:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** POST /api/resignations/:id/retention-response — employee accept/reject offer */
export const employeeRetentionResponse = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { accept } = req.body;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const row = await prisma.resignationRequest.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    if (row.workflowStage !== 'PENDING_EMPLOYEE_RETENTION_RESPONSE') {
      res.status(400).json({ success: false, message: 'No retention offer pending' });
      return;
    }

    const accepted = accept === true || accept === 'true';

    if (accepted) {
      await transitionResignationStage({
        resignationId: id,
        actorId: userId,
        action: 'EMPLOYEE_ACCEPTED_RETENTION',
        newStage: 'WITHDRAWN',
        newStatus: 'WITHDRAWN',
        comment: req.body.comments || 'Employee accepted retention offer',
        data: {
          retentionOfferAccepted: true,
          retentionResponseAt: new Date(),
        },
      });
      await notifyResignationWorkflow({
        resignationId: id,
        event: 'employee_retention_accepted',
        employeeUserId: userId,
        projectManagerId: row.assignedProjectManagerId,
      });
    } else {
      await transitionResignationStage({
        resignationId: id,
        actorId: userId,
        action: 'EMPLOYEE_REJECTED_RETENTION',
        newStage: 'PENDING_HR_REVIEW',
        comment: req.body.comments || 'Employee declined retention offer',
        data: {
          retentionOfferAccepted: false,
          retentionResponseAt: new Date(),
        },
      });
      await notifyResignationWorkflow({
        resignationId: id,
        event: 'employee_retention_rejected',
        employeeUserId: userId,
        projectManagerId: row.assignedProjectManagerId,
      });
    }

    const updated = await loadResignation(id);
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('employeeRetentionResponse:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** POST /api/resignations/:id/hr/review-approve */
export const hrReviewApprove = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    const comment = requireComment(req.body);
    if (!userId || !isHrRole(role)) {
      res.status(403).json({ success: false, message: 'HR access required' });
      return;
    }
    if (!comment) {
      res.status(400).json({ success: false, message: 'HR comments are mandatory' });
      return;
    }

    const row = await prisma.resignationRequest.findUnique({ where: { id } });
    if (!row || row.workflowStage !== 'PENDING_HR_REVIEW') {
      res.status(400).json({ success: false, message: 'Not at HR review stage' });
      return;
    }

    await transitionResignationStage({
      resignationId: id,
      actorId: userId,
      action: 'HR_REVIEW_APPROVED',
      newStage: 'PENDING_FINANCE_CLEARANCE',
      comment,
      data: {
        hrReviewById: userId,
        hrReviewAt: new Date(),
        hrReviewComments: comment,
        financeChecklist: defaultFinanceChecklist(),
      },
    });

    await notifyResignationWorkflow({
      resignationId: id,
      event: 'hr_approved_finance',
      employeeUserId: row.userId,
      projectManagerId: row.assignedProjectManagerId,
    });

    const updated = await loadResignation(id);
    res.json({ success: true, message: 'HR approved — forwarded to finance', data: updated });
  } catch (e) {
    console.error('hrReviewApprove:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** POST /api/resignations/:id/hr/review-reject */
export const hrReviewReject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    const comment = requireComment(req.body);
    if (!userId || !isHrRole(role) || !comment) {
      res.status(400).json({ success: false, message: 'HR comments are mandatory' });
      return;
    }

    const row = await prisma.resignationRequest.findUnique({ where: { id } });
    if (!row || row.workflowStage !== 'PENDING_HR_REVIEW') {
      res.status(400).json({ success: false, message: 'Invalid stage' });
      return;
    }

    await transitionResignationStage({
      resignationId: id,
      actorId: userId,
      action: 'HR_REVIEW_REJECTED',
      newStage: 'REJECTED_BY_HR',
      newStatus: 'REJECTED',
      comment,
      data: { hrReviewById: userId, hrReviewAt: new Date(), hrReviewComments: comment },
    });

    await notifyResignationWorkflow({
      resignationId: id,
      event: 'hr_rejected',
      employeeUserId: row.userId,
      projectManagerId: row.assignedProjectManagerId,
    });

    const updated = await loadResignation(id);
    res.json({ success: true, message: 'Rejected by HR', data: updated });
  } catch (e) {
    console.error('hrReviewReject:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** POST /api/resignations/:id/finance/clearance */
export const financeClearance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { action, financeChecklist } = req.body;
    const comment = requireComment(req.body);
    if (!userId || !(await isFinanceUser(userId))) {
      res.status(403).json({ success: false, message: 'Finance access required' });
      return;
    }
    if (!comment) {
      res.status(400).json({ success: false, message: 'Finance comments are mandatory' });
      return;
    }

    const row = await prisma.resignationRequest.findUnique({ where: { id } });
    if (!row || !['PENDING_FINANCE_CLEARANCE', 'FINANCE_CLEARANCE_ON_HOLD'].includes(row.workflowStage)) {
      res.status(400).json({ success: false, message: 'Not awaiting finance clearance' });
      return;
    }

    const act = String(action || '').toLowerCase();
    let newStage: 'PENDING_HR_FINAL_CLEARANCE' | 'FINANCE_CLEARANCE_REJECTED' | 'FINANCE_CLEARANCE_ON_HOLD';
    let logAction: string;
    let event: string;

    if (act === 'approve') {
      newStage = 'PENDING_HR_FINAL_CLEARANCE';
      logAction = 'FINANCE_APPROVED';
      event = 'finance_approved';
    } else if (act === 'reject') {
      newStage = 'FINANCE_CLEARANCE_REJECTED';
      logAction = 'FINANCE_REJECTED';
      event = 'finance_rejected';
    } else if (act === 'hold') {
      newStage = 'FINANCE_CLEARANCE_ON_HOLD';
      logAction = 'FINANCE_ON_HOLD';
      event = 'finance_hold';
    } else {
      res.status(400).json({ success: false, message: 'action must be approve, reject, or hold' });
      return;
    }

    await transitionResignationStage({
      resignationId: id,
      actorId: userId,
      action: logAction,
      newStage,
      newStatus: act === 'reject' ? 'ON_HOLD' : 'PENDING',
      comment,
      data: {
        financeClearanceStatus: act.toUpperCase(),
        financeRemarks: comment,
        financeActionById: userId,
        financeActionAt: new Date(),
        financeChecklist: financeChecklist || defaultFinanceChecklist(),
        ...(newStage === 'PENDING_HR_FINAL_CLEARANCE'
          ? { assetChecklist: defaultAssetChecklist(), exitChecklist: defaultExitChecklist() }
          : {}),
      },
    });

    await notifyResignationWorkflow({
      resignationId: id,
      event,
      employeeUserId: row.userId,
      projectManagerId: row.assignedProjectManagerId,
    });

    const updated = await loadResignation(id);
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('financeClearance:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** POST /api/resignations/:id/hr/final */
export const hrFinalClearance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    const { action, assetChecklist, exitChecklist, generateExperienceCertificate } = req.body;
    const comment = requireComment(req.body);
    if (!userId || !isHrRole(role)) {
      res.status(403).json({ success: false, message: 'HR access required' });
      return;
    }
    if (!comment) {
      res.status(400).json({ success: false, message: 'Comments are mandatory' });
      return;
    }

    const row = await prisma.resignationRequest.findUnique({ where: { id } });
    if (!row || !['PENDING_HR_FINAL_CLEARANCE', 'HR_FINAL_ON_HOLD'].includes(row.workflowStage)) {
      res.status(400).json({ success: false, message: 'Not at HR final clearance stage' });
      return;
    }

    const act = String(action || 'approve').toLowerCase();

    if (act === 'approve') {
      const assetCount = await countAssignedAssets(row.userId);
      const { buildEmployeeClearanceChecklist } = await import('../services/eam/assetRequest.service');
      await buildEmployeeClearanceChecklist(row.userId, id);
      if (assetCount > 0) {
        res.status(409).json({
          success: false,
          code: 'ASSETS_IN_CUSTODY',
          message:
            'Employee still has company assets under custody. Return all assets before final clearance.',
          assetCount,
        });
        return;
      }
      await finalizeResignation(id, userId, comment);

      let relievingLetterPath: string | undefined;
      let experienceCertificatePath: string | undefined;
      try {
        const docs = await generateResignationDocuments(id, {
          includeExperienceCertificate: generateExperienceCertificate !== false,
        });
        relievingLetterPath = docs.relievingLetterPath;
        experienceCertificatePath = docs.experienceCertificatePath;
      } catch (pdfErr) {
        console.error('resignation PDF generation failed:', pdfErr);
      }

      await prisma.resignationRequest.update({
        where: { id },
        data: {
          assetChecklist: assetChecklist || defaultAssetChecklist(),
          exitChecklist: exitChecklist || defaultExitChecklist(),
          ...(relievingLetterPath ? { relievingLetterPath } : {}),
          ...(experienceCertificatePath ? { experienceCertificatePath } : {}),
        },
      });
      await notifyResignationWorkflow({
        resignationId: id,
        event: 'hr_final_completed',
        employeeUserId: row.userId,
        projectManagerId: row.assignedProjectManagerId,
      });
    } else if (act === 'reject') {
      await transitionResignationStage({
        resignationId: id,
        actorId: userId,
        action: 'HR_FINAL_REJECTED',
        newStage: 'REJECTED_HR_FINAL',
        newStatus: 'REJECTED',
        comment,
        data: {
          hrFinalById: userId,
          hrFinalAt: new Date(),
          hrFinalComments: comment,
          assetChecklist: assetChecklist || row.assetChecklist,
          exitChecklist: exitChecklist || row.exitChecklist,
        },
      });
      await notifyResignationWorkflow({
        resignationId: id,
        event: 'hr_final_rejected',
        employeeUserId: row.userId,
        projectManagerId: row.assignedProjectManagerId,
      });
    } else if (act === 'hold') {
      await transitionResignationStage({
        resignationId: id,
        actorId: userId,
        action: 'HR_FINAL_ON_HOLD',
        newStage: 'HR_FINAL_ON_HOLD',
        newStatus: 'ON_HOLD',
        comment,
        data: {
          hrFinalComments: comment,
          assetChecklist: assetChecklist || row.assetChecklist || defaultAssetChecklist(),
          exitChecklist: exitChecklist || row.exitChecklist || defaultExitChecklist(),
        },
      });
    } else {
      res.status(400).json({ success: false, message: 'Invalid action' });
      return;
    }

    const updated = await loadResignation(id);
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('hrFinalClearance:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** GET /api/resignations/:id/workflow-log */
export const getWorkflowLog = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const logs = await prisma.resignationWorkflowLog.findMany({
      where: { resignationId: id },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { id: true, firstName: true, lastName: true, role: true } } },
    });
    res.json({ success: true, data: logs });
  } catch (e) {
    console.error('getWorkflowLog:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

async function assertResignationDocumentAccess(
  req: AuthRequest,
  resignationId: string,
): Promise<
  | { ok: true; row: { userId: string; relievingLetterPath: string | null; experienceCertificatePath: string | null } }
  | { ok: false; status: number; message: string }
> {
  const userId = req.user?.id;
  const role = req.user?.role;
  if (!userId) return { ok: false, status: 401, message: 'Unauthorized' };

  const row = await prisma.resignationRequest.findUnique({
    where: { id: resignationId },
    select: {
      userId: true,
      workflowStage: true,
      relievingLetterPath: true,
      experienceCertificatePath: true,
    },
  });
  if (!row) return { ok: false, status: 404, message: 'Resignation not found' };
  if (row.workflowStage !== 'RESIGNATION_COMPLETED') {
    return { ok: false, status: 400, message: 'Documents available only after HR final approval' };
  }
  if (row.userId !== userId && !isHrRole(role)) {
    return { ok: false, status: 403, message: 'Forbidden' };
  }
  return { ok: true, row };
}

function sendResignationDocument(
  res: Response,
  relativePath: string | null | undefined,
  downloadName: string,
): void {
  if (!resignationDocumentExists(relativePath)) {
    res.status(404).json({ success: false, message: 'Document file not found' });
    return;
  }
  const filePath = getResignationDocumentPath(relativePath!);
  res.download(filePath, downloadName);
}

/** GET /api/resignations/:id/documents/relieving-letter */
export const downloadRelievingLetter = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const access = await assertResignationDocumentAccess(req, req.params.id);
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message });
      return;
    }
    sendResignationDocument(res, access.row.relievingLetterPath, `relieving-letter-${req.params.id}.pdf`);
  } catch (e) {
    console.error('downloadRelievingLetter:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** GET /api/resignations/:id/documents/experience-certificate */
export const downloadExperienceCertificate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const access = await assertResignationDocumentAccess(req, req.params.id);
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message });
      return;
    }
    sendResignationDocument(
      res,
      access.row.experienceCertificatePath,
      `experience-certificate-${req.params.id}.pdf`,
    );
  } catch (e) {
    console.error('downloadExperienceCertificate:', e);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** POST /api/resignations/:id/documents/regenerate — HR only */
export const regenerateResignationDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { id } = req.params;
    if (!userId || !isHrRole(role)) {
      res.status(403).json({ success: false, message: 'HR access required' });
      return;
    }

    const row = await prisma.resignationRequest.findUnique({ where: { id } });
    if (!row || row.workflowStage !== 'RESIGNATION_COMPLETED') {
      res.status(400).json({ success: false, message: 'Resignation must be completed' });
      return;
    }

    const includeExperience = req.body?.generateExperienceCertificate !== false;
    const docs = await generateResignationDocuments(id, { includeExperienceCertificate: includeExperience });
    const updated = await prisma.resignationRequest.update({
      where: { id },
      data: {
        relievingLetterPath: docs.relievingLetterPath,
        ...(docs.experienceCertificatePath ? { experienceCertificatePath: docs.experienceCertificatePath } : {}),
      },
      include: resignationInclude,
    });

    res.json({ success: true, message: 'Documents regenerated', data: updated });
  } catch (e) {
    console.error('regenerateResignationDocuments:', e);
    res.status(500).json({ success: false, message: 'Failed to regenerate documents' });
  }
};
