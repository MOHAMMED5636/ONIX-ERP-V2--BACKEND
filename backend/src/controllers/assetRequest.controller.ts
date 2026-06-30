import { Response } from 'express';
import fs from 'fs';
import { AssetRequestApprovalStep } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  assignAssetToRequest,
  buildEmployeeClearanceChecklist,
  createAssetRequestDraft,
  getAssetRequestById,
  isAssetRequestFinanceApprover,
  listAvailableAssetsForRequest,
  listAssetRequests,
  listEmployeeClearance,
  processApproval,
  recordAssetReturn,
  registerStockForRequest,
  submitAssetRequest,
  updateAssetRequestDraft,
  userCanApproveAssetRequestStep,
  userCanViewAssetRequest,
} from '../services/eam/assetRequest.service';
import { isFinanceClearanceUser } from '../services/leaveAnnualWorkflow.service';
import { getCustodyDocumentPath, regenerateCustodyPdfForRequest } from '../services/eam/assetRequestPdf.service';

const HR_ROLES = new Set(['HR', 'ADMIN', 'SUPER_ADMIN']);
const ASSET_TEAM_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'HR']);

export const listRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const scope = String(req.query.scope || 'mine');
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 25;

    let data;
    if (scope === 'pending') {
      const isFinance = await isFinanceClearanceUser(user.id);
      data = await listAssetRequests({
        pendingForUserId: user.id,
        pendingRole: user.role || '',
        isFinanceApprover: isFinance,
        page,
        limit,
      });
    } else if (
      scope === 'all' &&
      (ASSET_TEAM_ROLES.has(user.role || '') || (await isFinanceClearanceUser(user.id)))
    ) {
      data = await listAssetRequests({ page, limit });
    } else {
      data = await listAssetRequests({ employeeId: user.id, page, limit });
    }

    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Failed to list requests' });
  }
};

export const getApproverContext = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const isFinance = await isAssetRequestFinanceApprover(user.id);
    res.json({
      success: true,
      data: {
        isFinanceApprover: isFinance,
        canViewPendingQueue:
          isFinance ||
          ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'PROJECT_MANAGER'].includes(user.role || ''),
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Failed to load approver context' });
  }
};

export const getRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const row = await getAssetRequestById(req.params.id);
    if (!row) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    const user = req.user!;
    const canView = await userCanViewAssetRequest(user.id, user.role || '', row);
    if (!canView) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }
    res.json({ success: true, data: row });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Failed to load request' });
  }
};

export const createRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const body = req.body || {};
    const data = await createAssetRequestDraft({
      employeeId: user.id,
      categoryId: String(body.categoryId || ''),
      businessJustification: String(body.businessJustification || ''),
      quantity: body.quantity != null ? Number(body.quantity) : 1,
      assetType: body.assetType,
      assetDescription: body.assetDescription,
      brandPreference: body.brandPreference,
      modelPreference: body.modelPreference,
      urgency: body.urgency,
      requiredByDate: body.requiredByDate,
      expectedUsageDuration: body.expectedUsageDuration,
      additionalNotes: body.additionalNotes,
      projectId: body.projectId,
      department: body.department,
      subDepartment: body.subDepartment,
      designation: body.designation,
      attachmentPath: body.attachmentPath,
    });
    res.status(201).json({ success: true, data });
  } catch (e: any) {
    const code = e.message === 'EMPLOYEE_NOT_FOUND' ? 404 : 400;
    const messages: Record<string, string> = {
      CATEGORY_REQUIRED: 'Please select an asset category.',
      INVALID_CATEGORY: 'Selected category is invalid.',
      ASSET_DESCRIPTION_REQUIRED: 'Asset description is required.',
      OTHER_ASSET_TYPE_REQUIRED: 'Please specify the asset type when selecting Other.',
      BUSINESS_JUSTIFICATION_REQUIRED: 'Business justification is required.',
    };
    res.status(code).json({
      success: false,
      message: messages[e.message] || e.message || 'Failed to create request',
    });
  }
};

export const updateRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await updateAssetRequestDraft(req.params.id, req.user!.id, req.body || {});
    res.json({ success: true, data });
  } catch (e: any) {
    const status = e.message === 'NOT_FOUND' ? 404 : e.message === 'NOT_EDITABLE' ? 409 : 400;
    res.status(status).json({ success: false, message: e.message });
  }
};

