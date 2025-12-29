import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;

    // Get active projects count
    const activeProjects = await prisma.project.count({
      where: {
        status: {
          not: 'Closed'
        }
      }
    });

    // Get active tasks count (using tenders as tasks for now)
    const activeTasks = await prisma.tender.count({
      where: {
        status: {
          in: ['OPEN', 'CLOSED']
        }
      }
    });

    // Get team members count (active users)
    const teamMembers = await prisma.user.count({
      where: {
        isActive: true
      }
    });

    // Get in-progress tenders count
    const inProgressTenders = await prisma.tender.count({
      where: {
        status: 'OPEN'
      }
    });

    // Get recent projects
    const recentProjects = await prisma.project.findMany({
      take: 5,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        client: {
          select: {
            name: true
          }
        }
      }
    });

    // Get pending invitations for tender engineers
    let pendingInvitations = 0;
    if (userRole === 'TENDER_ENGINEER') {
      pendingInvitations = await prisma.tenderInvitation.count({
        where: {
          engineerId: userId,
          status: 'PENDING'
        }
      });
    }

    res.json({
      success: true,
      data: {
        activeProjects,
        activeTasks,
        teamMembers,
        inProgressTenders,
        pendingInvitations,
        recentProjects: recentProjects.map(project => ({
          id: project.id,
          name: project.name,
          referenceNumber: project.referenceNumber,
          status: project.status,
          clientName: project.client?.name || 'N/A',
          createdAt: project.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getDashboardProjects = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, limit = 10 } = req.query;

    const where: any = {};
    if (status && status !== 'all') {
      where.status = status;
    }

    const projects = await prisma.project.findMany({
      where,
      take: Number(limit),
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        _count: {
          select: {
            tenders: true,
            documents: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: projects
    });
  } catch (error) {
    console.error('Dashboard projects error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getDashboardTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;

    let where: any = {};

    // If user is tender engineer, show only assigned tenders
    if (userRole === 'TENDER_ENGINEER') {
      where = {
        invitations: {
          some: {
            engineerId: userId
          }
        }
      };
    }

    const tasks = await prisma.tender.findMany({
      where,
      take: 10,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        project: {
          select: {
            name: true,
            referenceNumber: true
          }
        },
        client: {
          select: {
            name: true
          }
        },
        invitations: {
          where: userRole === 'TENDER_ENGINEER' ? { engineerId: userId } : undefined,
          select: {
            status: true,
            assignedAt: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: tasks.map(task => ({
        id: task.id,
        name: task.name,
        referenceNumber: task.referenceNumber,
        status: task.status,
        projectName: task.project.name,
        clientName: task.client?.name || 'N/A',
        bidSubmissionDeadline: task.bidSubmissionDeadline,
        invitationStatus: task.invitations[0]?.status || null,
        createdAt: task.createdAt
      }))
    });
  } catch (error) {
    console.error('Dashboard tasks error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getDashboardTeam = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const teamMembers = await prisma.user.findMany({
      where: {
        isActive: true
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: teamMembers
    });
  } catch (error) {
    console.error('Dashboard team error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getDashboardCalendar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { month, year } = req.query;
    const currentDate = new Date();
    const targetMonth = month ? Number(month) : currentDate.getMonth() + 1;
    const targetYear = year ? Number(year) : currentDate.getFullYear();

    // Get projects with deadlines in the specified month
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    const projects = await prisma.project.findMany({
      where: {
        deadline: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        id: true,
        name: true,
        deadline: true,
        status: true
      }
    });

    // Get tenders with deadlines in the specified month
    const tenders = await prisma.tender.findMany({
      where: {
        OR: [
          {
            bidSubmissionDeadline: {
              gte: startDate,
              lte: endDate
            }
          },
          {
            tenderAcceptanceDeadline: {
              gte: startDate,
              lte: endDate
            }
          }
        ]
      },
      select: {
        id: true,
        name: true,
        bidSubmissionDeadline: true,
        tenderAcceptanceDeadline: true,
        status: true
      }
    });

    const events = [
      ...projects.map(project => ({
        id: project.id,
        title: project.name,
        date: project.deadline,
        type: 'project',
        status: project.status
      })),
      ...tenders.map(tender => ({
        id: tender.id,
        title: tender.name,
        date: tender.bidSubmissionDeadline || tender.tenderAcceptanceDeadline,
        type: 'tender',
        status: tender.status
      }))
    ];

    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    console.error('Dashboard calendar error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getDashboardSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get all dashboard stats in one call
    const [
      activeProjects,
      activeTasks,
      teamMembers,
      inProgressTenders,
      totalClients,
      totalTenders,
      pendingInvitations
    ] = await Promise.all([
      prisma.project.count({ where: { status: { not: 'Closed' } } }),
      prisma.tender.count({ where: { status: { in: ['OPEN', 'CLOSED'] } } }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.tender.count({ where: { status: 'OPEN' } }),
      prisma.client.count(),
      prisma.tender.count(),
      req.user!.role === 'TENDER_ENGINEER' 
        ? prisma.tenderInvitation.count({ 
            where: { engineerId: req.user!.id, status: 'PENDING' } 
          })
        : Promise.resolve(0)
    ]);

    res.json({
      success: true,
      data: {
        activeProjects,
        activeTasks,
        teamMembers,
        inProgressTenders,
        totalClients,
        totalTenders,
        pendingInvitations
      }
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};


