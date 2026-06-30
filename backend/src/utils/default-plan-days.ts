/** Display reference number of the template project (Main Table project ref, not internal projectNumber). */
export const REFERENCE_PROJECT_REF = '2583';
/** Used when the primary reference project has no tasks yet. */
export const REFERENCE_PROJECT_REF_FALLBACK = '2539';

/** @deprecated use REFERENCE_PROJECT_REF — was wrongly using internal projectNumber */
export const REFERENCE_PLAN_DAYS_PROJECT_NUMBER = 2583;

function hasTemplateData(data: ReferenceTaskTemplate): boolean {
  if (Object.keys(data.byName).length > 0) return true;
  return data.bySlot.some((v) => v != null);
}

async function loadReferenceFromProjectRef(
  prisma: { task: { findMany: (...args: any[]) => Promise<any[]> } },
  referenceNumber: string,
): Promise<ReferenceTaskTemplate> {
  const byName: ReferenceTaskTemplate['byName'] = {};
  const byStem: ReferenceTaskTemplate['byStem'] = {};
  const bySlot: ReferenceTaskTemplate['bySlot'] = [];

  const tasks = await prisma.task.findMany({
    where: {
      parentTaskId: null,
      deletedAt: null,
      project: { referenceNumber: String(referenceNumber).trim(), deletedAt: null },
    },
    select: {
      title: true,
      planDays: true,
      taskOrder: true,
      stableWorkSeq: true,
      category: true,
      priority: true,
      assignedEmployeeId: true,
      assignedEmployee: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: [{ taskOrder: 'asc' }, { stableWorkSeq: 'asc' }, { createdAt: 'asc' }],
  });

  const maps: ReferenceTaskTemplate = { byName, bySlot, byStem };
  tasks.forEach((t, index) => {
    const row = rowFromTask(t);
    const hasData =
      (row.planDays != null && row.planDays > 0) ||
      !!row.category ||
      !!row.priority ||
      !!row.assignedEmployeeId;
    if (!hasData) return;

    const slot0 =
      t.stableWorkSeq != null && Number.isFinite(Number(t.stableWorkSeq))
        ? Number(t.stableWorkSeq) - 1
        : index;
    storeReferenceRow(maps, row, t.title, slot0, index);
  });

  return { byName, bySlot, byStem };
}

export function isReferenceProjectRef(referenceNumber: unknown): boolean {
  const r = String(referenceNumber ?? '').trim();
  return r === REFERENCE_PROJECT_REF || r === REFERENCE_PROJECT_REF_FALLBACK;
}

/** Load task template from reference project (by referenceNumber, e.g. 2583). */
export async function loadReferencePlanDaysData(
  prisma: { task: { findMany: (...args: any[]) => Promise<any[]> } },
  referenceNumber: string = REFERENCE_PROJECT_REF,
): Promise<ReferenceTaskTemplate> {
  const primary = await loadReferenceFromProjectRef(prisma, referenceNumber);
  if (hasTemplateData(primary)) return primary;
  if (String(referenceNumber).trim() !== REFERENCE_PROJECT_REF_FALLBACK) {
    const fallback = await loadReferenceFromProjectRef(prisma, REFERENCE_PROJECT_REF_FALLBACK);
    if (hasTemplateData(fallback)) return fallback;
  }
  return primary;
}

/** Static fallback when reference project is not in DB. */
const DEFAULT_PLAN_DAYS_BY_TASK_NAME: Record<string, number> = {
  '2D CONCEPT DESIGN': 10,
  '3D': 10,
  'AFFECTION PLAN': 4,
  'SOIL INVESTIGATION REPORT': 7,
  'SOIL REPORT': 10,
  'SURVEY REPORT': 10,
  'ARCH - PD DRAWING': 10,
  'PD - NKL': 10,
  'INFORMATION - RTA': 15,
  'ROW - RTA': 15,
  'CAR ACCESS - NKL': 15,
  'CONCEPT DESIGN - TRK': 15,
};

export type ReferenceTaskRow = {
  planDays?: number;
  category?: string | null;
  priority?: string | null;
  assignedEmployeeId?: string | null;
  assignedEmployee?: Record<string, unknown> | null;
};

export type ReferenceTaskTemplate = {
  byName: Record<string, ReferenceTaskRow | number>;
  bySlot: Array<ReferenceTaskRow | number | undefined>;
  byStem: Record<string, ReferenceTaskRow | number>;
};

/** @deprecated alias — values are now full task rows, not just plan days */
export type ReferencePlanDays = ReferenceTaskTemplate;

function normalizeTaskNameKey(name: unknown): string {
  return String(name ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ');
}

function taskNameStemKey(name: unknown): string {
  const n = normalizeTaskNameKey(name);
  const idx = n.lastIndexOf(' - ');
  if (idx > 0) return n.slice(0, idx).trim();
  return n;
}

function aliasNameKeys(key: string): string[] {
  const keys = new Set<string>();
  if (key) keys.add(key);
  keys.add(key.replace(/ - /g, '-'));
  keys.add(key.replace(/-/g, ' - '));
  return Array.from(keys);
}

function mapBackendPriorityToFrontend(priority: unknown): string | null {
  const p = String(priority || '').trim().toUpperCase();
  if (!p) return null;
  if (p === 'LOW') return 'Low';
  if (p === 'HIGH') return 'High';
  if (p === 'URGENT') return 'Urgent';
  if (p === 'MEDIUM') return 'Medium';
  return String(priority);
}

function normalizeRefEntry(entry: ReferenceTaskRow | number | null | undefined): ReferenceTaskRow {
  if (entry == null) return {};
  if (typeof entry === 'number') return { planDays: entry };
  return entry;
}

function rowFromTask(t: {
  title?: string | null;
  planDays?: number | null;
  category?: string | null;
  priority?: string | null;
  assignedEmployeeId?: string | null;
  assignedEmployee?: Record<string, unknown> | null;
}): ReferenceTaskRow {
  const row: ReferenceTaskRow = {};
  const days = t.planDays != null ? Number(t.planDays) : NaN;
  if (Number.isFinite(days) && days > 0) row.planDays = days;
  const category = String(t.category || '').trim();
  if (category) row.category = category;
  const priority = mapBackendPriorityToFrontend(t.priority);
  if (priority) row.priority = priority;
  if (t.assignedEmployeeId) {
    row.assignedEmployeeId = String(t.assignedEmployeeId);
    row.assignedEmployee = t.assignedEmployee ?? null;
  }
  return row;
}

function storeReferenceRow(
  maps: ReferenceTaskTemplate,
  row: ReferenceTaskRow,
  title: unknown,
  slot0: number,
  index: number,
): void {
  const key = normalizeTaskNameKey(title);
  for (const alias of aliasNameKeys(key)) {
    maps.byName[alias] = row;
  }
  const stem = taskNameStemKey(title);
  if (stem && maps.byStem[stem] == null) maps.byStem[stem] = row;
  maps.bySlot[slot0] = row;
  if (maps.bySlot[index] == null) maps.bySlot[index] = row;
}

/** @deprecated use loadReferencePlanDaysData */
export async function loadReferencePlanDaysMap(
  prisma: Parameters<typeof loadReferencePlanDaysData>[0],
  referenceNumber: string = REFERENCE_PROJECT_REF,
): Promise<Record<string, number>> {
  const data = await loadReferencePlanDaysData(prisma, referenceNumber);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(data.byName)) {
    const row = normalizeRefEntry(v);
    if (row.planDays != null && row.planDays > 0) out[k] = row.planDays;
  }
  return out;
}

export function lookupReferenceRow(
  title: unknown,
  reference: ReferenceTaskTemplate | Record<string, number> | null | undefined,
  slotIndex: number | null | undefined,
): ReferenceTaskRow | undefined {
  if (!reference) return undefined;

  const isFullRef = 'byName' in reference && reference.byName != null;
  const byName = isFullRef
    ? (reference as ReferenceTaskTemplate).byName
    : (reference as Record<string, number | ReferenceTaskRow>);
  const bySlot = isFullRef ? (reference as ReferenceTaskTemplate).bySlot : undefined;
  const byStem = isFullRef ? (reference as ReferenceTaskTemplate).byStem : undefined;

  const key = normalizeTaskNameKey(title);
  for (const alias of aliasNameKeys(key)) {
    const hit = byName[alias];
    if (hit != null) return normalizeRefEntry(hit);
  }

  if (bySlot && slotIndex != null && slotIndex >= 0) {
    const slotHit = bySlot[slotIndex];
    if (slotHit != null) return normalizeRefEntry(slotHit);
  }

  const stem = taskNameStemKey(title);
  if (stem && byStem && byStem[stem] != null) return normalizeRefEntry(byStem[stem]);

  return undefined;
}

function lookupReferenceDays(
  title: unknown,
  reference: ReferenceTaskTemplate | Record<string, number> | null | undefined,
  slotIndex: number | null | undefined,
): number | undefined {
  const row = lookupReferenceRow(title, reference, slotIndex);
  const days = row?.planDays;
  return days != null && days > 0 ? days : undefined;
}

const PLACEHOLDER_CATEGORIES = new Set(['', 'DESIGN', 'GENERAL']);

function isPlaceholderCategory(category: unknown): boolean {
  return PLACEHOLDER_CATEGORIES.has(String(category || '').trim().toUpperCase());
}

function isPlaceholderPriority(priority: unknown): boolean {
  const p = String(priority || '').trim().toLowerCase();
  return !p || p === 'low' || p === 'medium';
}

function isPlaceholderAssignee(assigneeId: unknown): boolean {
  return assigneeId == null || String(assigneeId).trim() === '';
}

/** Inherit from project 2539 when value is empty/placeholder (1). */
export function resolvePlanDaysForTaskTitle(
  title: unknown,
  planDays: unknown,
  reference?: ReferenceTaskTemplate | Record<string, number> | null,
  slotIndex?: number | null,
): number | null {
  const parsed = planDays != null && planDays !== '' ? parseInt(String(planDays), 10) : NaN;
  const isPlaceholder = !Number.isFinite(parsed) || parsed <= 0 || parsed === 1;
  const refDays = lookupReferenceDays(title, reference, slotIndex);

  if (refDays != null && refDays > 0 && isPlaceholder) return refDays;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  if (refDays != null && refDays > 0) return refDays;

  const key = normalizeTaskNameKey(title);
  for (const alias of aliasNameKeys(key)) {
    const fallback = DEFAULT_PLAN_DAYS_BY_TASK_NAME[alias];
    if (fallback != null && fallback > 0) return fallback;
  }
  const stem = taskNameStemKey(title);
  const stemFallback = stem ? DEFAULT_PLAN_DAYS_BY_TASK_NAME[stem] : undefined;
  return stemFallback != null && stemFallback > 0 ? stemFallback : null;
}

export function resolveCategoryForTaskTitle(
  title: unknown,
  category: unknown,
  reference?: ReferenceTaskTemplate | Record<string, number> | null,
  slotIndex?: number | null,
): string | null {
  const refCategory = lookupReferenceRow(title, reference, slotIndex)?.category;
  const current = String(category || '').trim();
  if (refCategory && isPlaceholderCategory(category)) return refCategory;
  if (current) return current;
  return refCategory || null;
}

export function resolvePriorityForTaskTitle(
  title: unknown,
  priority: unknown,
  reference?: ReferenceTaskTemplate | Record<string, number> | null,
  slotIndex?: number | null,
): string | null {
  const refPriority = lookupReferenceRow(title, reference, slotIndex)?.priority;
  const current = String(priority || '').trim();
  if (refPriority && isPlaceholderPriority(priority)) return refPriority;
  if (current) return current;
  return refPriority || null;
}

export function resolveAssigneeIdForTaskTitle(
  title: unknown,
  assigneeId: unknown,
  reference?: ReferenceTaskTemplate | Record<string, number> | null,
  slotIndex?: number | null,
): string | null {
  const refId = lookupReferenceRow(title, reference, slotIndex)?.assignedEmployeeId;
  const current = assigneeId != null ? String(assigneeId).trim() : '';
  if (refId && isPlaceholderAssignee(assigneeId)) return refId;
  if (current) return current;
  return refId || null;
}

/** Apply project 2539 template onto a task row (for GET responses and saves). */
export function applyReferenceTemplateToTaskRow(
  task: {
    title?: string | null;
    name?: string | null;
    planDays?: number | null;
    category?: string | null;
    priority?: unknown;
    assignedEmployeeId?: string | null;
    assignedEmployee?: Record<string, unknown> | null;
  },
  reference: ReferenceTaskTemplate | null | undefined,
  slotIndex: number | null | undefined,
): typeof task {
  const title = task.title ?? task.name;
  const refRow = lookupReferenceRow(title, reference, slotIndex);
  if (!refRow) return task;

  const out = { ...task };
  if (refRow.planDays != null && refRow.planDays > 0) out.planDays = refRow.planDays;
  if (refRow.category) out.category = refRow.category;
  if (refRow.priority) out.priority = refRow.priority;
  // Only inherit template assignee when the row has no assignee yet (paste / new row).
  if (refRow.assignedEmployeeId && isPlaceholderAssignee(task.assignedEmployeeId)) {
    out.assignedEmployeeId = refRow.assignedEmployeeId;
    out.assignedEmployee =
      (refRow.assignedEmployee as Record<string, unknown> | null) ?? out.assignedEmployee ?? null;
  }
  return out;
}

export function applyReferenceTemplateToTaskTree(
  tasks: Array<Record<string, unknown>>,
  reference: ReferenceTaskTemplate | null | undefined,
): Array<Record<string, unknown>> {
  if (!reference || !Array.isArray(tasks)) return tasks;
  return tasks.map((t, idx) => {
    const mapped = applyReferenceTemplateToTaskRow(
      t as Parameters<typeof applyReferenceTemplateToTaskRow>[0],
      reference,
      idx,
    ) as Record<string, unknown>;
    const children = (t.subtasks as Array<Record<string, unknown>> | undefined) ?? [];
    if (children.length > 0) {
      mapped.subtasks = children.map((c, cIdx) =>
        applyReferenceTemplateToTaskRow(
          c as Parameters<typeof applyReferenceTemplateToTaskRow>[0],
          reference,
          cIdx,
        ),
      );
    }
    return mapped;
  });
}