export const submitRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await submitAssetRequest(req.params.id, req.user!.id);
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const approveRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const body = req.body || {};
    const step = String(body.step || '') as AssetRequestApprovalStep;
    const decision = String(body.decision || 'APPROVED') as any;

    const canApprove = await userCanApproveAssetRequestStep(user.id, user.role || '', step);
    if (!canApprove) {
      res.status(403).json({ success: false, message: 'Not authorized for this approval step' });
      return;
    }

    const data = await processApproval({
      requestId: req.params.id,
      approverId: user.id,
      approverRole: user.role || '',
      step,
      decision,
      comments: body.comments,
      approvalNotes: body.approvalNotes,
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const listRequestAvailableAssets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!ASSET_TEAM_ROLES.has(req.user?.role || '')) {
      res.status(403).json({ success: false, message: 'Asset team only' });
      return;
    }
    const data = await listAvailableAssetsForRequest(req.params.id);
    res.json({ success: true, data });
  } catch (e: any) {
    const status = e.message === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ success: false, message: e.message || 'Failed to load assets' });
  }
};

export const registerRequestStock = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!ASSET_TEAM_ROLES.has(req.user?.role || '')) {
      res.status(403).json({ success: false, message: 'Asset team only' });
      return;
    }
    const body = req.body || {};
    const data = await registerStockForRequest({
      requestId: req.params.id,
      performedById: req.user!.id,
      serialNumber: body.serialNumber,
      purchaseCost: body.purchaseCost != null ? Number(body.purchaseCost) : undefined,
    });
    res.status(201).json({ success: true, data });
  } catch (e: any) {
    const status = e.message === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ success: false, message: e.message || 'Failed to register asset' });
  }
};

export const assignRequestAsset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!ASSET_TEAM_ROLES.has(req.user?.role || '')) {
      res.status(403).json({ success: false, message: 'Asset team only' });
      return;
    }
    const body = req.body || {};
    if (body.registerStockOnly) {
      const asset = await registerStockForRequest({
        requestId: req.params.id,
        performedById: req.user!.id,
        serialNumber: body.serialNumber,
        purchaseCost: body.purchaseCost != null ? Number(body.purchaseCost) : undefined,
      });
      res.status(201).json({ success: true, data: asset });
      return;
    }
    const data = await assignAssetToRequest({
      requestId: req.params.id,
      assetId: body.assetId ? String(body.assetId) : undefined,
      registerStock: Boolean(body.registerStock),
      serialNumber: body.serialNumber,
      purchaseCost: body.purchaseCost != null ? Number(body.purchaseCost) : undefined,
      performedById: req.user!.id,
      conditionNotes: body.conditionNotes,
      warrantyInfo: body.warrantyInfo,
      locationType: body.locationType,
      locationId: body.locationId,
    });
    res.json({ success: true, data });
  } catch (e: any) {
    const messages: Record<string, string> = {
      NOT_FOUND: 'Request not found',
      INVALID_STATUS: 'This request is not ready for asset assignment',
      ASSET_ID_REQUIRED: 'Select an asset or use register stock',
      ASSET_NOT_FOUND: 'Selected asset was not found',
      ASSET_NOT_AVAILABLE: 'Selected asset is no longer available',
    };
    res.status(400).json({
      success: false,
      message: messages[e.message] || e.message || 'Failed to assign asset',
    });
  }
};

export const returnAsset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!ASSET_TEAM_ROLES.has(req.user?.role || '')) {
      res.status(403).json({ success: false, message: 'Asset team only' });
      return;
    }
    const body = req.body || {};
    const data = await recordAssetReturn({
      assetId: String(body.assetId || ''),
      custodianId: String(body.custodianId || ''),
      processedById: req.user!.id,
      outcome: body.outcome,
      conditionNotes: body.conditionNotes,
      accessoriesReturned: body.accessoriesReturned,
      damageDetails: body.damageDetails,
      missingComponents: body.missingComponents,
      remarks: body.remarks,
      requestId: body.requestId,
    });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const getClearance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.params.userId;
    const user = req.user!;
    if (userId !== user.id && !HR_ROLES.has(user.role || '')) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }
    const resignationId = req.query.resignationId ? String(req.query.resignationId) : undefined;
    if (resignationId) {
      await buildEmployeeClearanceChecklist(userId, resignationId);
    }
    const records = await listEmployeeClearance(userId);
    res.json({ success: true, data: records });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const downloadCustodyPdf = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let row = await getAssetRequestById(req.params.id);
    if (!row) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    const user = req.user!;
    const canView = await userCanViewAssetRequest(user.id, user.role || '', row);
    if (!canView) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    if (row.status === 'ASSET_ISSUED' && row.assignments?.length) {
      try {
        const refreshedPath = await regenerateCustodyPdfForRequest(req.params.id);
        row = { ...row, custodyDocumentPath: refreshedPath };
      } catch {
        /* fall back to existing file */
      }
    }

    if (!row.custodyDocumentPath) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    const full = getCustodyDocumentPath(row.custodyDocumentPath);
    if (!fs.existsSync(full)) {
      res.status(404).json({ success: false, message: 'Document file missing on server' });
      return;
    }
    res.download(full);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};
