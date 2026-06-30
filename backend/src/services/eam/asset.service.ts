import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { appendAssetLog } from './assetAudit.service';
import { computeStraightLineDepreciation } from './depreciation.util';

type Tx = Prisma.TransactionClient;

async function nextAssetTag(tx: Tx, year: number): Promise<string> {
  const row = await tx.assetTagSequence.upsert({
    where: { year },
    create: { year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  const num = String(row.lastNumber).padStart(5, '0');
  return `AST-${year}/${num}`;
}

const assetInclude = {
  category: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, employeeId: true } },
  grn: { select: { id: true, grnNumber: true } },
} as const;

export function shapeAsset(row: any, asOf = new Date()) {
  const dep = computeStraightLineDepreciation({
    purchaseCost: row.purchaseCost,
    purchaseDate: row.purchaseDate,
    lifespanYears: row.category?.depreciationLifespanYears ?? 3,
    salvagePercent: row.category?.salvageValuePercentage ?? 10,
    asOf,
  });
  return {
    ...row,
    assetName: row.category?.name || 'Asset',
    depreciation: dep,
  };
}

export async function listAssets(filters: {
  status?: string;
  categoryId?: string;
  assignedToId?: string;
  locationType?: string;
  qrPending?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(200, Math.max(1, filters.limit || 50));
  const where: Prisma.AssetWhereInput = { status: { not: 'DISPOSED' } };
  if (filters.status) where.status = filters.status as any;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.assignedToId) where.assignedToId = filters.assignedToId;
  if (filters.locationType) where.locationType = filters.locationType as any;
  if (filters.qrPending) where.isQrPrinted = false;
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { assetTag: { contains: q, mode: 'insensitive' } },
      { serialNumber: { contains: q, mode: 'insensitive' } },
      { assignedTo: { firstName: { contains: q, mode: 'insensitive' } } },
      { assignedTo: { lastName: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      include: assetInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.asset.count({ where }),
  ]);

  return {
    assets: rows.map((r) => shapeAsset(r)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

export async function getAssetById(id: string) {
  const row = await prisma.asset.findUnique({ where: { id }, include: assetInclude });
  return row ? shapeAsset(row) : null;
}

export async function getAssetByQrToken(qrToken: string) {
  const row = await prisma.asset.findUnique({ where: { qrToken }, include: assetInclude });
  return row ? shapeAsset(row) : null;
}

export async function provisionAssetsFromGrn(input: {
  grnId: string;
  categoryId: string;
  quantity: number;
  unitCost: number;
  purchaseDate: Date;
  performedById?: string;
}) {
  const year = new Date().getFullYear();
  const created = await prisma.$transaction(async (tx) => {
    const items = [];
    for (let i = 0; i < input.quantity; i += 1) {
      const assetTag = await nextAssetTag(tx, year);
      const asset = await tx.asset.create({
        data: {
          assetTag,
          qrToken: randomUUID(),
          categoryId: input.categoryId,
          purchaseCost: input.unitCost,
          purchaseDate: input.purchaseDate,
          status: 'AVAILABLE',
          locationType: 'WAREHOUSE',
          assignedToId: null,
          isQrPrinted: false,
          grnId: input.grnId,
        },
        include: assetInclude,
      });
      await appendAssetLog(tx, {
        assetId: asset.id,
        action: 'PROVISIONED',
        performedById: input.performedById,
        notes: `Provisioned from GRN ${input.grnId}`,
      });
      items.push(asset);
    }
    return items;
  });
  return created.map((r) => shapeAsset(r));
}

export async function registerStockAsset(input: {
  categoryId: string;
  performedById: string;
  serialNumber?: string;
  purchaseCost?: number;
  purchaseDate?: string | Date | null;
  notes?: string;
}) {
  const category = await prisma.assetCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new Error('INVALID_CATEGORY');

  const serial = input.serialNumber?.trim() || null;
  if (serial) {
    const dup = await prisma.asset.findFirst({ where: { serialNumber: serial } });
    if (dup) throw new Error('SERIAL_ALREADY_EXISTS');
  }

  const year = new Date().getFullYear();
  const row = await prisma.$transaction(async (tx) => {
    const assetTag = await nextAssetTag(tx, year);
    const asset = await tx.asset.create({
      data: {
        assetTag,
        qrToken: randomUUID(),
        categoryId: input.categoryId,
        serialNumber: serial,
        purchaseCost: input.purchaseCost ?? 0,
        purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : new Date(),
        status: 'AVAILABLE',
        locationType: 'WAREHOUSE',
        assignedToId: null,
        isQrPrinted: false,
      },
      include: assetInclude,
    });
    await appendAssetLog(tx, {
      assetId: asset.id,
      action: 'PROVISIONED',
      performedById: input.performedById,
      notes: input.notes || 'Registered to stock',
    });
    return asset;
  });
  return shapeAsset(row);
}

export async function registerManualAssets(input: {
  categoryId: string;
  performedById: string;
  quantity?: number;
  serialNumber?: string;
  purchaseCost?: number;
  purchaseDate?: string | null;
  notes?: string;
  assigneeId?: string | null;
}) {
  const qty = Math.max(1, Math.min(20, input.quantity || 1));
  const created = [];

  for (let i = 0; i < qty; i += 1) {
    const serial =
      qty === 1 && input.serialNumber?.trim()
        ? input.serialNumber.trim()
        : input.serialNumber?.trim()
          ? `${input.serialNumber.trim()}-${i + 1}`
          : undefined;

    let asset = await registerStockAsset({
      categoryId: input.categoryId,
      performedById: input.performedById,
      serialNumber: serial,
      purchaseCost: input.purchaseCost,
      purchaseDate: input.purchaseDate,
      notes: input.notes || 'Manual registration — existing company asset',
    });

    if (input.assigneeId) {
      asset = await assignAsset({
        assetId: asset.id,
        assigneeId: input.assigneeId,
        performedById: input.performedById,
        notes: 'Assigned during manual asset registration',
      });
    }

    created.push(asset);
  }

  return created;
}

export async function assignAsset(input: {
  assetId: string;
  assigneeId: string;
  performedById: string;
  locationType?: 'OFFICE_ROOM' | 'REMOTE';
  locationId?: string | null;
  notes?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.asset.findUnique({ where: { id: input.assetId } });
    if (!existing || existing.status === 'DISPOSED') throw new Error('ASSET_NOT_FOUND');
    if (existing.status !== 'AVAILABLE') throw new Error('ASSET_NOT_AVAILABLE');

    const updated = await tx.asset.update({
      where: { id: input.assetId },
      data: {
        status: 'ASSIGNED',
        assignedToId: input.assigneeId,
        locationType: input.locationType || 'OFFICE_ROOM',
        locationId: input.locationId || null,
      },
      include: assetInclude,
    });
    await appendAssetLog(tx, {
      assetId: input.assetId,
      action: 'ASSIGNED',
      performedById: input.performedById,
      newCustodianId: input.assigneeId,
      notes: input.notes,
    });
    return shapeAsset(updated);
  });
}

export async function transferAsset(input: {
  assetId: string;
  newAssigneeId: string;
  performedById: string;
  locationType?: 'OFFICE_ROOM' | 'REMOTE';
  locationId?: string | null;
  notes?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.asset.findUnique({ where: { id: input.assetId } });
    if (!existing || existing.status === 'DISPOSED') throw new Error('ASSET_NOT_FOUND');
    if (existing.status !== 'ASSIGNED') throw new Error('ASSET_NOT_ASSIGNED');

    const updated = await tx.asset.update({
      where: { id: input.assetId },
      data: {
        assignedToId: input.newAssigneeId,
        locationType: input.locationType || existing.locationType,
        locationId: input.locationId ?? existing.locationId,
      },
      include: assetInclude,
    });
    await appendAssetLog(tx, {
      assetId: input.assetId,
      action: 'TRANSFERRED',
      performedById: input.performedById,
      oldCustodianId: existing.assignedToId,
      newCustodianId: input.newAssigneeId,
      notes: input.notes,
    });
    return shapeAsset(updated);
  });
}

export async function returnAssetToStock(input: {
  assetId: string;
  performedById: string;
  notes?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.asset.findUnique({ where: { id: input.assetId } });
    if (!existing || existing.status === 'DISPOSED') throw new Error('ASSET_NOT_FOUND');

    const updated = await tx.asset.update({
      where: { id: input.assetId },
      data: {
        status: 'AVAILABLE',
        assignedToId: null,
        locationType: 'WAREHOUSE',
        locationId: null,
      },
      include: assetInclude,
    });
    await appendAssetLog(tx, {
      assetId: input.assetId,
      action: 'RETURNED_TO_STOCK',
      performedById: input.performedById,
      oldCustodianId: existing.assignedToId,
      notes: input.notes,
    });
    return shapeAsset(updated);
  });
}

export async function sendAssetToRepair(
  input: {
    assetId: string;
    performedById: string;
    ticketId?: string;
    notes?: string;
  },
  existingTx?: Tx,
) {
  const run = async (tx: Tx) => {
    const existing = await tx.asset.findUnique({ where: { id: input.assetId } });
    if (!existing || existing.status === 'DISPOSED') throw new Error('ASSET_NOT_FOUND');

    const updated = await tx.asset.update({
      where: { id: input.assetId },
      data: {
        status: 'IN_REPAIR',
        assignedToId: null,
        locationType: 'IT_REPAIR_LAB',
        locationId: null,
      },
      include: assetInclude,
    });
    await appendAssetLog(tx, {
      assetId: input.assetId,
      action: 'SENT_TO_REPAIR',
      performedById: input.performedById,
      oldCustodianId: existing.assignedToId,
      notes: input.notes,
      metadata: input.ticketId ? { ticketId: input.ticketId } : undefined,
    });
    return shapeAsset(updated);
  };
  if (existingTx) return run(existingTx);
  return prisma.$transaction(run);
}

export async function completeRepairReturn(
  input: {
    assetId: string;
    performedById: string;
    destination: 'EMPLOYEE' | 'WAREHOUSE';
    employeeId?: string;
    notes?: string;
  },
  existingTx?: Tx,
) {
  const run = async (tx: Tx) => {
    const existing = await tx.asset.findUnique({ where: { id: input.assetId } });
    if (!existing || existing.status !== 'IN_REPAIR') throw new Error('ASSET_NOT_IN_REPAIR');

    if (input.destination === 'EMPLOYEE') {
      if (!input.employeeId) throw new Error('EMPLOYEE_REQUIRED');
      const updated = await tx.asset.update({
        where: { id: input.assetId },
        data: {
          status: 'ASSIGNED',
          assignedToId: input.employeeId,
          locationType: 'OFFICE_ROOM',
        },
        include: assetInclude,
      });
      await appendAssetLog(tx, {
        assetId: input.assetId,
        action: 'REPAIR_COMPLETED',
        performedById: input.performedById,
        newCustodianId: input.employeeId,
        notes: input.notes || 'Returned to employee after repair',
      });
      return shapeAsset(updated);
    }

    const updated = await tx.asset.update({
      where: { id: input.assetId },
      data: {
        status: 'AVAILABLE',
        assignedToId: null,
        locationType: 'WAREHOUSE',
        locationId: null,
      },
      include: assetInclude,
    });
    await appendAssetLog(tx, {
      assetId: input.assetId,
      action: 'REPAIR_COMPLETED',
      performedById: input.performedById,
      notes: input.notes || 'Returned to warehouse after repair',
    });
    await appendAssetLog(tx, {
      assetId: input.assetId,
      action: 'RETURNED_TO_STOCK',
      performedById: input.performedById,
      notes: 'Post-repair stock return',
    });
    return shapeAsset(updated);
  };
  if (existingTx) return run(existingTx);
  return prisma.$transaction(run);
}

export async function scrapAsset(input: {
  assetId: string;
  performedById: string;
  notes?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.asset.findUnique({ where: { id: input.assetId } });
    if (!existing || existing.status === 'DISPOSED') throw new Error('ASSET_NOT_FOUND');

    const updated = await tx.asset.update({
      where: { id: input.assetId },
      data: {
        status: 'DISPOSED',
        assignedToId: null,
        disposedAt: new Date(),
      },
      include: assetInclude,
    });
    await appendAssetLog(tx, {
      assetId: input.assetId,
      action: 'SCRAPPED',
      performedById: input.performedById,
      oldCustodianId: existing.assignedToId,
      notes: input.notes,
    });
    return shapeAsset(updated);
  });
}

