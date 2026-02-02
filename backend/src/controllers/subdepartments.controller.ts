import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { SubDepartmentStatus } from '@prisma/client';

/**
 * Get all sub-departments for a specific department
 * GET /api/departments/:departmentId/sub-departments
 */
export const getDepartmentSubDepartments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { departmentId } = req.params;
    const { 
      status, 
      search,
      page = '1',
      limit = '100',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Verify department exists
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            tag: true,
          },
        },
      },
    });

    if (!department) {
      res.status(404).json({ 
        success: false, 
        message: 'Department not found' 
      });
      return;
    }

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      departmentId, // Always filter by department
    };

    if (status && status !== 'all') {
      where.status = status as SubDepartmentStatus;
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
        { location: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [subDepartments, total] = await Promise.all([
      prisma.subDepartment.findMany({
        where,
        skip,
        take: limitNum,
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
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          positions: {
            select: {
              id: true,
            },
          },
        },
        orderBy: {
          [sortBy as string]: sortOrder as 'asc' | 'desc',
        },
      }),
      prisma.subDepartment.count({ where }),
    ]);

    // Transform data to include employee count
    const transformedSubDepartments = subDepartments.map(subDept => ({
      ...subDept,
      employees: subDept.positions?.length || 0,
    }));

    res.json({
      success: true,
      data: transformedSubDepartments,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get department sub-departments error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get sub-department by ID
 * GET /api/sub-departments/:id
 */
export const getSubDepartmentById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const subDepartment = await prisma.subDepartment.findUnique({
      where: { id },
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
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        positions: {
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
          },
        },
      },
    });

    if (!subDepartment) {
      res.status(404).json({ success: false, message: 'Sub-department not found' });
      return;
    }

    // Transform to include employee count
    const transformed = {
      ...subDepartment,
      employees: subDepartment.positions?.length || 0,
    };

    res.json({
      success: true,
      data: transformed,
    });
  } catch (error) {
    console.error('Get sub-department by ID error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Create sub-department for a specific department
 * POST /api/departments/:departmentId/sub-departments
 */
export const createDepartmentSubDepartment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { departmentId } = req.params;
    const {
      name,
      description,
      status,
      managerId,
      location,
      budget,
    } = req.body;

    // Validate required fields
    if (!name) {
      res.status(400).json({
        success: false,
        message: 'Sub-department name is required',
      });
      return;
    }

    // Verify department exists
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            tag: true,
          },
        },
      },
    });

    if (!department) {
      res.status(404).json({
        success: false,
        message: 'Department not found',
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

    // Create sub-department
    const subDepartment = await prisma.subDepartment.create({
      data: {
        departmentId,
        name,
        description: description || null,
        status: (status as SubDepartmentStatus) || SubDepartmentStatus.ACTIVE,
        managerId: managerId || null,
        location: location || null,
        budget: budget || null,
      },
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
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        positions: {
          select: {
            id: true,
          },
        },
      },
    });

    // Transform to include employee count
    const transformed = {
      ...subDepartment,
      employees: subDepartment.positions?.length || 0,
    };

    res.status(201).json({
      success: true,
      message: 'Sub-department created successfully',
      data: transformed,
    });
  } catch (error) {
    console.error('Create sub-department error:', error);
    let errorMessage = 'Internal server error';
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        errorMessage = 'A sub-department with this name already exists in this department';
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
 * Update sub-department
 * PUT /api/sub-departments/:id
 */
export const updateSubDepartment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Don't allow changing departmentId through update
    if (updateData.departmentId) {
      delete updateData.departmentId;
    }

    // Convert status enum if provided
    if (updateData.status) {
      updateData.status = updateData.status as SubDepartmentStatus;
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

    const subDepartment = await prisma.subDepartment.update({
      where: { id },
      data: updateData,
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
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        positions: {
          select: {
            id: true,
          },
        },
      },
    });

    // Transform to include employee count
    const transformed = {
      ...subDepartment,
      employees: subDepartment.positions?.length || 0,
    };

    res.json({
      success: true,
      message: 'Sub-department updated successfully',
      data: transformed,
    });
  } catch (error) {
    console.error('Update sub-department error:', error);
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      res.status(404).json({ success: false, message: 'Sub-department not found' });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
};

/**
 * Delete sub-department
 * DELETE /api/sub-departments/:id
 */
export const deleteSubDepartment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const subDepartment = await prisma.subDepartment.findUnique({
      where: { id },
    });

    if (!subDepartment) {
      res.status(404).json({ success: false, message: 'Sub-department not found' });
      return;
    }

    // Delete sub-department (cascade will delete positions)
    await prisma.subDepartment.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Sub-department deleted successfully',
    });
  } catch (error) {
    console.error('Delete sub-department error:', error);
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      res.status(404).json({ success: false, message: 'Sub-department not found' });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
};
