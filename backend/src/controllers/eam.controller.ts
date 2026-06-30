import { Response } from 'express';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  listAssets,
  getAssetById,
  getAssetByQrToken,
  assignAsset,
  transferAsset,
  returnAssetToStock,
  sendAssetToRepair,
  scrapAsset,
  updateAssetSerial,
  markQrPrinted,
  listQrPendingAssets,
  getFinanceDashboard,
  registerManualAssets,
} from '../services/eam/asset.service';
import { listAssetLogs } from '../services/eam/assetAudit.service';
import { countAssignedAssets, listCustodyAssets } from '../services/eam/custody.service';
import {
  createMaintenanceTicket,
  assignTechnician,
  startRepair,
  completeRepair,
  closeTicket,
  listMaintenanceTickets,
} from '../services/eam/maintenance.service';
import {
  listCategories,
  upsertCategory,
  createPurchaseOrder,
  approvePurchaseOrder,
  confirmGoodsReceipt,
  listPurchaseOrders,
  listRequisitions,
} from '../services/eam/procurement.service';
import { resolveQrScanAccess } from '../services/eam/qr.service';

function err(res: Response, status: number, message: string, code?: string) {
  res.status(status).json({ success: false, message, code });
}

function scanBaseUrl(): string {
  const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `${frontend.replace(/\/$/, '')}/scan`;
}

// ----- Categories -----
export const getCategories = async (_req: AuthRequest, res: Response) => {
  try {
    const data = await listCategories();
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 500, e.message || 'Failed to load categories');
  }
};

export const saveCategory = async (req: AuthRequest, res: Response) => {
  try {
    const data = await upsertCategory({ ...req.body, id: req.params.id || req.body.id });
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 500, e.message || 'Failed to save category');
  }
};

// ----- Assets -----
export const getAssets = async (req: AuthRequest, res: Response) => {
  try {
    const data = await listAssets({
      status: req.query.status as string,
      categoryId: req.query.categoryId as string,
      assignedToId: req.query.assignedToId as string,
      locationType: req.query.locationType as string,
      qrPending: req.query.qrPending === 'true',
      search: req.query.search as string,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
    });
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 500, e.message || 'Failed to load assets');
  }
};

export const getMyAssets = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) return err(res, 401, 'Unauthorized');
    const data = await listCustodyAssets(req.user.id);
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 500, e.message || 'Failed to load assets');
  }
};

export const registerAssetHandler = async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const categoryId = String(body.categoryId || '').trim();
    if (!categoryId) return err(res, 400, 'Category is required');

    const assets = await registerManualAssets({
      categoryId,
      performedById: req.user!.id,
      quantity: body.quantity != null ? Number(body.quantity) : 1,
      serialNumber: body.serialNumber,
      purchaseCost: body.purchaseCost != null ? Number(body.purchaseCost) : undefined,
      purchaseDate: body.purchaseDate || null,
      notes: body.notes,
      assigneeId: body.assigneeId || null,
    });

    res.status(201).json({
      success: true,
      data: { assets, count: assets.length },
      message: `${assets.length} asset(s) added to the register`,
    });
  } catch (e: any) {
    const messages: Record<string, string> = {
      INVALID_CATEGORY: 'Selected category is invalid',
      SERIAL_ALREADY_EXISTS: 'Serial number is already in use',
    };
    err(res, 400, messages[e.message] || e.message || 'Failed to register asset');
  }
};

export const getAsset = async (req: AuthRequest, res: Response) => {
  try {
    const data = await getAssetById(req.params.id);
    if (!data) return err(res, 404, 'Asset not found');
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 500, e.message || 'Failed to load asset');
  }
};

export const getAssetLogsHandler = async (req: AuthRequest, res: Response) => {
  try {
    const data = await listAssetLogs(req.params.id);
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 500, e.message || 'Failed to load logs');
  }
};

export const assignAssetHandler = async (req: AuthRequest, res: Response) => {
  try {
    const data = await assignAsset({
      assetId: req.params.id,
      assigneeId: req.body.assigneeId,
      performedById: req.user!.id,
      locationType: req.body.locationType,
      locationId: req.body.locationId,
      notes: req.body.notes,
    });
    res.json({ success: true, data });
  } catch (e: any) {
    const code = e.message;
    err(res, code === 'ASSET_NOT_AVAILABLE' ? 409 : 400, e.message);
  }
};

export const transferAssetHandler = async (req: AuthRequest, res: Response) => {
  try {
    const data = await transferAsset({
      assetId: req.params.id,
      newAssigneeId: req.body.newAssigneeId,
      performedById: req.user!.id,
      locationType: req.body.locationType,
      locationId: req.body.locationId,
      notes: req.body.notes,
    });
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 400, e.message);
  }
};

export const returnToStockHandler = async (req: AuthRequest, res: Response) => {
  try {
    const data = await returnAssetToStock({
      assetId: req.params.id,
      performedById: req.user!.id,
      notes: req.body.notes,
    });
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 400, e.message);
  }
};

export const sendToRepairHandler = async (req: AuthRequest, res: Response) => {
  try {
    const data = await sendAssetToRepair({
      assetId: req.params.id,
      performedById: req.user!.id,
      notes: req.body.notes,
    });
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 400, e.message);
  }
};

export const scrapAssetHandler = async (req: AuthRequest, res: Response) => {
  try {
    const data = await scrapAsset({
      assetId: req.params.id,
      performedById: req.user!.id,
      notes: req.body.notes,
    });
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 400, e.message);
  }
};

export const patchSerialHandler = async (req: AuthRequest, res: Response) => {
  try {
    const data = await updateAssetSerial(req.params.id, req.body.serialNumber, req.user?.id);
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 400, e.message || 'Failed to update serial');
  }
};

