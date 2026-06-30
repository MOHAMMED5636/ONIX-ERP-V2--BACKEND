import prisma from '../../config/database';
import { emitErpNotification } from '../erpNotification.service';
import { sendBrowserPushToUsers } from '../browserPush.service';
import { createDraftRequisition } from './procurement.service';

async function notifyAssetManagers(title: string, message: string) {
  const managers = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['ADMIN', 'SUPER_ADMIN', 'HR'] } },
    select: { id: true },
  });
  const ids = managers.map((m) => m.id);
  const payload = {
    id: `eam-threshold-${Date.now()}`,
    type: 'eam_threshold',
    title,
    message,
    createdAt: new Date().toISOString(),
  };
  for (const id of ids) emitErpNotification(id, payload);
  await sendBrowserPushToUsers(ids, {
    title,
    body: message,
    url: '/eam/requisitions',
    tag: 'eam-threshold',
  }).catch(() => {});
}

/** Daily job: check category stock vs min threshold; create draft PR when low. */
export async function processInventoryThresholds(): Promise<number> {
  const categories = await prisma.assetCategory.findMany();
  let triggered = 0;

  for (const cat of categories) {
    if (cat.minThreshold <= 0) continue;
    const available = await prisma.asset.count({
      where: { categoryId: cat.id, status: 'AVAILABLE' },
    });
    if (available > cat.minThreshold) continue;

    const suggestedQuantity = cat.minThreshold * 2;
    const existingDraft = await prisma.purchaseRequisition.findFirst({
      where: {
        categoryId: cat.id,
        status: 'DRAFT',
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });
    if (existingDraft) continue;

    await createDraftRequisition({
      categoryId: cat.id,
      suggestedQuantity,
      reason: `Automated replenishment: ${available} available, minimum threshold ${cat.minThreshold}.`,
    });

    await notifyAssetManagers(
      `Low stock: ${cat.name}`,
      `Only ${available} unit(s) available (threshold ${cat.minThreshold}). Draft purchase requisition created for ${suggestedQuantity} units.`,
    );
    triggered += 1;
  }

  return triggered;
}
