import prisma from '../config/database';

export const PROJECT_SUSPENDED_MESSAGE =
  'Project Suspended by Manager. This project is locked until it is reactivated.';

type SuspensionUser = {
  id?: string | null;
  role?: string | null;
};

type ProjectLockContext = {
  projectStatus?: string | null;
  projectCreatedById?: string | null;
  user?: SuspensionUser | null;
};

export function isProjectSuspendedStatus(projectStatus: string | null | undefined): boolean {
  if (projectStatus == null || String(projectStatus).trim() === '') return false;
  return String(projectStatus).trim().toUpperCase() === 'ON_HOLD';
}

export function userCanBypassProjectSuspension(
  _user: SuspensionUser | null | undefined,
  _projectCreatedById?: string | null,
): boolean {
  return false;
}

export function userCanReactivateSuspendedProject(
  user: SuspensionUser | null | undefined,
): boolean {
  if (!user) return false;
  const role = String(user.role ?? '').trim().toUpperCase();
  return ['ADMIN', 'SUPER_ADMIN', 'PROJECT_MANAGER'].includes(role);
}

export function isProjectWriteLockedForUser(ctx: ProjectLockContext): boolean {
  return (
    isProjectSuspendedStatus(ctx.projectStatus) &&
    !userCanBypassProjectSuspension(ctx.user, ctx.projectCreatedById)
  );
}

export function buildProjectSuspendedError(): Error & {
  statusCode: number;
  code: string;
} {
  const error = new Error(PROJECT_SUSPENDED_MESSAGE) as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = 423;
  error.code = 'PROJECT_SUSPENDED';
  return error;
}

export function throwIfProjectWriteLocked(ctx: ProjectLockContext): void {
  if (isProjectWriteLockedForUser(ctx)) {
    throw buildProjectSuspendedError();
  }
}

export async function ensureProjectWriteAllowed(
  projectId: string | null | undefined,
  user: SuspensionUser | null | undefined,
  db: any = prisma,
): Promise<{ id: string; status: string | null; createdBy: string | null } | null> {
  if (!projectId) return null;
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, status: true, createdBy: true },
  });
  if (project) {
    throwIfProjectWriteLocked({
      projectStatus: project.status,
      projectCreatedById: project.createdBy,
      user,
    });
  }
  return project;
}

export async function ensureTaskProjectWriteAllowed(
  taskId: string | null | undefined,
  user: SuspensionUser | null | undefined,
  db: any = prisma,
): Promise<{ id: string; status: string | null; createdBy: string | null } | null> {
  if (!taskId) return null;
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      project: {
        select: {
          id: true,
          status: true,
          createdBy: true,
        },
      },
    },
  });
  const project = task?.project ?? null;
  if (project) {
    throwIfProjectWriteLocked({
      projectStatus: project.status,
      projectCreatedById: project.createdBy,
      user,
    });
  }
  return project;
}