export async function updateAssetSerial(assetId: string, serialNumber: string, performedById?: string) {
  return prisma.asset.update({
    where: { id: assetId },
    data: { serialNumber: serialNumber.trim() },
    include: assetInclude,
  }).then(shapeAsset);
}

export async function markQrPrinted(assetIds: string[]) {
  if (!assetIds.length) return { count: 0 };
  const result = await prisma.asset.updateMany({
    where: { id: { in: assetIds }, isQrPrinted: false },
    data: { isQrPrinted: true },
  });
  return { count: result.count };
}

export async function listQrPendingAssets() {
  const rows = await prisma.asset.findMany({
    where: { isQrPrinted: false, status: { not: 'DISPOSED' } },
    include: assetInclude,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => shapeAsset(r));
}

export async function getFinanceDashboard() {
  const assets = await prisma.asset.findMany({
    where: { status: { not: 'DISPOSED' } },
    include: { category: true },
  });
  let totalPurchase = 0;
  let totalBook = 0;
  const byCategory: Record<string, { count: number; bookValue: number; purchaseCost: number }> = {};
  for (const a of assets) {
    const shaped = shapeAsset(a);
    totalPurchase += shaped.depreciation.purchaseCost;
    totalBook += shaped.depreciation.currentBookValue;
    const key = a.category?.name || 'Unknown';
    if (!byCategory[key]) byCategory[key] = { count: 0, bookValue: 0, purchaseCost: 0 };
    byCategory[key].count += 1;
    byCategory[key].bookValue += shaped.depreciation.currentBookValue;
    byCategory[key].purchaseCost += shaped.depreciation.purchaseCost;
  }
  return {
    assetCount: assets.length,
    totalPurchaseCost: Math.round(totalPurchase * 100) / 100,
    totalBookValue: Math.round(totalBook * 100) / 100,
    byCategory,
  };
}
