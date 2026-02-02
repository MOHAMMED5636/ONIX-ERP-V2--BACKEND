import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { PositionStatus } from '@prisma/client';

/**
 * Get all positions for a specific sub-department
 * GET /api/sub-departments/:subDepartmentId/positions
 */
export const getSubDepartmentPositions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { subDepartmentId } = req.params;
    const { 
      status, 
      search,
      page = '1',
      limit = '100',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Verify sub-department exists
    const subDepartment = await prisma.subDepartment.findUnique({
      where: { id: subDepartmentId },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            company: {
              select: {
                id: true,
                name: true,
                tag: true,
              },
            },
          },
        },
      },
    });

    if (!subDepartment) {
      res.status(404).json({ 
        success: false, 
        message: 'Sub-department not found' 
      });
      return;
    }

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      subDepartmentId, // Always filter by sub-department
    };

    if (status && status !== 'all') {
      where.status = status as PositionStatus;
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [positions, total] = await Promise.all([
      prisma.position.findMany({
        where,
        skip,
        take: limitNum,
        include: {
          subDepartment: {
            select: {
              id: true,
              name: true,
              department: {
                select: {
                  id: true,
                  name: true,
                  company: {
                    select: {
                      id: true,
                      name: true,
                      tag: true,
                    },
                  },
                },
              },
            },
          },
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: {
          [sortBy as string]: sortOrder as 'asc' | 'desc',
        },
      }),
      prisma.position.count({ where }),
    ]);

    res.json({
      success: true,
      data: positions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get sub-department positions error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get position by ID
 * GET /api/positions/:id
 */
export const getPositionById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const position = await prisma.position.findUnique({
      where: { id },
      include: {
        subDepartment: {
          select: {
            id: true,
            name: true,
            department: {
              select: {
                id: true,
                name: true,
                company: {
                  select: {
                    id: true,
                    name: true,
                    tag: true,
                  },
                },
              },
            },
          },
        },
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!position) {
      res.status(404).json({ success: false, message: 'Position not found' });
      return;
    }

    res.json({
      success: true,
      data: position,
    });
  } catch (error) {
    console.error('Get position by ID error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Create position for a specific sub-department
 * POST /api/sub-departments/:subDepartmentId/positions
 */
export const createSubDepartmentPosition = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { subDepartmentId } = req.params;
    const {
      name,
      description,
      status,
      managerId,
    } = req.body;

    // Validate required fields
    if (!name) {
      res.status(400).json({
        success: false,
        message: 'Position name is required',
      });
      return;
    }

    // Verify sub-department exists
    const subDepartment = await prisma.subDepartment.findUnique({
      where: { id: subDepartmentId },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            company: {
              select: {
                id: true,
                name: true,
                tag: true,
              },
            },
          },
        },
      },
    });

    if (!subDepartment) {
      res.status(404).json({
        success: false,
        message: 'Sub-department not found',
      });
      return;
    }

    // Verify manager exists if provided
    if (managerId) {
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
      });
      if (!manager) {
        res.status(404).json({
          success: false,
          message: 'Manager not found',
        });
        return;
      }
    }

    // Create position
    const position = await prisma.position.create({
      data: {
        subDepartmentId,
        name,
        description: description || null,
        status: (status as PositionStatus) || PositionStatus.ACTIVE,
        managerId: managerId || null,
      },
      include: {
        subDepartment: {
          select: {
            id: true,
            name: true,
            department: {
              select: {
                id: true,
                name: true,
                company: {
                  select: {
                    id: true,
                    name: true,
                    tag: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Position created successfully',
      data: position,
    });
  } catch (error) {
    console.error('Create position error:', error);
    let errorMessage = 'Internal server error';
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        errorMessage = 'A position with this name already exists in this sub-department';
      } else {
        errorMessage = error.message;
      }
    }
    res.status(500).json({ 
      success: false, 
      message: errorMessage,
    });
  }
};

/**
 * Update position
 * PUT /api/positions/:id
 */
export const updatePosition = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Don't allow changing subDepartmentId through update
    if (updateData.subDepartmentId) {
      delete updateData.subDepartmentId;
    }

    // Convert status enum if provided
    if (updateData.status) {
      updateData.status = updateData.status as PositionStatus;
    }

    // Verify manager exists if provided
    if (updateData.managerId) {
      const manager = await prisma.user.findUnique({
        where: { id: updateData.managerId },
      });
      if (!manager) {
        res.status(404).json({
          success: false,
          message: 'Manager not found',
        });
        return;
      }
    }

    const position = await prisma.position.update({
      where: { id },
      data: updateData,
      include: {
        subDepartment: {
          select: {
            id: true,
            name: true,
            department: {
              select: {
                id: true,
                name: true,
                company: {
                  select: {
                    id: true,
                    name: true,
                    tag: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    res.json({
      success: true,
      message: 'Position updated successfully',
      data: position,
    });
  } catch (error) {
    console.error('Update position error:', error);
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      res.status(404).json({ success: false, message: 'Position not found' });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
};

/**
 * Delete position
 * DELETE /api/positions/:id
 */
export const deletePosition = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const position = await prisma.position.findUnique({
      where: { id },
    });

    if (!position) {
      res.status(404).json({ success: false, message: 'Position not found' });
      return;
    }

    // Delete position
    await prisma.position.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Position deleted successfully',
    });
  } catch (error) {
    console.error('Delete position error:', error);
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      res.status(404).json({ success: false, message: 'Position not found' });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
};
