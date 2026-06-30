import prisma from '../../config/database';

export async function countAssignedAssets(userId: string): Promise<number> {
  return prisma.asset.count({
    where: {
      assignedToId: userId,
      status: { in: ['ASSIGNED', 'IN_REPAIR'] },
    },
  });
}

export async function assertNoAssignedAssets(userId: string): Promise<void> {
  const count = await countAssignedAssets(userId);
  if (count > 0) {
    const err = new Error('ASSETS_IN_CUSTODY');
    (err as any).count = count;
    throw err;
  }
}

export async function listCustodyAssets(userId: string) {
  return prisma.asset.findMany({
    where: { assignedToId: userId, status: { not: 'DISPOSED' } },
    include: { category: true },
    orderBy: { assetTag: 'asc' },
  });
}
