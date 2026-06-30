/**
 * Hierarchical TASK IDs shown in Main Table (e.g. 2539-3, 2539-3-1, 2539-2.1).
 */
import {
  buildChildDisplayKey,
  buildSubtaskDisplayKey,
  formatDisplaySuffix,
  type DisplayKeyRow,
} from './task-display-key';

export function buildDisplayTaskId(
  projectNumber: number,
  subSeq?: number | null,
  childSeq?: number | null,
  suffix?: string | null,
): string {
  const p = projectNumber;
  const suf = formatDisplaySuffix(suffix);
  if (subSeq != null && childSeq != null) {
    const base = `${p}-${subSeq}${suf}`;
    return `${base}-${childSeq}`;
  }
  if (subSeq != null) return `${p}-${subSeq}${suf}`;
  return String(p);
}

export type TaskIdChainRow = DisplayKeyRow & {
  title: string;
};

export function resolveTaskDisplayId(
  task: TaskIdChainRow,
  taskById: Map<string, TaskIdChainRow>,
  projectNumber: number,
): string {
  if (!task.parentTaskId) {
    return buildSubtaskDisplayKey(projectNumber, task);
  }

  const parent = taskById.get(task.parentTaskId);
  if (!parent) {
    return buildSubtaskDisplayKey(projectNumber, task);
  }

  if (!parent.parentTaskId) {
    const parentKey = buildSubtaskDisplayKey(projectNumber, parent);
    return buildChildDisplayKey(parentKey, task.stableWorkSeq ?? null);
  }

  const subParent = taskById.get(parent.parentTaskId);
  if (subParent && !subParent.parentTaskId) {
    const parentKey = buildSubtaskDisplayKey(projectNumber, subParent);
    const midKey = buildChildDisplayKey(parentKey, parent.stableWorkSeq ?? null);
    return buildChildDisplayKey(midKey, task.stableWorkSeq ?? null);
  }

  return buildSubtaskDisplayKey(projectNumber, task);
}

/** e.g. "SURVEY REPORT" (2539-3) */
export function formatWorkItemRef(title: string | null | undefined, displayId: string | null): string {
  const name = String(title ?? '').trim() || 'Work item';
  if (displayId) return `"${name}" (${displayId})`;
  return `"${name}"`;
}
