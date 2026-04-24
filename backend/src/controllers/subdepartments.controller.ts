import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { Prisma, SubDepartmentStatus } from '@prisma/client';
import { parseSubDepartmentStatus } from '../utils/orgStructureStatus';

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
    // Employee role: Cannot create sub-departments
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to create this content. Please contact your manager.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

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

    const statusParsed =
      parseSubDepartmentStatus(status) ?? SubDepartmentStatus.ACTIVE;

    // Create sub-department
    const subDepartment = await prisma.subDepartment.create({
      data: {
        departmentId,
        name,
        description: description || null,
        status: statusParsed,
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
    // Employee role: Cannot update sub-departments
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to edit this content. Please contact your manager.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    const { id } = req.params;
    const body = req.body || {};

    const data: Prisma.SubDepartmentUpdateInput = {};

    if (typeof body.name === 'string') {
      const trimmed = body.name.trim();
      if (!trimmed) {
        res.status(400).json({ success: false, message: 'Sub-department name cannot be empty' });
        return;
      }
      data.name = trimmed;
    }
    if (body.description !== undefined) {
      data.description =
        body.description === null || body.description === ''
          ? null
          : String(body.description).trim() || null;
    }
    if (body.status !== undefined) {
      const s = parseSubDepartmentStatus(body.status);
      if (!s) {
        res.status(400).json({
          success: false,
          message: 'Invalid status. Use ACTIVE or INACTIVE.',
        });
        return;
      }
      data.status = s;
    }
    if (body.location !== undefined) {
      data.location =
        body.location === null || body.location === ''
          ? null
          : String(body.location).trim() || null;
    }
    if (body.budget !== undefined) {
      data.budget =
        body.budget === null || body.budget === ''
          ? null
          : String(body.budget).trim() || null;
    }
    if (body.managerId !== undefined) {
      const mid = body.managerId;
      if (!mid) {
        data.manager = { disconnect: true };
      } else {
        const manager = await prisma.user.findUnique({
          where: { id: mid },
        });
        if (!manager) {
          res.status(404).json({
            success: false,
            message: 'Manager not found',
          });
          return;
        }
        data.manager = { connect: { id: mid } };
      }
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: 'No valid fields to update' });
      return;
    }

    const subDepartment = await prisma.subDepartment.update({
      where: { id },
      data,
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
    // Employee role: Cannot delete sub-departments
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to delete this content. Please contact your manager.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

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
