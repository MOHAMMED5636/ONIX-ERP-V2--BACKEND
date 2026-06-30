import prisma from '../config/database';
import { ProjectStatus, TaskStatus } from '@prisma/client';
import { computeEmployeeWorkload } from './workload.service';
import {
  countActiveEmployeesForScope,
  resolveCompanyAccessScope,
} from './companyAccess.service';
import {
  ACTIVE_PROJECT_STATUSES,
  buildManagerProjectVisibilityOr,
  isManagerLikeRole,
} from '../utils/manager-project-visibility';

/**
 * Full company metrics (projects, clients, tenders, all users) — Super Admin only.
 */
export const isCompanyWideDashboardRole = (role?: string): boolean =>
  role === 'SUPER_ADMIN';

/** Total active employees on dashboard — Admin, Super Admin, and HR (scoped to assigned companies for Admin/HR). */
export const hasCompanyTeamMembersDashboard = (role?: string): boolean =>
  role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'HR';

/** Tasks the user created, is assigned to, or has a TaskAssignment row for (covers subtasks / child tasks). */
const taskInvolvementOr = (userId: string) =>
  [
    { createdBy: userId },
    { assignedEmployeeId: userId },
    { assignments: { some: { employeeId: userId } } },
  ] as const;

/**
 * Projects visible on a personal dashboard: created by user, assigned as member,
 * contains any task/subtask they created or are assigned to, and (for MANAGER only)
 * linked via contracts they manage.
 */
export const buildScopedProjectVisibilityOr = async (
  userId: string,
  userRole?: string
): Promise<Array<Record<string, unknown>>> => {
  if (isManagerLikeRole(userRole)) {
    // Match Main Table / project list: contract-assigned PM only (not createdBy / task rows).
    return buildManagerProjectVisibilityOr(userId);
  }

  const ors: Array<Record<string, unknown>> = [
    { createdBy: userId },
    { assignedEmployees: { some: { employeeId: userId } } },
    {
      tasks: {
        some: {
          OR: [...taskInvolvementOr(userId)],
        },
      },
    },
  ];

  return ors;
};

/**
 * WHERE clause for dashboard project lists (optional status filter from query string).
 */
export const buildDashboardProjectsWhere = async (
  userId: string,
  userRole: string | undefined,
  statusQuery?: string | null
): Promise<Record<string, unknown>> => {
  const parts: Record<string, unknown>[] = [];

  if (statusQuery && statusQuery !== 'all') {
    parts.push({ status: statusQuery });
  }

  if (!isCompanyWideDashboardRole(userRole)) {
    parts.push({ OR: await buildScopedProjectVisibilityOr(userId, userRole) });
  }

  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
};

/** Project IDs the user may see on dashboard widgets (calendar, tender deadlines, etc.). */
export const getScopedProjectIds = async (
  userId: string,
  userRole?: string
): Promise<string[]> => {
  if (isCompanyWideDashboardRole(userRole)) {
    const all = await prisma.project.findMany({ select: { id: true } });
    return all.map((p) => p.id);
  }
  const rows = await prisma.project.findMany({
    where: { OR: await buildScopedProjectVisibilityOr(userId, userRole) },
    select: { id: true },
  });
  return rows.map((r) => r.id);
};

/**
 * Dashboard Service
 * Handles all dashboard-related business logic
 * Calculates counts dynamically from database (no caching)
 */

export interface DashboardStats {
  activeProjects: number;
  /** Projects with status IN_PROGRESS (matches Main Table "In Progress" column). */
  inProgressProjects: number;
  activeTasks: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  teamMembers: number;
  inProgressTenders: number;
  totalClients: number;
  totalTenders: number;
  pendingInvitations: number;
  /** Present when userId is set — gamification / workload snapshot for the logged-in user */
  gamification?: {
    totalXp: number;
    starCount: number;
    workloadScore: number;
    utilizationPercent?: number;
    completedUtilizationPercent?: number;
    /** Active open tasks right now. */
    employeeCapacity?: number;
    /** Points cap from workload settings. */
    pointsCapacity?: number;
    pendingLoad?: number;
    workerStatus?: string;
    statusColor: string;
    activeTasksCount: number;
    activeProjectsCount?: number;
    performance?: unknown;
  };
}

