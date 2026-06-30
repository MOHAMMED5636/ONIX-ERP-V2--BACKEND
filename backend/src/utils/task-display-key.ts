/**
 * User-visible task IDs (e.g. 4-2, 4-2.1) vs internal stableWorkSeq.
 */

export type DisplayKeyRow = {
  id: string;
  stableWorkSeq?: number | null;
  taskOrder?: number | null;
  displayAnchorSeq?: number | null;
  displaySuffix?: string | null;
  parentTaskId?: string | null;
};

/** Map legacy letter suffix (A, B) to its numeric slot for allocation. */
function legacyLetterSuffixSlot(suffix: string): number | null {
  const s = String(suffix).trim();
  if (!/^[A-Za-z]+$/.test(s)) return null;
  if (s.length === 1) return s.toUpperCase().charCodeAt(0) - 64;
  return null;
}

/** Numeric slot from stored suffix (.1, .2 or legacy A, B). */
export function displaySuffixSlot(suffix: string): number | null {
  const s = String(suffix).trim();
  if (!s) return null;
  const dotMatch = s.match(/^\.(\d+)$/);
  if (dotMatch) {
    const n = Number(dotMatch[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return legacyLetterSuffixSlot(s);
}

/** User-visible suffix segment (always decimal, e.g. .1). */
export function formatDisplaySuffix(suffix: string | null | undefined): string {
  const s = suffix != null ? String(suffix).trim() : '';
  if (!s) return '';
  if (/^\.\d+$/.test(s)) return s;
  const letterSlot = legacyLetterSuffixSlot(s);
  if (letterSlot != null) return `.${letterSlot}`;
  return s.startsWith('.') ? s : `.${s}`;
}

/** Next decimal insert suffix after anchor row (e.g. .1, .2). Fills lowest free slot. */
export function allocateNextDecimalSuffix(used: string[]): string {
  const slots = new Set<number>();
  for (const raw of used) {
    const slot = displaySuffixSlot(raw);
    if (slot != null) slots.add(slot);
  }
  let n = 1;
  while (slots.has(n)) n += 1;
  return `.${n}`;
}

/** @deprecated Use allocateNextDecimalSuffix */
export function allocateNextLetterSuffix(used: string[]): string {
  return allocateNextDecimalSuffix(used);
}

export function buildSubtaskDisplayKey(
  projectNumber: number,
  row: Pick<DisplayKeyRow, 'stableWorkSeq' | 'displayAnchorSeq' | 'displaySuffix'>,
): string {
  const p = projectNumber;
  const suffix = formatDisplaySuffix(row.displaySuffix);
  const anchor = Number(row.displayAnchorSeq);
  if (suffix && Number.isFinite(anchor) && anchor > 0) {
    return `${p}-${anchor}${suffix}`;
  }
  const seq = Number(row.stableWorkSeq);
  if (Number.isFinite(seq) && seq > 0) return `${p}-${seq}`;
  return String(p);
}

export function buildChildDisplayKey(parentDisplayKey: string, childStableWorkSeq: number | null): string {
  const seq = Number(childStableWorkSeq);
  if (!Number.isFinite(seq) || seq <= 0) return parentDisplayKey;
  return `${parentDisplayKey}-${seq}`;
}

/** Parse keys like 4-2, 4-2.1, 4-2A, 4-2.1-1 */
export function parseDisplayTaskKey(key: string): {
  projectPart: number;
  anchorSeq: number;
  suffix: string | null;
  childSeq: number | null;
} | null {
  const trimmed = String(key || '').trim();
  if (!trimmed) return null;

  const childMatch = trimmed.match(/^(\d+)-(\d+)(\.\d+|[A-Za-z]*)-(\d+)$/);
  if (childMatch) {
    const rawSuffix = childMatch[3] || '';
    return {
      projectPart: Number(childMatch[1]),
      anchorSeq: Number(childMatch[2]),
      suffix: rawSuffix ? formatDisplaySuffix(rawSuffix) : null,
      childSeq: Number(childMatch[4]),
    };
  }

  const topMatch = trimmed.match(/^(\d+)-(\d+)(\.\d+|[A-Za-z]*)$/);
  if (topMatch) {
    const rawSuffix = topMatch[3] || '';
    return {
      projectPart: Number(topMatch[1]),
      anchorSeq: Number(topMatch[2]),
      suffix: rawSuffix ? formatDisplaySuffix(rawSuffix) : null,
      childSeq: null,
    };
  }

  return null;
}

function orderValue(row: DisplayKeyRow): number {
  if (row.taskOrder != null && Number.isFinite(row.taskOrder)) return row.taskOrder;
  if (row.stableWorkSeq != null && Number.isFinite(row.stableWorkSeq)) return row.stableWorkSeq;
  return 0;
}

function insertAnchorSeqFromPrev(prev: DisplayKeyRow): number {
  if (prev.displaySuffix) {
    const anchor = Number(prev.displayAnchorSeq);
    if (Number.isFinite(anchor) && anchor > 0) return anchor;
    return Number(prev.stableWorkSeq) || 0;
  }
  return Number(prev.stableWorkSeq) || 0;
}

function maxMainStableWorkSeq(siblings: DisplayKeyRow[]): number {
  return siblings
    .filter((s) => !s.displaySuffix)
    .reduce((max, s) => Math.max(max, Number(s.stableWorkSeq) || 0), 0);
}

function mainStableWorkSeqSet(siblings: DisplayKeyRow[], excludeId?: string): Set<number> {
  return new Set(
    siblings
      .filter((s) => !s.displaySuffix && s.id !== excludeId)
      .map((s) => Number(s.stableWorkSeq))
      .filter((n) => Number.isFinite(n) && n > 0),
  );
}

/**
 * True only for rows inserted between existing tasks (append-only stableWorkSeq jumps
 * ahead of the next main sibling). Normal sequential rows (2, 3, 4…) must NOT get suffixes.
 */
export function isGenuineInsertedDisplayRow(
  t: DisplayKeyRow,
  prev: DisplayKeyRow | undefined,
  next: DisplayKeyRow | undefined,
  siblings: DisplayKeyRow[] = [],
): boolean {
  if (!prev) return false;

  const seq = t.stableWorkSeq ?? 0;
  const prevSeq = prev.stableWorkSeq ?? 0;
  const nextSeq = next?.stableWorkSeq ?? null;
  const orderOk =
    orderValue(t) > orderValue(prev) &&
    (next == null || orderValue(t) < orderValue(next));

  if (!orderOk || seq <= prevSeq) return false;

  const maxMainSeq = siblings.length > 0 ? maxMainStableWorkSeq(siblings) : 0;
  if (siblings.length > 0 && seq <= maxMainSeq) return false;

  const anchor = Number(t.displayAnchorSeq);
  const hasAnchor = Number.isFinite(anchor) && anchor > 0;
  const anchorSeq = hasAnchor ? anchor : insertAnchorSeqFromPrev(prev);

  // Multiple insert-between rows after the same anchor (3-2.1, 3-2.2, …) share high
  // stableWorkSeq values; the immediate next sibling may have a higher seq than this row.
  if (next?.displaySuffix) {
    return seq > anchorSeq;
  }

  if (next != null) {
    return seq > (nextSeq ?? 0);
  }

  const prevMainSeq = prev.displaySuffix ? anchorSeq : prevSeq;
  return seq > prevMainSeq + 1;
}

export function resolveDisplayAnchorSeq(
  projectNumber: number,
  row: Pick<DisplayKeyRow, 'stableWorkSeq' | 'displayAnchorSeq' | 'displaySuffix'>,
): number {
  const key = buildSubtaskDisplayKey(projectNumber, row);
  const parsed = parseDisplayTaskKey(key);
  if (parsed && Number.isFinite(parsed.anchorSeq) && parsed.anchorSeq > 0) {
    return parsed.anchorSeq;
  }
  const seq = Number(row.stableWorkSeq);
  if (Number.isFinite(seq) && seq > 0) return seq;
  return 1;
}

/**
 * Compact main rows (no letter suffix) to stableWorkSeq 1..n in list order.
 * Insert-between rows keep suffix display (e.g. 3-2.1, 3-2.2) and are not renumbered.
 */
export async function compactMainRowStableWorkSeq(
  db: { task: { findMany: Function; update: Function } },
  projectId: string,
  parentTaskId: string | null,
): Promise<number> {
  const siblings = (await db.task.findMany({
    where: { projectId, parentTaskId, deletedAt: null },
    orderBy: [{ taskOrder: 'asc' }, { stableWorkSeq: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      stableWorkSeq: true,
      taskOrder: true,
      displayAnchorSeq: true,
      displaySuffix: true,
    },
  })) as DisplayKeyRow[];

  const mains = siblings.filter((s) => !s.displaySuffix);
  let fixed = 0;
  for (let i = 0; i < mains.length; i++) {
    const want = i + 1;
    if (mains[i].stableWorkSeq === want) continue;
    await db.task.update({
      where: { id: mains[i].id },
      data: { stableWorkSeq: want, displayAnchorSeq: null, displaySuffix: null },
    });
    mains[i].stableWorkSeq = want;
    fixed += 1;
  }
  return fixed;
}

/**
 * (e.g. showing 4-47 instead of 4-2.1). Also clears suffixes wrongly applied to
 * normal sequential rows.
 */
export async function repairInsertedTaskDisplayKeys(
  db: { task: { findMany: Function; update: Function } },
  projectId: string,
  parentTaskId: string | null,
  projectNumber = 1,
): Promise<number> {
  const siblings = (await db.task.findMany({
    where: { projectId, parentTaskId, deletedAt: null },
    orderBy: [{ taskOrder: 'asc' }, { stableWorkSeq: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      stableWorkSeq: true,
      taskOrder: true,
      displayAnchorSeq: true,
      displaySuffix: true,
    },
  })) as DisplayKeyRow[];

  let fixed = 0;
  for (let i = 0; i < siblings.length; i++) {
    const t = siblings[i];
    const prev = siblings[i - 1];
    const next = siblings[i + 1];
    const seq = Number(t.stableWorkSeq);
    const mainSeqs = mainStableWorkSeqSet(siblings, t.id);

    if (t.displaySuffix) {
      if (Number.isFinite(seq) && seq > 0 && mainSeqs.has(seq)) {
        await db.task.update({
          where: { id: t.id },
          data: { displayAnchorSeq: null, displaySuffix: null },
        });
        t.displayAnchorSeq = null;
        t.displaySuffix = null;
        fixed += 1;
        continue;
      }
      if (!isGenuineInsertedDisplayRow(t, prev, next, siblings)) {
        await db.task.update({
          where: { id: t.id },
          data: { displayAnchorSeq: null, displaySuffix: null },
        });
        t.displayAnchorSeq = null;
        t.displaySuffix = null;
        fixed += 1;
        continue;
      }
      continue;
    }

    if (!prev) continue;

    if (!isGenuineInsertedDisplayRow(t, prev, next, siblings)) continue;

    const anchorSeq = resolveDisplayAnchorSeq(projectNumber, prev);
    const used = siblings
      .filter(
        (s) =>
          s.displaySuffix && resolveDisplayAnchorSeq(projectNumber, s) === anchorSeq,
      )
      .map((s) => String(s.displaySuffix));

    const displaySuffix = allocateNextDecimalSuffix(used);
    await db.task.update({
      where: { id: t.id },
      data: { displayAnchorSeq: anchorSeq, displaySuffix },
    });
    t.displayAnchorSeq = anchorSeq;
    t.displaySuffix = displaySuffix;
    fixed += 1;
  }
  return fixed;
}

export function buildDisplayKeyIndex(
  rows: DisplayKeyRow[],
  taskById: Map<string, DisplayKeyRow & { title?: string }>,
  projectNumber: number,
): Map<string, string> {
  const index = new Map<string, string>();
  const add = (key: string, id: string) => {
    const k = key.trim();
    if (!k) return;
    index.set(k, id);
    index.set(k.toUpperCase(), id);
  };

  for (const row of rows) {
    if (row.parentTaskId) continue;
    add(buildSubtaskDisplayKey(projectNumber, row), row.id);
  }

  for (const row of rows) {
    if (!row.parentTaskId) continue;
    const parent = taskById.get(row.parentTaskId);
    if (!parent) continue;
    const parentKey = buildSubtaskDisplayKey(projectNumber, parent);
    add(buildChildDisplayKey(parentKey, row.stableWorkSeq ?? null), row.id);
  }

  return index;
}

export function resolveTaskIdFromDisplayKey(
  key: string,
  displayIndex: Map<string, string>,
): string | null {
  const trimmed = key.trim();
  return displayIndex.get(trimmed) ?? displayIndex.get(trimmed.toUpperCase()) ?? null;
}
