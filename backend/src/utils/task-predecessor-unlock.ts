import type { PrismaClient } from '@prisma/client';
import { TaskStatus } from '@prisma/client';

/**
 * Any task that waits on this predecessor and whose predecessor row is already
 * finished (status or workflow) should leave WAITING — fixes missed unlocks when
 * completion was saved with a non‑enum label (e.g. "Done - Open Next Phase").
 */
export async function unlockDependentsWaitingOnFinishedPredecessor(
  db: Pick<PrismaClient, 'task'>,
  predecessorTaskId: string
): Promise<void> {
  await db.task.updateMany({
    where: {
      predecessorId: predecessorTaskId,
      predecessor: {
        OR: [{ status: 'COMPLETED' }, { workflowStatus: 'COMPLETED' }],
      },
    },
    // IMPORTANT: also reset main `status` so UI "active" views don't treat it as completed.
    // `workflowStatus` alone controls edit-locking, but the UI visibility often uses `status`.
    data: { workflowStatus: 'NOT_STARTED', status: TaskStatus.PENDING },
  });
}