export interface DashboardSummary {
  activeProjects: number;
  inProgressProjects: number;
  activeTasks: number;
  teamMembers: number;
  inProgressTenders: number;
  totalClients: number;
  totalTenders: number;
  pendingInvitations: number;
}

/**
 * Get dashboard statistics
 * Counts are calculated in real-time from database
 * Active Projects = Projects with status OPEN or IN_PROGRESS
 */
export const getDashboardStats = async (userId?: string, userRole?: string): Promise<DashboardStats> => {
  try {
    let activeProjects: number;
    let inProgressProjects: number;
    let activeTasks: number;
    let completedTasks: number;
    let pendingTasks: number;
    let inProgressTasks: number;
    let teamMembers: number;
    let inProgressTenders: number;
    let totalClients: number;
    let totalTenders: number;
    let pendingInvitations: number;

    if (userId && isCompanyWideDashboardRole(userRole)) {
      // Admin / super admin: company-wide counts
      activeProjects = await prisma.project.count({
        where: {
          deletedAt: null,
          status: { in: [...ACTIVE_PROJECT_STATUSES] },
        }
      });

      inProgressProjects = await prisma.project.count({
        where: { deletedAt: null, status: ProjectStatus.IN_PROGRESS },
      });

      const existingProjects = await prisma.project.findMany({ select: { id: true } });
      const projectIds = existingProjects.map(p => p.id);
      const taskWhere = projectIds.length > 0 ? { projectId: { in: projectIds } } : { projectId: { in: [] } };

      activeTasks = await prisma.task.count({
        where: {
          ...taskWhere,
          status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] }
        }
      });

      [completedTasks, pendingTasks, inProgressTasks] = await Promise.all([
        prisma.task.count({ where: { ...taskWhere, status: TaskStatus.COMPLETED } }),
        prisma.task.count({ where: { ...taskWhere, status: TaskStatus.PENDING } }),
        prisma.task.count({ where: { ...taskWhere, status: TaskStatus.IN_PROGRESS } })
      ]);

      teamMembers = await prisma.user.count({ where: { isActive: true } });
      inProgressTenders = await prisma.tender.count({ where: { status: 'OPEN' } });
      totalClients = await prisma.client.count();
      totalTenders = await prisma.tender.count();

      pendingInvitations = 0;
    } else if (userId) {
      // Everyone else: only projects/tasks/subtasks they own, created, or are assigned to (no company-wide rollups)
      const projectOr = await buildScopedProjectVisibilityOr(userId, userRole);

      activeProjects = await prisma.project.count({
        where: {
          deletedAt: null,
          status: { in: [...ACTIVE_PROJECT_STATUSES] },
          OR: projectOr,
        },
      });

      inProgressProjects = await prisma.project.count({
        where: {
          deletedAt: null,
          status: ProjectStatus.IN_PROGRESS,
          OR: projectOr,
        },
      });

      const taskInvolvement = { OR: [...taskInvolvementOr(userId)] };

      const taskCounts = await Promise.all([
        prisma.task.count({
          where: {
            ...taskInvolvement,
            status: TaskStatus.COMPLETED,
          },
        }),
        prisma.task.count({
          where: {
            ...taskInvolvement,
            status: TaskStatus.PENDING,
          },
        }),
        prisma.task.count({
          where: {
            ...taskInvolvement,
            status: TaskStatus.IN_PROGRESS,
          },
        }),
      ]);
      completedTasks = taskCounts[0];
      pendingTasks = taskCounts[1];
      inProgressTasks = taskCounts[2];
      activeTasks = pendingTasks + inProgressTasks;

      teamMembers =
        userRole === 'MANAGER'
          ? await prisma.user.count({ where: { managerId: userId, isActive: true } })
          : hasCompanyTeamMembersDashboard(userRole)
            ? await countActiveEmployeesForScope(await resolveCompanyAccessScope(userId, userRole))
            : 0;

      inProgressTenders = 0;
      totalClients = 0;
      totalTenders = 0;

      pendingInvitations = 0;
      if (userRole === 'TENDER_ENGINEER') {
        pendingInvitations = await prisma.tenderInvitation.count({
          where: { engineerId: userId, status: 'PENDING' },
        });
      }
    } else {
      activeProjects = 0;
      inProgressProjects = 0;
      activeTasks = 0;
      completedTasks = 0;
      pendingTasks = 0;
      inProgressTasks = 0;
      teamMembers = 0;
      inProgressTenders = 0;
      totalClients = 0;
      totalTenders = 0;
      pendingInvitations = 0;
    }

    const base = {
      activeProjects,
      inProgressProjects,
      activeTasks,
      completedTasks,
      pendingTasks,
      inProgressTasks,
      teamMembers,
      inProgressTenders,
      totalClients,
      totalTenders,
      pendingInvitations,
    };

    if (!userId) return base;

    const [userRow, workload] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { totalXp: true, starCount: true },
      }),
      computeEmployeeWorkload(userId),
    ]);

    return {
      ...base,
      gamification: {
        totalXp: userRow?.totalXp ?? 0,
        starCount: userRow?.starCount ?? 0,
        workloadScore: workload?.workloadScore ?? 0,
        utilizationPercent: workload?.utilizationPercent ?? 0,
        completedUtilizationPercent: workload?.completedUtilizationPercent ?? 0,
        employeeCapacity: workload?.employeeCapacity ?? 0,
        pointsCapacity: workload?.pointsCapacity ?? 10,
        pendingLoad: workload?.pendingLoad ?? 0,
        workerStatus: workload?.workerStatus ?? 'Undefined',
        statusColor: workload?.statusColor ?? 'blue',
        activeTasksCount: workload?.activeTasksCount ?? 0,
        activeProjectsCount: workload?.activeProjectsCount ?? 0,
        performance: workload?.performance ?? null,
      },
    };
  } catch (error) {
    console.error('Dashboard service error:', error);
    // Return default values on error
    return {
      activeProjects: 0,
      inProgressProjects: 0,
      activeTasks: 0,
      completedTasks: 0,
      pendingTasks: 0,
      inProgressTasks: 0,
      teamMembers: 0,
      inProgressTenders: 0,
      totalClients: 0,
      totalTenders: 0,
      pendingInvitations: 0
    };
  }
};

