import prisma from '../config/database';
import { TaskEffortType, TaskStatus } from '@prisma/client';
import { emitErpNotification } from './erpNotification.service';
import {
  clampTaskWeight,
  XP_MULTIPLIER_FULL_FOCUS,
  XP_MULTIPLIER_MONITORING,
  XP_PER_STAR,
} from '../utils/workload.utils';

export function xpForCompletedTask(effortType: TaskEffortType, taskWeight: number): number {
  const w = clampTaskWeight(taskWeight);
  const mult =
    effortType === TaskEffortType.MONITORING ? XP_MULTIPLIER_MONITORING : XP_MULTIPLIER_FULL_FOCUS;
  return w * mult;
}

export type GamificationAwardResult = {
  userId: string;
  xpEarned: number;
  totalXp: number;
  starCount: number;
  newStarsEarned: number;
};

/**
 * Award XP when a task transitions to COMPLETED. Idempotent per task via completedAt check at caller.
 */
export async function awardXpForTaskCompletion(
  taskId: string,
  assigneeUserId: string,
): Promise<GamificationAwardResult | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, effortType: true, taskWeight: true },
  });
  if (!task) return null;

  const xpEarned = xpForCompletedTask(task.effortType, task.taskWeight);
  if (xpEarned <= 0) return null;

  const user = await prisma.user.findUnique({
    where: { id: assigneeUserId },
    select: { id: true, firstName: true, totalXp: true, starCount: true },
  });
  if (!user) return null;

  const prevStars = user.starCount;
  const totalXp = user.totalXp + xpEarned;
  const starCount = Math.floor(totalXp / XP_PER_STAR);
  const newStarsEarned = Math.max(0, starCount - prevStars);

  await prisma.user.update({
    where: { id: assigneeUserId },
    data: { totalXp, starCount },
  });

  const starMsg =
    newStarsEarned > 0
      ? ` You earned ${newStarsEarned} new star${newStarsEarned > 1 ? 's' : ''}! ⭐`
      : '';

  emitErpNotification(assigneeUserId, {
    id: `task-xp-${taskId}-${Date.now()}`,
    type: 'TASK_XP_AWARD',
    title: 'Task completed — XP earned',
    message: `+${xpEarned} XP for "${task.title}".${starMsg}`,
    createdAt: new Date().toISOString(),
  });

  return {
    userId: assigneeUserId,
    xpEarned,
    totalXp,
    starCount,
    newStarsEarned,
  };
}

/** Award XP when a task newly transitions to COMPLETED (project sync or task API). */
export async function maybeAwardXpForStatusTransition(
  taskId: string,
  previousStatus: TaskStatus | null | undefined,
  newStatus: TaskStatus | null | undefined,
  assigneeUserId: string | null | undefined,
): Promise<GamificationAwardResult | null> {
  if (newStatus !== TaskStatus.COMPLETED || previousStatus === TaskStatus.COMPLETED) {
    return null;
  }
  if (!assigneeUserId) return null;
  return awardXpForTaskCompletion(taskId, assigneeUserId);
}
