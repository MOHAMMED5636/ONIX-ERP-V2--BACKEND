import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Next internal stableWorkSeq slot (append-only). Main-row display stays 1..n via compact on load.
 */
export async function computeNextStableWorkSeq(
  db: any,
  projectId: string,
  parentTaskId: string | null,
): Promise<number> {
  const agg = await db.task.aggregate({
    where: { projectId, parentTaskId, deletedAt: null },
    _max: { stableWorkSeq: true },
  } as any);
  return ((agg as { _max: { stableWorkSeq: number | null } })._max.stableWorkSeq ?? 0) + 1;
}

/** Next main-row display number when appending at end (excludes insert-between suffix rows). */
export async function computeNextMainDisplaySeq(
  db: any,
  projectId: string,
  parentTaskId: string | null,
): Promise<number> {
  const rows = await db.task.findMany({
    where: { projectId, parentTaskId, deletedAt: null },
    select: { stableWorkSeq: true, displaySuffix: true },
  });
  const mainSeqs = rows
    .filter((r: { displaySuffix?: string | null }) => !r.displaySuffix)
    .map((r: { stableWorkSeq?: number | null }) => Number(r.stableWorkSeq) || 0);
  const maxMain = mainSeqs.reduce((m: number, s: number) => Math.max(m, s), 0);
  return maxMain + 1;
}

export type ProjectNumberTx = Pick<
  Prisma.TransactionClient,
  '$executeRaw' | '$queryRaw' | 'project'
>;

export async function computeNextProjectNumber(tx: ProjectNumberTx): Promise<number> {
  const agg = await tx.project.aggregate({
    _max: { projectNumber: true },
  });
  return (agg._max.projectNumber ?? 0) + 1;
}

/**
 * Allocate next global project number (1..N) without duplicates.
 *
 * Why not rely purely on SERIAL/sequence?
 * - If projects are deleted/truncated, Postgres sequences do NOT reset automatically,
 *   which made "first project" show as 26, 28, etc.
 * - This allocator uses MAX(projectNumber)+1, and starts at 1 when table is empty.
 *
 * Concurrency safety:
 * - Runs in SERIALIZABLE transaction and relies on the unique constraint on projectNumber.
 * - Retries on serialization failures / unique collisions.
 */
export async function allocateNextProjectNumber(
  prisma: PrismaClient,
  opts?: { maxRetries?: number },
): Promise<number> {
  const maxRetries = opts?.maxRetries ?? 5;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          return computeNextProjectNumber(tx as any);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err: any) {
      const code = err?.code as string | undefined;
      const msg = String(err?.message ?? '');

      const isRetryable =
        code === 'P2002' || // unique constraint failed (rare if caller reserves separately)
        code === 'P2034' || // transaction failed due to conflict / retry
        msg.toLowerCase().includes('could not serialize access') ||
        msg.toLowerCase().includes('serialization failure');

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }
    }
  }

  // Unreachable
  throw new Error('Failed to allocate next project number');
}