/**
 * Get dashboard summary (simplified stats)
 */
export const getDashboardSummary = async (userId?: string, userRole?: string): Promise<DashboardSummary> => {
  try {
    const stats = await getDashboardStats(userId, userRole);
    
    return {
      activeProjects: stats.activeProjects,
      inProgressProjects: stats.inProgressProjects,
      activeTasks: stats.activeTasks,
      teamMembers: stats.teamMembers,
      inProgressTenders: stats.inProgressTenders,
      totalClients: stats.totalClients,
      totalTenders: stats.totalTenders,
      pendingInvitations: stats.pendingInvitations
    };
  } catch (error) {
    console.error('Dashboard summary service error:', error);
    return {
      activeProjects: 0,
      inProgressProjects: 0,
      activeTasks: 0,
      teamMembers: 0,
      inProgressTenders: 0,
      totalClients: 0,
      totalTenders: 0,
      pendingInvitations: 0
    };
  }
};

/**
 * Get recent projects for dashboard
 * For EMPLOYEE role, returns only projects assigned to the user
 */
export const getRecentProjects = async (limit: number = 5, userId?: string, userRole?: string) => {
  try {
    let where: Record<string, unknown> = {};

    if (userId && !isCompanyWideDashboardRole(userRole)) {
      where = { OR: await buildScopedProjectVisibilityOr(userId, userRole) };
    }

    const projects = await prisma.project.findMany({
      where,
      take: limit,
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        id: true,
        name: true,
        referenceNumber: true,
        pin: true,
        status: true,
        projectManager: true, // Include projectManager field
        createdAt: true,
        client: {
          select: {
            name: true,
            email: true
          }
        },
        _count: {
          select: {
            tasks: true,
            documents: true,
            tenders: true
          }
        }
      }
    });

    return projects.map(project => ({
      id: project.id,
      name: project.name,
      referenceNumber: project.referenceNumber,
      pin: project.pin,
      status: project.status,
      clientName: project.client?.name || 'N/A',
      projectManager: project.projectManager || 'N/A', // Plain text string
      taskCount: project._count.tasks,
      documentCount: project._count.documents,
      tenderCount: project._count.tenders,
      createdAt: project.createdAt
    }));
  } catch (error) {
    console.error('Get recent projects error:', error);
    return [];
  }
};


