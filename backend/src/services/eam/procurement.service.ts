import prisma from '../../config/database';
import { emitErpNotification } from '../erpNotification.service';
import { sendBrowserPushToUsers } from '../browserPush.service';
import { provisionAssetsFromGrn } from './asset.service';

async function nextPoNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.purchaseOrder.count({
    where: { createdAt: { gte: new Date(`${year}-01-01`) } },
  });
  return `PO-${year}/${String(count + 1).padStart(4, '0')}`;
}

async function nextGrnNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.goodsReceiptNote.count({
    where: { createdAt: { gte: new Date(`${year}-01-01`) } },
  });
  return `GRN-${year}/${String(count + 1).padStart(4, '0')}`;
}

async function notifyAssetManagers(title: string, message: string, url: string) {
  const managers = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['ADMIN', 'SUPER_ADMIN', 'HR'] } },
    select: { id: true },
  });
  const ids = managers.map((m) => m.id);
  const payload = {
    id: `eam-${Date.now()}`,
    type: 'eam_notification',
    title,
    message,
    createdAt: new Date().toISOString(),
  };
  for (const id of ids) emitErpNotification(id, payload);
  await sendBrowserPushToUsers(ids, { title, body: message, url, tag: 'eam' }).catch(() => {});
}

export async function listCategories() {
  return prisma.assetCategory.findMany({ orderBy: { name: 'asc' } });
}

export async function upsertCategory(input: {
  id?: string;
  name: string;
  minThreshold: number;
  depreciationLifespanYears: number;
  salvageValuePercentage: number;
}) {
  if (input.id) {
    return prisma.assetCategory.update({
      where: { id: input.id },
      data: {
        name: input.name.trim(),
        minThreshold: input.minThreshold,
        depreciationLifespanYears: input.depreciationLifespanYears,
        salvageValuePercentage: input.salvageValuePercentage,
      },
    });
  }
  return prisma.assetCategory.create({
    data: {
      name: input.name.trim(),
      minThreshold: input.minThreshold,
      depreciationLifespanYears: input.depreciationLifespanYears,
      salvageValuePercentage: input.salvageValuePercentage,
    },
  });
}

export async function createPurchaseOrder(input: {
  vendorName?: string;
  notes?: string;
  createdById: string;
  lines: Array<{ categoryId: string; description?: string; quantity: number; unitCost: number }>;
}) {
  const poNumber = await nextPoNumber();
  return prisma.purchaseOrder.create({
    data: {
      poNumber,
      status: 'DRAFT',
      vendorName: input.vendorName?.trim() || null,
      notes: input.notes?.trim() || null,
      createdById: input.createdById,
      lines: {
        create: input.lines.map((l) => ({
          categoryId: l.categoryId,
          description: l.description?.trim() || null,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
      },
    },
    include: { lines: { include: { category: true } } },
  });
}

export async function approvePurchaseOrder(poId: string) {
  return prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: 'APPROVED' },
    include: { lines: { include: { category: true } } },
  });
}

export async function confirmGoodsReceipt(input: {
  purchaseOrderLineId: string;
  quantityReceived: number;
  receivedById: string;
  purchaseDate?: Date;
}) {
  if (input.quantityReceived < 1) throw new Error('INVALID_QUANTITY');

  const line = await prisma.purchaseOrderLine.findUnique({
    where: { id: input.purchaseOrderLineId },
    include: { purchaseOrder: true, category: true },
  });
  if (!line) throw new Error('PO_LINE_NOT_FOUND');
  if (line.purchaseOrder.status !== 'APPROVED' && line.purchaseOrder.status !== 'PARTIALLY_RECEIVED') {
    throw new Error('PO_NOT_APPROVED');
  }
  const remaining = line.quantity - line.receivedQuantity;
  if (input.quantityReceived > remaining) throw new Error('QUANTITY_EXCEEDS_PO');

  const grnNumber = await nextGrnNumber();
  const purchaseDate = input.purchaseDate || new Date();

  const result = await prisma.$transaction(async (tx) => {
    const grn = await tx.goodsReceiptNote.create({
      data: {
        grnNumber,
        purchaseOrderLineId: line.id,
        quantityReceived: input.quantityReceived,
        receivedById: input.receivedById,
        status: 'PENDING_SERIALS',
      },
    });

    const newReceived = line.receivedQuantity + input.quantityReceived;
    const poStatus =
      newReceived >= line.quantity ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

    await tx.purchaseOrderLine.update({
      where: { id: line.id },
      data: { receivedQuantity: newReceived },
    });
    await tx.purchaseOrder.update({
      where: { id: line.purchaseOrderId },
      data: { status: poStatus },
    });

    return grn;
  });

  const assets = await provisionAssetsFromGrn({
    grnId: result.id,
    categoryId: line.categoryId,
    quantity: input.quantityReceived,
    unitCost: Number(line.unitCost),
    purchaseDate,
    performedById: input.receivedById,
  });

  await notifyAssetManagers(
    'New assets provisioned',
    `${assets.length} new ${line.category.name} asset(s) created from ${grnNumber}. Please enter serial numbers and print QR labels.`,
    '/eam/qr-labels',
  );

  return { grn: result, assetsCreated: assets.length, assets };
}

export async function listPurchaseOrders() {
  return prisma.purchaseOrder.findMany({
    include: { lines: { include: { category: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function createDraftRequisition(input: {
  categoryId: string;
  suggestedQuantity: number;
  reason: string;
  createdById?: string;
}) {
  return prisma.purchaseRequisition.create({
    data: {
      categoryId: input.categoryId,
      suggestedQuantity: input.suggestedQuantity,
      reason: input.reason,
      status: 'DRAFT',
      createdById: input.createdById || null,
    },
    include: { category: true },
  });
}

export async function listRequisitions(status?: string) {
  return prisma.purchaseRequisition.findMany({
    where: status ? { status: status as any } : undefined,
    include: { category: true, createdBy: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}
