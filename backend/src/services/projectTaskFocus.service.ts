import { TaskStatus } from '@prisma/client';
import prisma from '../config/database';

const INACTIVE_TASK_STATUSES = new Set<TaskStatus>([
  TaskStatus.COMPLETED,
  TaskStatus.CANCELLED,
  TaskStatus.NOT_REQUIRED,
]);

function isTaskActiveForFocus(status: TaskStatus): boolean {
  return !INACTIVE_TASK_STATUSES.has(status);
}

const focusInclude = {
  selectedTask: {
    select: {
      id: true,
      title: true,
      status: true,
      parentTaskId: true,
      referenceNumber: true,
    },
  },
  project: {
    select: {
      id: true,
      name: true,
      referenceNumber: true,
      deletedAt: true,
    },
  },
} as const;

function shapeFocus(row: FocusRowWithRelations) {
  return {
    projectId: row.projectId,
    selectedTaskId: row.selectedTaskId,
    selectedAt: row.selectedAt,
    task: {
      id: row.selectedTask.id,
      title: row.selectedTask.title,
      status: row.selectedTask.status,
      parentTaskId: row.selectedTask.parentTaskId,
      referenceNumber: row.selectedTask.referenceNumber,
    },
    project: {
      id: row.project.id,
      name: row.project.name,
      referenceNumber: row.project.referenceNumber,
    },
  };
}

type FocusRowWithRelations = {
  id: string;
  projectId: string;
  selectedTaskId: string;
  selectedAt: Date;
  selectedTask: {
    id: string;
    title: string;
    status: TaskStatus;
    parentTaskId: string | null;
    referenceNumber: string | null;
  };
  project: {
    id: string;
    name: string;
    referenceNumber: string;
    deletedAt: Date | null;
  };
};

async function clearFocusIfInvalid(row: FocusRowWithRelations | null): Promise<FocusRowWithRelations | null> {
  if (!row) return null;
  if (row.project.deletedAt || !isTaskActiveForFocus(row.selectedTask.status)) {
    await prisma.userProjectTaskFocus.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }
  return row;
}

export async function listUserProjectTaskFocus(userId: string) {
  const rows = await prisma.userProjectTaskFocus.findMany({
    where: { userId },
    include: focusInclude,
    orderBy: { selectedAt: 'desc' },
  });

  const valid = [];
  for (const row of rows) {
    const kept = await clearFocusIfInvalid(row);
    if (kept) valid.push(shapeFocus(kept));
  }
  return valid;
}

export async function getUserProjectTaskFocus(userId: string, projectId: string) {
  const row = await prisma.userProjectTaskFocus.findUnique({
    where: { userId_projectId: { userId, projectId } },
    include: focusInclude,
  });
  const kept = await clearFocusIfInvalid(row);
  return kept ? shapeFocus(kept) : null;
}

export async function setUserProjectTaskFocus(userId: string, projectId: string, taskId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true },
  });
  if (!project) throw new Error('Project not found');

  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId },
    select: { id: true, status: true, title: true },
  });
  if (!task) throw new Error('Task not found in this project');
  if (!isTaskActiveForFocus(task.status)) {
    throw new Error('Cannot focus a completed or inactive task');
  }

  const row = await prisma.userProjectTaskFocus.upsert({
    where: { userId_projectId: { userId, projectId } },
    create: {
      userId,
      projectId,
      selectedTaskId: taskId,
      selectedAt: new Date(),
    },
    update: {
      selectedTaskId: taskId,
      selectedAt: new Date(),
    },
    include: focusInclude,
  });

  return shapeFocus(row);
}

export async function clearUserProjectTaskFocus(userId: string, projectId: string) {
  await prisma.userProjectTaskFocus.deleteMany({
    where: { userId, projectId },
  });
}

export async function clearUserProjectTaskFocusByTaskId(userId: string, taskId: string) {
  await prisma.userProjectTaskFocus.deleteMany({
    where: { userId, selectedTaskId: taskId },
  });
}
