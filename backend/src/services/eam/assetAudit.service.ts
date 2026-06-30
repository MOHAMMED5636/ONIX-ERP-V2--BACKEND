import { Prisma, AssetLogAction } from '@prisma/client';
import prisma from '../../config/database';

type Tx = Prisma.TransactionClient;

export async function appendAssetLog(
  tx: Tx,
  input: {
    assetId: string;
    action: AssetLogAction;
    performedById?: string | null;
    oldCustodianId?: string | null;
    newCustodianId?: string | null;
    notes?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.assetLog.create({
    data: {
      assetId: input.assetId,
      action: input.action,
      performedById: input.performedById || null,
      oldCustodianId: input.oldCustodianId || null,
      newCustodianId: input.newCustodianId || null,
      notes: input.notes?.trim() || null,
      metadata: input.metadata,
    },
  });
}

export async function listAssetLogs(assetId: string, limit = 100) {
  return prisma.assetLog.findMany({
    where: { assetId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      performedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
}
