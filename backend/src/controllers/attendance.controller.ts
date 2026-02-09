import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { calculateDistance, checkProximity, isValidCoordinates } from '../utils/location.utils';

/**
 * Mark attendance (check-in or check-out) with location validation
 */
export const markAttendance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { type, latitude, longitude, accuracy } = req.body;

    // Validate required fields
    if (!type || (type !== 'CHECK_IN' && type !== 'CHECK_OUT')) {
      res.status(400).json({
        success: false,
        message: 'Attendance type must be CHECK_IN or CHECK_OUT',
      });
      return;
    }

    if (latitude === undefined || longitude === undefined) {
      res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required',
      });
      return;
    }

    // Validate coordinates
    if (!isValidCoordinates(latitude, longitude)) {
      res.status(400).json({
        success: false,
        message: 'Invalid coordinates provided',
      });
      return;
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Get company (try from user's company field or from assigned projects)
    let company = null;
    if (user.company) {
      company = await prisma.company.findFirst({
        where: { name: user.company },
      });
    }

    // If no company found, get the first company (for single-company setups)
    if (!company) {
      company = await prisma.company.findFirst();
    }

    if (!company) {
      res.status(500).json({
        success: false,
        message: 'Company configuration not found. Please contact administrator.',
      });
      return;
    }

    // Validate office coordinates are configured
    if (!company.officeLatitude || !company.officeLongitude) {
      res.status(500).json({
        success: false,
        message: 'Office location is not configured. Please contact administrator.',
      });
      return;
    }

    const officeLat = company.officeLatitude;
    const officeLon = company.officeLongitude;
    const allowedRadius = company.attendanceRadius || 200; // Default 200 meters

    // Calculate distance and check proximity
    const { isWithinRadius, distance } = checkProximity(
      latitude,
      longitude,
      officeLat,
      officeLon,
      allowedRadius
    );

    // Server-side validation: reject if outside radius
    if (!isWithinRadius) {
      res.status(403).json({
        success: false,
        message: `You must be within ${allowedRadius} meters of the office to mark attendance. Your current distance is ${distance.toFixed(2)} meters.`,
        distance: distance,
        allowedRadius: allowedRadius,
        isWithinRadius: false,
      });
      return;
    }

    // Get today's date (date only, no time)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if attendance already exists for today
    const existingAttendance = await prisma.attendance.findUnique({
      where: {
        userId_date_type: {
          userId: userId,
          date: today,
          type: type as 'CHECK_IN' | 'CHECK_OUT',
        },
      },
    });

    if (existingAttendance) {
      res.status(400).json({
        success: false,
        message: `You have already marked ${type === 'CHECK_IN' ? 'check-in' : 'check-out'} for today`,
      });
      return;
    }

    // For check-in, check if there's already a check-out today (shouldn't happen, but validate)
    if (type === 'CHECK_OUT') {
      const checkInToday = await prisma.attendance.findUnique({
        where: {
          userId_date_type: {
            userId: userId,
            date: today,
            type: 'CHECK_IN',
          },
        },
      });

      if (!checkInToday) {
        res.status(400).json({
          success: false,
          message: 'You must check in before checking out',
        });
        return;
      }
    }

    // Create attendance record
    const attendanceData: any = {
      userId: userId,
      companyId: company.id,
      type: type as 'CHECK_IN' | 'CHECK_OUT',
      employeeLatitude: latitude,
      employeeLongitude: longitude,
      distanceFromOffice: distance,
      isWithinRadius: true,
      date: today,
      locationAccuracy: accuracy || null,
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: req.get('user-agent') || null,
      status: 'PRESENT' as const,
    };

    if (type === 'CHECK_IN') {
      attendanceData.checkInTime = new Date();
    } else {
      attendanceData.checkOutTime = new Date();
    }

    const attendance = await prisma.attendance.create({
      data: attendanceData,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // If check-out, update check-in record with check-out time
    if (type === 'CHECK_OUT') {
      await prisma.attendance.update({
        where: {
          userId_date_type: {
            userId: userId,
            date: today,
            type: 'CHECK_IN',
          },
        },
        data: {
          checkOutTime: new Date(),
        },
      });
    }

    res.json({
      success: true,
      message: `${type === 'CHECK_IN' ? 'Check-in' : 'Check-out'} recorded successfully`,
      data: {
        attendance,
        distance: distance,
        allowedRadius: allowedRadius,
        isWithinRadius: true,
      },
    });
  } catch (error) {
    console.error('Mark attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Get employee's attendance records
 */
export const getMyAttendance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { startDate, endDate, limit = '50', page = '1' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      userId: userId,
    };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.date.lte = new Date(endDate as string);
      }
    }

    const [attendances, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { date: 'desc' },
        include: {
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.attendance.count({ where }),
    ]);

    res.json({
      success: true,
      data: attendances,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get today's attendance status
 */
export const getTodayAttendance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const checkIn = await prisma.attendance.findUnique({
      where: {
        userId_date_type: {
          userId: userId,
          date: today,
          type: 'CHECK_IN',
        },
      },
    });

    const checkOut = await prisma.attendance.findUnique({
      where: {
        userId_date_type: {
          userId: userId,
          date: today,
          type: 'CHECK_OUT',
        },
      },
    });

    res.json({
      success: true,
      data: {
        checkIn: checkIn
          ? {
              time: checkIn.checkInTime,
              latitude: checkIn.employeeLatitude,
              longitude: checkIn.employeeLongitude,
              distance: checkIn.distanceFromOffice,
            }
          : null,
        checkOut: checkOut
          ? {
              time: checkOut.checkOutTime,
              latitude: checkOut.employeeLatitude,
              longitude: checkOut.employeeLongitude,
              distance: checkOut.distanceFromOffice,
            }
          : null,
        date: today,
      },
    });
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get attendance statistics
 */
export const getAttendanceStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { startDate, endDate } = req.query;

    const where: any = {
      userId: userId,
      type: 'CHECK_IN', // Count check-ins for statistics
    };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.date.lte = new Date(endDate as string);
      }
    }

    // Get current week
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // This week's attendance
    const thisWeekCount = await prisma.attendance.count({
      where: {
        ...where,
        date: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
    });

    // Calculate worked hours for this week
    const thisWeekAttendances = await prisma.attendance.findMany({
      where: {
        userId: userId,
        date: {
          gte: weekStart,
          lte: weekEnd,
        },
        type: 'CHECK_IN',
      },
    });

    let totalHours = 0;
    for (const checkIn of thisWeekAttendances) {
      if (checkIn.checkInTime) {
        const checkOut = await prisma.attendance.findUnique({
          where: {
            userId_date_type: {
              userId: userId,
              date: checkIn.date,
              type: 'CHECK_OUT',
            },
          },
        });

        if (checkOut && checkOut.checkOutTime) {
          const hours =
            (checkOut.checkOutTime.getTime() - checkIn.checkInTime.getTime()) /
            (1000 * 60 * 60);
          totalHours += hours;
        }
      }
    }

    // Total present days
    const presentCount = await prisma.attendance.count({
      where: {
        ...where,
        status: 'PRESENT',
      },
    });

    // Absent count (would need to calculate based on working days)
    // For now, return basic stats
    res.json({
      success: true,
      data: {
        thisWeek: {
          hours: totalHours.toFixed(1),
          days: thisWeekCount,
        },
        present: presentCount,
        absent: 0, // Would need working days calculation
        onLeave: 0, // Would need leave records
        workedUpHours: totalHours.toFixed(1),
      },
    });
  } catch (error) {
    console.error('Get attendance stats error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get office location (for frontend proximity check)
 */
export const getOfficeLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    // Get user's company
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Get company
    let company = null;
    if (user.company) {
      company = await prisma.company.findFirst({
        where: { name: user.company },
      });
    }

    if (!company) {
      company = await prisma.company.findFirst();
    }

    if (!company || !company.officeLatitude || !company.officeLongitude) {
      res.status(404).json({
        success: false,
        message: 'Office location is not configured. An administrator must set office coordinates (latitude, longitude) in Company settings.',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        latitude: company.officeLatitude,
        longitude: company.officeLongitude,
        radius: company.attendanceRadius || 200,
        address: company.address || null,
      },
    });
  } catch (error) {
    console.error('Get office location error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
