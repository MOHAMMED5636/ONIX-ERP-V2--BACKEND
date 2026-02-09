import prisma from '../config/database';
import { ProjectStatus, TaskStatus } from '@prisma/client';

/**
 * Dashboard Service
 * Handles all dashboard-related business logic
 * Calculates counts dynamically from database (no caching)
 */

export interface DashboardStats {
  activeProjects: number;
  activeTasks: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  teamMembers: number;
  inProgressTenders: number;
  totalClients: number;
  totalTenders: number;
  pendingInvitations: number;
}

export interface DashboardSummary {
  activeProjects: number;
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
    const isEmployee = userRole === 'EMPLOYEE' && userId;

    let activeProjects: number;
    let activeTasks: number;
    let completedTasks: number;
    let pendingTasks: number;
    let inProgressTasks: number;
    let teamMembers: number;
    let inProgressTenders: number;
    let totalClients: number;
    let totalTenders: number;
    let pendingInvitations: number;

    if (isEmployee) {
      // Employee: only counts for assigned projects and tasks
      activeProjects = await prisma.projectAssignment.count({
        where: {
          employeeId: userId,
          project: {
            status: { in: [ProjectStatus.OPEN, ProjectStatus.IN_PROGRESS] }
          }
        }
      });

      const taskCounts = await Promise.all([
        prisma.taskAssignment.count({
          where: {
            employeeId: userId,
            task: { status: TaskStatus.COMPLETED }
          }
        }),
        prisma.taskAssignment.count({
          where: {
            employeeId: userId,
            task: { status: TaskStatus.PENDING }
          }
        }),
        prisma.taskAssignment.count({
          where: {
            employeeId: userId,
            task: { status: TaskStatus.IN_PROGRESS }
          }
        })
      ]);
      completedTasks = taskCounts[0];
      pendingTasks = taskCounts[1];
      inProgressTasks = taskCounts[2];
      activeTasks = pendingTasks + inProgressTasks;

      teamMembers = 0;
      inProgressTenders = 0;
      totalClients = 0;
      totalTenders = 0;
      pendingInvitations = 0;
    } else {
      // Admin / other roles: company-wide counts
      activeProjects = await prisma.project.count({
        where: {
          status: { in: [ProjectStatus.OPEN, ProjectStatus.IN_PROGRESS] }
        }
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
      if (userRole === 'TENDER_ENGINEER' && userId) {
        pendingInvitations = await prisma.tenderInvitation.count({
          where: { engineerId: userId, status: 'PENDING' }
        });
      }
    }

    return {
      activeProjects,
      activeTasks,
      completedTasks,
      pendingTasks,
      inProgressTasks,
      teamMembers,
      inProgressTenders,
      totalClients,
      totalTenders,
      pendingInvitations
    };
  } catch (error) {
    console.error('Dashboard service error:', error);
    // Return default values on error
    return {
      activeProjects: 0,
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
    const isEmployee = userRole === 'EMPLOYEE' && userId;
    const where = isEmployee
      ? { assignedEmployees: { some: { employeeId: userId } } }
      : {};

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


