import { TaskEffortType, TaskPriority, TaskStatus } from '@prisma/client';

export const DEFAULT_WORKLOAD_SETTINGS = {
  monitoringCoefficient: 0.3,
  subtaskCoefficient: 0.5,
  defaultPlannedDays: 5,
  employeeCapacity: 10,
  overloadUtilizationPercent: 100,
  balancedUtilizationMin: 50,
  availableUtilizationMax: 30,
  /** Legacy score thresholds (fallback when capacity is unset) */
  overloadThreshold: 5.0,
  balancedMin: 2.0,
  availableMax: 1.5,
} as const;

export const XP_MULTIPLIER_FULL_FOCUS = 10;
export const XP_MULTIPLIER_MONITORING = 2;
export const XP_PER_STAR = 100;

/** Serialize a stored due/completion date as YYYY-MM-DD without local timezone drift. */
export function formatWorkloadCalendarDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Only Done / Completed tasks add to the employee workload point total. */
export const WORKLOAD_POINT_STATUSES = ['COMPLETED'] as const;

/** In-progress assignments shown in the matrix (reassign, visibility) — no points until Done. */
export const WORKLOAD_VISIBLE_TASK_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'SUBMITTED_IN_PROGRESS',
  'COMPLETED',
] as const;

/** @deprecated use WORKLOAD_VISIBLE_TASK_STATUSES for queries; points use WORKLOAD_POINT_STATUSES */
export const ACTIVE_WORKLOAD_STATUSES = WORKLOAD_VISIBLE_TASK_STATUSES;

export type WorkloadStatusColor = 'red' | 'green' | 'yellow' | 'blue';

/** Monitoring effort factor — 0 stored in DB is treated as unset (defaults to 0.3). */
export function resolveMonitoringCoefficient(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  return DEFAULT_WORKLOAD_SETTINGS.monitoringCoefficient;
}

export type WorkloadAnalyticsSettings = {
  monitoringCoefficient: number;
  subtaskCoefficient: number;
  defaultPlannedDays: number;
  employeeCapacity: number;
  overloadUtilizationPercent: number;
  balancedUtilizationMin: number;
  availableUtilizationMax: number;
  overloadThreshold: number;
  balancedMin: number;
  availableMax: number;
};

export type TaskCompletionScheduleVariant = 'ahead' | 'on' | 'delayed';

export type TaskAnalyticsInput = {
  taskWeight: number;
  effortType: TaskEffortType;
  priority: TaskPriority;
  projectFloor: string | null;
  planDays: number | null;
  parentTaskId: string | null;
  /** Planned deadline (due date) — used with completedAt for schedule bonus. */
  dueDate?: Date | null;
  completedAt?: Date | null;
  taskStatus?: TaskStatus | string | null;
};

function startOfCalendarDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function calendarDaysBetweenDates(start: Date, end: Date): number {
  const a = startOfCalendarDay(start);
  const b = startOfCalendarDay(end);
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

function isCompletedTaskStatus(status: TaskStatus | string | null | undefined): boolean {
  const s = String(status ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return s === 'COMPLETED' || s === 'DONE';
}

/** Planned deadline vs actual completion (calendar dates), matching project brief logic. */
export function deriveTaskCompletionScheduleVariant(
  plannedDeadline: Date | null | undefined,
  actualCompletion: Date | null | undefined,
): TaskCompletionScheduleVariant | null {
  if (!plannedDeadline || !actualCompletion) return null;
  const daysFromActualToDeadline = calendarDaysBetweenDates(
    actualCompletion,
    plannedDeadline,
  );
  if (daysFromActualToDeadline > 0) return 'ahead';
  if (daysFromActualToDeadline === 0) return 'on';
  return 'delayed';
}

/** Schedule bonus added after base load: ahead +3, on time +2, late +1. */
export function scheduleStatusBonus(
  variant: TaskCompletionScheduleVariant | null | undefined,
): number {
  if (variant === 'ahead') return 3;
  if (variant === 'on') return 2;
  if (variant === 'delayed') return 1;
  return 0;
}

export function scheduleStatusLabel(
  variant: TaskCompletionScheduleVariant | null | undefined,
): string | null {
  if (variant === 'ahead') return 'Ahead of Schedule';
  if (variant === 'on') return 'On Schedule';
  if (variant === 'delayed') return 'Delayed';
  return null;
}

export function clampTaskWeight(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export function parseTaskEffortType(v: unknown): TaskEffortType | null {
  const s = String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (s === 'FULL_FOCUS' || s === 'FULLFOCUS') return TaskEffortType.FULL_FOCUS;
  if (s === 'MONITORING' || s === 'MONITORING_FOLLOW_UP' || s === 'FOLLOW_UP') {
    return TaskEffortType.MONITORING;
  }
  if (s === 'FULL-FOCUS') return TaskEffortType.FULL_FOCUS;
  return null;
}

export function parseTaskWeightInput(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
}

/** Priority factor: High = 3, Medium = 2, Low = 1, Urgent = 3.5 */
export function priorityFactor(priority: TaskPriority): number {
  switch (priority) {
    case TaskPriority.HIGH:
      return 3;
    case TaskPriority.URGENT:
      return 3.5;
    case TaskPriority.LOW:
      return 1;
    default:
      return 2;
  }
}

/** Parse floor count from projectFloor text (e.g. "G+5" → 6, "3" → 3). Minimum 1. */
export function parseFloorsFactor(projectFloor: string | null | undefined): number {
  if (!projectFloor?.trim()) return 1;
  const s = projectFloor.trim();
  const nums = s.match(/\d+/g);
  if (!nums?.length) return 1;

  if (/g\+|\+\s*\d/i.test(s) || (/\bg\b/i.test(s) && nums.length >= 1)) {
    const floorSum = nums.reduce((acc, n) => acc + parseInt(n, 10), 0);
    return Math.max(1, floorSum + (/\bg\b/i.test(s) ? 1 : 0));
  }

  const first = parseInt(nums[0], 10);
  return Number.isFinite(first) && first > 0 ? first : 1;
}

/**
 * Workload Score = (Task Weight × Effort Factor × Priority Factor × Floors Factor) ÷ Planned Days
 * Subtasks multiply by subtaskCoefficient.
 * Completed tasks add schedule bonus: ahead +3, on time +2, late +1 (planned deadline vs completedAt).
 */
export function taskAnalyticsContributionScore(
  task: TaskAnalyticsInput,
  settings: Pick<
    WorkloadAnalyticsSettings,
    'monitoringCoefficient' | 'subtaskCoefficient' | 'defaultPlannedDays'
  >,
): number {
  const weight = clampTaskWeight(task.taskWeight);
  const effortFactor =
    task.effortType === TaskEffortType.MONITORING
      ? resolveMonitoringCoefficient(settings.monitoringCoefficient)
      : 1.0;
  const priorityF = priorityFactor(task.priority);
  const floorsF = parseFloorsFactor(task.projectFloor);
  const plannedDays = Math.max(1, task.planDays ?? settings.defaultPlannedDays);

  let score = (weight * effortFactor * priorityF * floorsF) / plannedDays;

  if (task.parentTaskId) {
    score *= settings.subtaskCoefficient;
  }

  if (isCompletedTaskStatus(task.taskStatus)) {
    const actualCompletion = task.completedAt ?? new Date();
    const variant = deriveTaskCompletionScheduleVariant(task.dueDate, actualCompletion);
    score += scheduleStatusBonus(variant);
  }

  return Math.round(score * 100) / 100;
}

/** @deprecated Use taskAnalyticsContributionScore — kept for backward compatibility */
export function taskContributionScore(
  weight: number,
  effortType: TaskEffortType,
  monitoringCoefficient: number,
): number {
  return taskAnalyticsContributionScore(
    {
      taskWeight: weight,
      effortType,
      priority: TaskPriority.MEDIUM,
      projectFloor: null,
      planDays: DEFAULT_WORKLOAD_SETTINGS.defaultPlannedDays,
      parentTaskId: null,
    },
    {
      monitoringCoefficient,
      subtaskCoefficient: DEFAULT_WORKLOAD_SETTINGS.subtaskCoefficient,
      defaultPlannedDays: DEFAULT_WORKLOAD_SETTINGS.defaultPlannedDays,
    },
  );
}

export function computeUtilizationPercent(
  workloadScore: number,
  employeeCapacity: number,
): number {
  if (!employeeCapacity || employeeCapacity <= 0) return 0;
  return Math.round((workloadScore / employeeCapacity) * 1000) / 10;
}

export type WorkerStatusLabel =
  | 'Overloaded'
  | 'Balanced'
  | 'Moderate'
  | 'Available'
  | 'Undefined';

/** Classify worker load using open-task count and pending utilization % only. */
export function getWorkerStatus(
  openTasks: number,
  utilization: number,
): WorkerStatusLabel {
  const tasks = Math.max(0, Math.round(Number(openTasks) || 0));
  const util = Number(utilization) || 0;

  if (tasks >= 30 || util >= 95) return 'Overloaded';

  if (
    (tasks >= 15 && tasks <= 45) ||
    (util >= 15 && util <= 45)
  ) {
    return 'Balanced';
  }

  if (
    (tasks >= 7 && tasks <= 20) ||
    (util >= 7 && util <= 20)
  ) {
    return 'Moderate';
  }

  if (
    (tasks >= 3 && tasks <= 10) ||
    (util >= 3 && util <= 10)
  ) {
    return 'Available';
  }

  return 'Undefined';
}

export function workerStatusToColor(
  status: WorkerStatusLabel,
): WorkloadStatusColor {
  switch (status) {
    case 'Overloaded':
      return 'red';
    case 'Balanced':
      return 'green';
    case 'Moderate':
      return 'yellow';
    case 'Available':
      return 'blue';
    default:
      return 'yellow';
  }
}

export function workerStatusColor(
  openTasks: number,
  utilizationPercent: number,
): WorkloadStatusColor {
  return workerStatusToColor(getWorkerStatus(openTasks, utilizationPercent));
}

/** @deprecated Use workerStatusColor(openTasks, utilizationPercent) */
export function workloadStatusFromUtilization(
  utilizationPercent: number,
  settings: Pick<
    WorkloadAnalyticsSettings,
    'overloadUtilizationPercent' | 'balancedUtilizationMin' | 'availableUtilizationMax'
  >,
): WorkloadStatusColor {
  if (utilizationPercent >= 95) return 'red';
  if (utilizationPercent >= 15 && utilizationPercent <= 45) return 'green';
  if (utilizationPercent >= 7 && utilizationPercent <= 20) return 'yellow';
  if (utilizationPercent >= 3 && utilizationPercent <= 10) return 'blue';
  return workerStatusToColor(getWorkerStatus(0, utilizationPercent));
}

/** @deprecated Use workerStatusColor */
export function workloadStatusColor(
  score: number,
  settings: {
    overloadThreshold: number;
    balancedMin: number;
    availableMax: number;
    employeeCapacity?: number;
    overloadUtilizationPercent?: number;
    balancedUtilizationMin?: number;
    availableUtilizationMax?: number;
  },
): WorkloadStatusColor {
  if (settings.employeeCapacity && settings.employeeCapacity > 0) {
    const utilization = computeUtilizationPercent(score, settings.employeeCapacity);
    return workloadStatusFromUtilization(utilization, {
      overloadUtilizationPercent:
        settings.overloadUtilizationPercent ?? DEFAULT_WORKLOAD_SETTINGS.overloadUtilizationPercent,
      balancedUtilizationMin:
        settings.balancedUtilizationMin ?? DEFAULT_WORKLOAD_SETTINGS.balancedUtilizationMin,
      availableUtilizationMax:
        settings.availableUtilizationMax ?? DEFAULT_WORKLOAD_SETTINGS.availableUtilizationMax,
    });
  }
  if (score > settings.overloadThreshold) return 'red';
  if (score >= settings.balancedMin) return 'green';
  if (score <= settings.availableMax) return 'blue';
  return 'yellow';
}

export function effortTypeLabel(effortType: TaskEffortType): string {
  return effortType === TaskEffortType.MONITORING ? 'monitoring' : 'full-focus';
}

/**
 * Task ID for workload / Main Table TASK IDS column: `{projectNumber}-{subSeq}` or
 * `{projectNumber}-{parentSubSeq}-{childSeq}`. Matches hierarchical auto numbers (e.g. 2539-2-7),
 * not legacy zero-padded reference fields (e.g. 2539-007).
 */
export function buildTaskDisplayId(input: {
  referenceNumber?: string | null;
  stableWorkSeq?: number | null;
  parentTaskId?: string | null;
  parentStableWorkSeq?: number | null;
  projectNumber?: number | null;
}): string {
  const projectNum =
    input.projectNumber != null && Number.isFinite(input.projectNumber) && input.projectNumber > 0
      ? Math.round(input.projectNumber)
      : null;

  const subSeq =
    input.stableWorkSeq != null && Number.isFinite(input.stableWorkSeq) && input.stableWorkSeq > 0
      ? Math.round(input.stableWorkSeq)
      : null;

  const parentSeq =
    input.parentStableWorkSeq != null &&
    Number.isFinite(input.parentStableWorkSeq) &&
    input.parentStableWorkSeq > 0
      ? Math.round(input.parentStableWorkSeq)
      : null;

  if (projectNum != null) {
    if (input.parentTaskId) {
      const p = parentSeq ?? 1;
      const c = subSeq ?? 1;
      return `${projectNum}-${p}-${c}`;
    }
    if (subSeq != null) {
      return `${projectNum}-${subSeq}`;
    }
  }

  const ref = String(input.referenceNumber ?? '').trim();
  if (!ref) {
    return projectNum != null ? String(projectNum) : '';
  }

  // Reference already includes project prefix: 2539-2-7
  if (projectNum != null && ref.startsWith(`${projectNum}-`)) {
    const suffix = ref.slice(String(projectNum).length + 1);
    if (/^\d+(-\d+(\.\d+)?)?$/.test(suffix)) return ref;
  }

  // TASK IDS column suffix without project: 2-7 or 3-2.1 → 2539-2-7 / 2539-3-2.1
  if (projectNum != null && /^\d+-\d+(\.\d+)?$/.test(ref)) {
    return `${projectNum}-${ref}`;
  }
  if (projectNum != null && /^\d+$/.test(ref) && subSeq != null) {
    return `${projectNum}-${subSeq}`;
  }

  return projectNum != null ? String(projectNum) : ref;
}

export function priorityLabel(priority: TaskPriority): string {
  return priority.toLowerCase().replace(/_/g, ' ');
}

export type ScheduleStatus = 'on_track' | 'at_risk' | 'delayed';

export function deriveScheduleStatus(onTimePercent: number): ScheduleStatus {
  if (onTimePercent >= 80) return 'on_track';
  if (onTimePercent >= 50) return 'at_risk';
  return 'delayed';
}

export function buildAnalysisReasons(input: {
  openTasks: number;
  utilizationPercent: number;
  workerStatus: WorkerStatusLabel;
  fullFocusTasks: number;
  highPriorityTasks: number;
  delayedTasks: number;
  activeSubtasks: number;
}): string[] {
  const reasons: string[] = [];
  if (input.workerStatus === 'Overloaded') {
    if (input.openTasks >= 30) {
      reasons.push(
        `Open tasks (${input.openTasks}) meet or exceed the overload threshold (30).`,
      );
    }
    if (input.utilizationPercent >= 95) {
      reasons.push(
        `Utilization at ${input.utilizationPercent}% meets or exceeds the overload threshold (95%).`,
      );
    }
  }
  if (input.fullFocusTasks >= 3) {
    reasons.push(`${input.fullFocusTasks} full-focus tasks require dedicated attention.`);
  }
  if (input.highPriorityTasks >= 2) {
    reasons.push(`${input.highPriorityTasks} high/urgent priority tasks increase pressure.`);
  }
  if (input.delayedTasks > 0) {
    reasons.push(`${input.delayedTasks} task(s) are past due, adding schedule risk.`);
  }
  if (input.activeSubtasks >= 4) {
    reasons.push(`${input.activeSubtasks} active subtasks spread focus across deliverables.`);
  }
  if (reasons.length === 0) {
    reasons.push('Workload is within normal operating range for this employee.');
  }
  return reasons;
}

/** Max stars shown for task-completion rating (10/10 done → 5 stars). */
export const COMPLETION_STAR_MAX = 5;

/** Completion rating: (completed ÷ total assigned) × 5, one decimal. */
export function computeCompletionStarRating(
  completedCount: number,
  totalCount: number,
): number {
  if (totalCount <= 0) return 0;
  const raw = (completedCount / totalCount) * COMPLETION_STAR_MAX;
  return Math.round(raw * 10) / 10;
}