// ----- QR Scan -----
export const scanQrToken = async (req: AuthRequest, res: Response) => {
  try {
    const asset = await getAssetByQrToken(req.params.qrToken);
    if (!asset) return err(res, 404, 'Asset not found');
    const ctx = resolveQrScanAccess({ asset, user: req.user });
    res.json({ success: true, data: ctx });
  } catch (e: any) {
    err(res, 500, e.message);
  }
};

export const getQrPending = async (_req: AuthRequest, res: Response) => {
  try {
    const data = await listQrPendingAssets();
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 500, e.message);
  }
};

export const printQrLabelsPdf = async (req: AuthRequest, res: Response) => {
  try {
    const assetIds: string[] = Array.isArray(req.body.assetIds) ? req.body.assetIds : [];
    const rows = assetIds.length
      ? (await Promise.all(assetIds.map((id) => getAssetById(id)))).filter(Boolean)
      : await listQrPendingAssets();

    if (!rows.length) return err(res, 400, 'No assets to print');

    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));

    const base = scanBaseUrl();
    let col = 0;
    let y = 36;
    const labelW = 160;
    const labelH = 200;

    for (const asset of rows as any[]) {
      const url = `${base}/${asset.qrToken}`;
      const png = await QRCode.toBuffer(url, { width: 140, margin: 1 });
      const x = 36 + col * (labelW + 12);
      doc.image(png, x, y, { width: 120, height: 120 });
      doc.fontSize(9).text(asset.assetTag, x, y + 125, { width: labelW });
      doc.fontSize(7).text(asset.assetName || '', x, y + 140, { width: labelW });
      doc.fontSize(6).text(asset.serialNumber || 'Serial pending', x, y + 155, { width: labelW });

      col += 1;
      if (col >= 3) {
        col = 0;
        y += labelH;
        if (y > 700) {
          doc.addPage();
          y = 36;
        }
      }
    }

    doc.end();
    await new Promise<void>((resolve) => doc.on('end', resolve));
    const ids = (rows as any[]).map((a) => a.id);
    await markQrPrinted(ids);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="asset-qr-labels.pdf"');
    res.send(Buffer.concat(chunks));
  } catch (e: any) {
    err(res, 500, e.message || 'PDF generation failed');
  }
};

// ----- Maintenance -----
export const createTicket = async (req: AuthRequest, res: Response) => {
  try {
    const data = await createMaintenanceTicket({
      assetId: req.body.assetId,
      reporterId: req.user!.id,
      issueType: req.body.issueType,
      priority: req.body.priority,
      notes: req.body.notes,
    });
    res.status(201).json({ success: true, data });
  } catch (e: any) {
    err(res, 400, e.message);
  }
};

export const listTickets = async (req: AuthRequest, res: Response) => {
  try {
    const data = await listMaintenanceTickets({
      status: req.query.status as string,
      technicianId: req.query.technicianId as string,
      reporterId: req.query.reporterId as string,
      assetId: req.query.assetId as string,
    });
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 500, e.message);
  }
};

export const assignTechHandler = async (req: AuthRequest, res: Response) => {
  try {
    const data = await assignTechnician(req.params.id, req.body.technicianId);
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 400, e.message);
  }
};

export const startRepairHandler = async (req: AuthRequest, res: Response) => {
  try {
    const data = await startRepair(req.params.id, req.user!.id);
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 400, e.message);
  }
};

export const completeRepairHandler = async (req: AuthRequest, res: Response) => {
  try {
    const data = await completeRepair({
      ticketId: req.params.id,
      technicianId: req.user!.id,
      destination: req.body.destination,
      repairCost: req.body.repairCost,
      resolution: req.body.resolution,
    });
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 400, e.message);
  }
};

export const closeTicketHandler = async (req: AuthRequest, res: Response) => {
  try {
    const data = await closeTicket(req.params.id);
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 400, e.message);
  }
};

// ----- Procurement -----
export const getPurchaseOrders = async (_req: AuthRequest, res: Response) => {
  try {
    const data = await listPurchaseOrders();
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 500, e.message);
  }
};

export const postPurchaseOrder = async (req: AuthRequest, res: Response) => {
  try {
    const data = await createPurchaseOrder({
      ...req.body,
      createdById: req.user!.id,
    });
    res.status(201).json({ success: true, data });
  } catch (e: any) {
    err(res, 400, e.message);
  }
};

export const approvePoHandler = async (req: AuthRequest, res: Response) => {
  try {
    const data = await approvePurchaseOrder(req.params.id);
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 400, e.message);
  }
};

export const confirmGrnHandler = async (req: AuthRequest, res: Response) => {
  try {
    const data = await confirmGoodsReceipt({
      purchaseOrderLineId: req.body.purchaseOrderLineId,
      quantityReceived: Number(req.body.quantityReceived),
      receivedById: req.user!.id,
      purchaseDate: req.body.purchaseDate ? new Date(req.body.purchaseDate) : undefined,
    });
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 400, e.message);
  }
};

export const getRequisitions = async (req: AuthRequest, res: Response) => {
  try {
    const data = await listRequisitions(req.query.status as string);
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 500, e.message);
  }
};

// ----- Reports / custody -----
export const getFinanceReport = async (_req: AuthRequest, res: Response) => {
  try {
    const data = await getFinanceDashboard();
    res.json({ success: true, data });
  } catch (e: any) {
    err(res, 500, e.message);
  }
};

export const getCustodyCount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.userId;
    const count = await countAssignedAssets(userId);
    const assets = await listCustodyAssets(userId);
    res.json({ success: true, data: { count, assets } });
  } catch (e: any) {
    err(res, 500, e.message);
  }
};
