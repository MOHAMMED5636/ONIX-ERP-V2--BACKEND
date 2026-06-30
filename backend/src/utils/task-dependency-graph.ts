/**
 * Predecessor graph utilities — single-predecessor chains (predecessorId FK).
 */

export type PredecessorEdge = { id: string; predecessorId: string | null };

/** Walk predecessorId links from `startId`; true if `targetId` is reachable (would create a cycle). */
export function wouldCreatePredecessorCycle(
  edges: PredecessorEdge[],
  fromId: string,
  toPredecessorId: string | null,
): boolean {
  if (!toPredecessorId || fromId === toPredecessorId) return fromId === toPredecessorId;

  const byId = new Map(edges.map((e) => [e.id, e.predecessorId]));
  byId.set(fromId, toPredecessorId);

  const visited = new Set<string>();
  let cursor: string | null = fromId;
  while (cursor) {
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    const next: string | null = byId.get(cursor) ?? null;
    if (next === fromId) return true;
    cursor = next;
  }
  return false;
}

/** Human-readable cycle path for API errors. */
export function findPredecessorCyclePath(edges: PredecessorEdge[]): string[] | null {
  const byId = new Map(edges.map((e) => [e.id, e.predecessorId]));
  for (const start of byId.keys()) {
    const path: string[] = [];
    const indexInPath = new Map<string, number>();
    let cursor: string | null = start;
    while (cursor) {
      if (indexInPath.has(cursor)) {
        const startIdx = indexInPath.get(cursor)!;
        return path.slice(startIdx).concat(cursor);
      }
      indexInPath.set(cursor, path.length);
      path.push(cursor);
      cursor = byId.get(cursor) ?? null;
    }
  }
  return null;
}

export function assertNoPredecessorCycle(
  edges: PredecessorEdge[],
  taskId: string,
  nextPredecessorId: string | null,
): void {
  if (wouldCreatePredecessorCycle(edges, taskId, nextPredecessorId)) {
    const err = new Error(
      'Circular dependency detected. A task cannot depend on itself or create a dependency loop.',
    ) as Error & { code: string; statusCode: number };
    err.code = 'PREDECESSOR_CYCLE';
    err.statusCode = 400;
    throw err;
  }
}
