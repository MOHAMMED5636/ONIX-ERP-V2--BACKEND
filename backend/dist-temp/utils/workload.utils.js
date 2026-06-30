"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPLETION_STAR_MAX = exports.ACTIVE_WORKLOAD_STATUSES = exports.WORKLOAD_VISIBLE_TASK_STATUSES = exports.WORKLOAD_POINT_STATUSES = exports.XP_PER_STAR = exports.XP_MULTIPLIER_MONITORING = exports.XP_MULTIPLIER_FULL_FOCUS = exports.DEFAULT_WORKLOAD_SETTINGS = void 0;
exports.formatWorkloadCalendarDate = formatWorkloadCalendarDate;
exports.resolveMonitoringCoefficient = resolveMonitoringCoefficient;
exports.deriveTaskCompletionScheduleVariant = deriveTaskCompletionScheduleVariant;
exports.scheduleStatusBonus = scheduleStatusBonus;
exports.scheduleStatusLabel = scheduleStatusLabel;
exports.clampTaskWeight = clampTaskWeight;
exports.parseTaskEffortType = parseTaskEffortType;
exports.parseTaskWeightInput = parseTaskWeightInput;
exports.priorityFactor = priorityFactor;
exports.parseFloorsFactor = parseFloorsFactor;
exports.taskAnalyticsContributionScore = taskAnalyticsContributionScore;
exports.taskContributionScore = taskContributionScore;
exports.computeUtilizationPercent = computeUtilizationPercent;
exports.getWorkerStatus = getWorkerStatus;
exports.workerStatusToColor = workerStatusToColor;
exports.workerStatusColor = workerStatusColor;
exports.workloadStatusFromUtilization = workloadStatusFromUtilization;
exports.workloadStatusColor = workloadStatusColor;
exports.effortTypeLabel = effortTypeLabel;
exports.buildTaskDisplayId = buildTaskDisplayId;
exports.priorityLabel = priorityLabel;
exports.deriveScheduleStatus = deriveScheduleStatus;
exports.buildAnalysisReasons = buildAnalysisReasons;
exports.computeCompletionStarRating = computeCompletionStarRating;
const client_1 = require("@prisma/client");
exports.DEFAULT_WORKLOAD_SETTINGS = {
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
};
exports.XP_MULTIPLIER_FULL_FOCUS = 10;
exports.XP_MULTIPLIER_MONITORING = 2;
exports.XP_PER_STAR = 100;
/** Serialize a stored due/completion date as YYYY-MM-DD without local timezone drift. */
function formatWorkloadCalendarDate(d) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
/** Only Done / Completed tasks add to the employee workload point total. */
exports.WORKLOAD_POINT_STATUSES = ['COMPLETED'];
/** In-progress assignments shown in the matrix (reassign, visibility) — no points until Done. */
exports.WORKLOAD_VISIBLE_TASK_STATUSES = [
    'PENDING',
    'IN_PROGRESS',
    'SUBMITTED_IN_PROGRESS',
    'COMPLETED',
];
/** @deprecated use WORKLOAD_VISIBLE_TASK_STATUSES for queries; points use WORKLOAD_POINT_STATUSES */
exports.ACTIVE_WORKLOAD_STATUSES = exports.WORKLOAD_VISIBLE_TASK_STATUSES;
/** Monitoring effort factor — 0 stored in DB is treated as unset (defaults to 0.3). */
function resolveMonitoringCoefficient(value) {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n) && n > 0)
        return n;
    return exports.DEFAULT_WORKLOAD_SETTINGS.monitoringCoefficient;
}
function startOfCalendarDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function calendarDaysBetweenDates(start, end) {
    const a = startOfCalendarDay(start);
    const b = startOfCalendarDay(end);
    return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}
