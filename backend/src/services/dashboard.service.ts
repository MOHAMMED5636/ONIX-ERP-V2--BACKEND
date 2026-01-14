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
    // Count Active Projects (OPEN or IN_PROGRESS status)
    // Using Prisma enum values for type safety
    // IMPORTANT: This query counts ONLY from the projects table - no caching, no fallbacks
    const activeProjects = await prisma.project.count({
      where: {
        status: {
          in: [ProjectStatus.OPEN, ProjectStatus.IN_PROGRESS]
        }
      }
    });

    // Log for debugging - helps identify if query is working correctly
    console.log(`📊 Dashboard Stats Query - Active Projects Count: ${activeProjects}`);
    
    // Also log total projects for comparison
    const totalProjects = await prisma.project.count();
    console.log(`📊 Dashboard Stats Query - Total Projects: ${totalProjects}`);
    
    // Log projects by status for debugging
    const projectsByStatus = await prisma.project.groupBy({
      by: ['status'],
      _count: {
        id: true
      }
    });
    console.log(`📊 Dashboard Stats Query - Projects by Status:`, projectsByStatus);

    // Count Active Tasks (PENDING or IN_PROGRESS status)
    // Using Prisma enum values for type safety
    const activeTasks = await prisma.task.count({
      where: {
        status: {
          in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS]
        }
      }
    });

    // Count tasks by status for detailed breakdown
    // Using Prisma enum values for type safety
    const [completedTasks, pendingTasks, inProgressTasks] = await Promise.all([
      prisma.task.count({
        where: { status: TaskStatus.COMPLETED }
      }),
      prisma.task.count({
        where: { status: TaskStatus.PENDING }
      }),
      prisma.task.count({
        where: { status: TaskStatus.IN_PROGRESS }
      })
    ]);

    // Count active team members
    const teamMembers = await prisma.user.count({
      where: {
        isActive: true
      }
    });

    // Count in-progress tenders
    const inProgressTenders = await prisma.tender.count({
      where: {
        status: 'OPEN'
      }
    });

    // Count total clients
    const totalClients = await prisma.client.count();

    // Count total tenders
    const totalTenders = await prisma.tender.count();

    // Count pending invitations (for tender engineers)
    let pendingInvitations = 0;
    if (userRole === 'TENDER_ENGINEER' && userId) {
      pendingInvitations = await prisma.tenderInvitation.count({
        where: {
          engineerId: userId,
          status: 'PENDING'
        }
      });
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
 */
export const getRecentProjects = async (limit: number = 5) => {
  try {
    const projects = await prisma.project.findMany({
      take: limit,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        client: {
          select: {
            name: true,
            email: true
          }
        },
        projectManager: {
          select: {
            firstName: true,
            lastName: true,
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
      projectManager: project.projectManager 
        ? `${project.projectManager.firstName} ${project.projectManager.lastName}`
        : 'N/A',
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


