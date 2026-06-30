import { TaskEffortType } from '@prisma/client';
import { clampTaskWeight, parseTaskEffortType, parseTaskWeightInput } from './workload.utils';

/** PM task rating 0–5 (0 = not rated). */
export function parseTaskRating(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(5, Math.max(0, Math.round(n)));
}

/** Copy rating from a subtask payload into Prisma task data when present. */
export function applyRatingFromPayload(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  if (source.rating === undefined) return;
  target.rating = parseTaskRating(source.rating);
}

/** Copy effortType / taskWeight from a subtask payload into Prisma task data when present. */
export function applyEffortFieldsFromPayload(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  if (source.effortType === undefined && source.taskWeight === undefined) return;

  if (source.effortType !== undefined) {
    const parsedType = parseTaskEffortType(source.effortType);
    target.effortType = parsedType ?? TaskEffortType.FULL_FOCUS;
  }

  if (source.taskWeight !== undefined) {
    const parsedWeight = parseTaskWeightInput(source.taskWeight);
    target.taskWeight =
      parsedWeight != null ? clampTaskWeight(parsedWeight) : clampTaskWeight(3);
  }
}