function isCompletedTaskStatus(status) {
    const s = String(status ?? '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_');
    return s === 'COMPLETED' || s === 'DONE';
}
/** Planned deadline vs actual completion (calendar dates), matching project brief logic. */
function deriveTaskCompletionScheduleVariant(plannedDeadline, actualCompletion) {
    if (!plannedDeadline || !actualCompletion)
        return null;
    const daysFromActualToDeadline = calendarDaysBetweenDates(actualCompletion, plannedDeadline);
    if (daysFromActualToDeadline > 0)
        return 'ahead';
    if (daysFromActualToDeadline === 0)
        return 'on';
    return 'delayed';
}
/** Schedule bonus added after base load: ahead +3, on time +2, late +1. */
function scheduleStatusBonus(variant) {
    if (variant === 'ahead')
        return 3;
    if (variant === 'on')
        return 2;
    if (variant === 'delayed')
        return 1;
    return 0;
}
function scheduleStatusLabel(variant) {
    if (variant === 'ahead')
        return 'Ahead of Schedule';
    if (variant === 'on')
        return 'On Schedule';
    if (variant === 'delayed')
        return 'Delayed';
    return null;
}
function clampTaskWeight(n) {
    if (!Number.isFinite(n))
        return 3;
    return Math.min(5, Math.max(1, Math.round(n)));
}
function parseTaskEffortType(v) {
    const s = String(v ?? '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_');
    if (s === 'FULL_FOCUS' || s === 'FULLFOCUS')
        return client_1.TaskEffortType.FULL_FOCUS;
    if (s === 'MONITORING' || s === 'MONITORING_FOLLOW_UP' || s === 'FOLLOW_UP') {
        return client_1.TaskEffortType.MONITORING;
    }
    if (s === 'FULL-FOCUS')
        return client_1.TaskEffortType.FULL_FOCUS;
    return null;
}
function parseTaskWeightInput(v) {
    if (v == null || v === '')
        return null;
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    if (!Number.isFinite(n) || n < 1 || n > 5)
        return null;
    return n;
}
/** Priority factor: High = 3, Medium = 2, Low = 1, Urgent = 3.5 */
function priorityFactor(priority) {
    switch (priority) {
        case client_1.TaskPriority.HIGH:
            return 3;
        case client_1.TaskPriority.URGENT:
            return 3.5;
        case client_1.TaskPriority.LOW:
            return 1;
        default:
            return 2;
    }
}
/** Parse floor count from projectFloor text (e.g. "G+5" → 6, "3" → 3). Minimum 1. */
function parseFloorsFactor(projectFloor) {
    if (!projectFloor?.trim())
        return 1;
    const s = projectFloor.trim();
    const nums = s.match(/\d+/g);
    if (!nums?.length)
        return 1;
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
function taskAnalyticsContributionScore(task, settings) {
    const weight = clampTaskWeight(task.taskWeight);
    const effortFactor = task.effortType === client_1.TaskEffortType.MONITORING
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
function taskContributionScore(weight, effortType, monitoringCoefficient) {
    return taskAnalyticsContributionScore({
        taskWeight: weight,
        effortType,
        priority: client_1.TaskPriority.MEDIUM,
        projectFloor: null,
        planDays: exports.DEFAULT_WORKLOAD_SETTINGS.defaultPlannedDays,
        parentTaskId: null,
    }, {
        monitoringCoefficient,
        subtaskCoefficient: exports.DEFAULT_WORKLOAD_SETTINGS.subtaskCoefficient,
        defaultPlannedDays: exports.DEFAULT_WORKLOAD_SETTINGS.defaultPlannedDays,
    });
}
function computeUtilizationPercent(workloadScore, employeeCapacity) {
    if (!employeeCapacity || employeeCapacity <= 0)
        return 0;
    return Math.round((workloadScore / employeeCapacity) * 1000) / 10;
}
/** Classify worker load using open-task count and pending utilization % only. */
function getWorkerStatus(openTasks, utilization) {
    const tasks = Math.max(0, Math.round(Number(openTasks) || 0));
    const util = Number(utilization) || 0;
    if (tasks >= 30 || util >= 95)
        return 'Overloaded';
    if ((tasks >= 15 && tasks <= 45) ||
        (util >= 15 && util <= 45)) {
        return 'Balanced';
    }
    if ((tasks >= 7 && tasks <= 20) ||
        (util >= 7 && util <= 20)) {
        return 'Moderate';
    }
    if ((tasks >= 3 && tasks <= 10) ||
        (util >= 3 && util <= 10)) {
        return 'Available';
    }
    return 'Undefined';
}
function workerStatusToColor(status) {
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
function workerStatusColor(openTasks, utilizationPercent) {
    return workerStatusToColor(getWorkerStatus(openTasks, utilizationPercent));
}
/** @deprecated Use workerStatusColor(openTasks, utilizationPercent) */
function workloadStatusFromUtilization(utilizationPercent, settings) {
    if (utilizationPercent >= 95)
        return 'red';
    if (utilizationPercent >= 15 && utilizationPercent <= 45)
        return 'green';
    if (utilizationPercent >= 7 && utilizationPercent <= 20)
        return 'yellow';
    if (utilizationPercent >= 3 && utilizationPercent <= 10)
        return 'blue';
    return workerStatusToColor(getWorkerStatus(0, utilizationPercent));
}
/** @deprecated Use workerStatusColor */
function workloadStatusColor(score, settings) {
    if (settings.employeeCapacity && settings.employeeCapacity > 0) {
        const utilization = computeUtilizationPercent(score, settings.employeeCapacity);
        return workloadStatusFromUtilization(utilization, {
            overloadUtilizationPercent: settings.overloadUtilizationPercent ?? exports.DEFAULT_WORKLOAD_SETTINGS.overloadUtilizationPercent,
            balancedUtilizationMin: settings.balancedUtilizationMin ?? exports.DEFAULT_WORKLOAD_SETTINGS.balancedUtilizationMin,
            availableUtilizationMax: settings.availableUtilizationMax ?? exports.DEFAULT_WORKLOAD_SETTINGS.availableUtilizationMax,
        });
    }
    if (score > settings.overloadThreshold)
        return 'red';
    if (score >= settings.balancedMin)
        return 'green';
    if (score <= settings.availableMax)
        return 'blue';
    return 'yellow';
}
function effortTypeLabel(effortType) {
    return effortType === client_1.TaskEffortType.MONITORING ? 'monitoring' : 'full-focus';
}
/**
 * Task ID for workload / Main Table TASK IDS column: `{projectNumber}-{subSeq}` or
 * `{projectNumber}-{parentSubSeq}-{childSeq}`. Matches hierarchical auto numbers (e.g. 2539-2-7),
 * not legacy zero-padded reference fields (e.g. 2539-007).
 */
function buildTaskDisplayId(input) {
    const projectNum = input.projectNumber != null && Number.isFinite(input.projectNumber) && input.projectNumber > 0
        ? Math.round(input.projectNumber)
        : null;
    const subSeq = input.stableWorkSeq != null && Number.isFinite(input.stableWorkSeq) && input.stableWorkSeq > 0
        ? Math.round(input.stableWorkSeq)
        : null;
    const parentSeq = input.parentStableWorkSeq != null &&
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
        if (/^\d+(-\d+(\.\d+)?)?$/.test(suffix))
            return ref;
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
function priorityLabel(priority) {
    return priority.toLowerCase().replace(/_/g, ' ');
}
function deriveScheduleStatus(onTimePercent) {
    if (onTimePercent >= 80)
        return 'on_track';
    if (onTimePercent >= 50)
        return 'at_risk';
    return 'delayed';
}
function buildAnalysisReasons(input) {
    const reasons = [];
    if (input.workerStatus === 'Overloaded') {
        if (input.openTasks >= 30) {
            reasons.push(`Open tasks (${input.openTasks}) meet or exceed the overload threshold (30).`);
        }
        if (input.utilizationPercent >= 95) {
            reasons.push(`Utilization at ${input.utilizationPercent}% meets or exceeds the overload threshold (95%).`);
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
exports.COMPLETION_STAR_MAX = 5;
/** Completion rating: (completed ÷ total assigned) × 5, one decimal. */
function computeCompletionStarRating(completedCount, totalCount) {
    if (totalCount <= 0)
        return 0;
    const raw = (completedCount / totalCount) * exports.COMPLETION_STAR_MAX;
    return Math.round(raw * 10) / 10;
}
//# sourceMappingURL=workload.utils.js.map