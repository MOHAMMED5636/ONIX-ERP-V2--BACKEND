import prisma from '../config/database';
import { executeProjectDeletionInTransaction } from './projectDeletionApproval.service';
import {
  deletionRecoveryCutoffDate,
  isWithinDeletionRecoveryWindow,
} from '../utils/deletion-recovery';

export async function purgeExpiredSoftDeletions(): Promise<{
  projectsPurged: number;
  tasksPurged: number;
}> {
  const cutoff = deletionRecoveryCutoffDate();

  const expiredProjects = await prisma.project.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true },
  });
  const expiredTasks = await prisma.task.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, projectId: true },
  });

  if (expiredTasks.length > 0) {
    await prisma.task.deleteMany({
      where: { id: { in: expiredTasks.map((t) => t.id) } },
    });
  }

  if (expiredProjects.length > 0) {
    for (const p of expiredProjects) {
      await executeProjectDeletionInTransaction(p.id);
    }
  }

  return {
    projectsPurged: expiredProjects.length,
    tasksPurged: expiredTasks.length,
  };
}

export async function softDeleteProject(projectId: string): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: now },
    }),
    prisma.task.updateMany({
      where: { projectId },
      data: { deletedAt: now },
    }),
    prisma.contract.updateMany({
      where: { projectId },
      data: { projectId: null },
    }),
  ]);
}

export async function softDeleteTasks(taskIds: string[]): Promise<void> {
  if (!taskIds.length) return;
  const now = new Date();
  await prisma.task.updateMany({
    where: { id: { in: taskIds } },
    data: { deletedAt: now },
  });
}

export async function restoreProject(projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, deletedAt: true },
  });
  if (!project?.deletedAt || !isWithinDeletionRecoveryWindow(project.deletedAt)) {
    return false;
  }
  await prisma.$transaction([
    prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: null },
    }),
    prisma.task.updateMany({
      where: { projectId },
      data: { deletedAt: null },
    }),
  ]);
  return true;
}

export async function restoreTask(taskId: string): Promise<boolean> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, deletedAt: true, projectId: true },
  });
  if (!task?.deletedAt || !isWithinDeletionRecoveryWindow(task.deletedAt)) {
    return false;
  }
  const project = await prisma.project.findUnique({
    where: { id: task.projectId },
    select: { deletedAt: true },
  });
  if (project?.deletedAt) {
    return false;
  }
  await prisma.task.update({
    where: { id: taskId },
    data: { deletedAt: null },
  });
  return true;
}

/** Hard-delete a project that is already in trash (skips recovery window). */
export async function permanentlyDeleteProjectFromTrash(projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, deletedAt: true },
  });
  if (!project?.deletedAt) return false;
  await executeProjectDeletionInTransaction(projectId);
  return true;
}

/** Hard-delete soft-deleted tasks/subtasks (cannot be restored after this). */
export async function permanentlyDeleteTasksFromTrash(taskIds: string[]): Promise<number> {
  const ids = [...new Set(taskIds.map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length) return 0;

  let purged = 0;
  for (const taskId of ids) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, deletedAt: true },
    });
    if (!task?.deletedAt) continue;

    await prisma.task.updateMany({
      where: { predecessorId: taskId },
      data: { predecessorId: null },
    });

    await prisma.task.delete({ where: { id: taskId } });
    purged += 1;
  }
  return purged;
}

export async function listRecoverableDeletions() {
  const cutoff = deletionRecoveryCutoffDate();
  const [projects, tasks] = await Promise.all([
    prisma.project.findMany({
      where: { deletedAt: { gte: cutoff } },
      orderBy: { deletedAt: 'desc' },
      select: {
        id: true,
        name: true,
        referenceNumber: true,
        projectNumber: true,
        deletedAt: true,
      },
    }),
    prisma.task.findMany({
      where: {
        deletedAt: { gte: cutoff },
        project: { deletedAt: null },
      },
      orderBy: { deletedAt: 'desc' },
      select: {
        id: true,
        title: true,
        projectId: true,
        parentTaskId: true,
        deletedAt: true,
        project: { select: { name: true, referenceNumber: true } },
      },
    }),
  ]);
  return { projects, tasks };
}
