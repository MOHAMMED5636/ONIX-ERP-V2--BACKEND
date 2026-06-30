import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { DepartmentStatus, Prisma, UserRole } from '@prisma/client';
import { buildCompanyScopeAliases } from '../utils/company-name-aliases';

/**
 * Get all departments for a specific company
 * GET /api/companies/:companyId/departments
 */
export const getCompanyDepartments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;
    const { 
      status, 
      search,
      page = '1',
      limit = '100',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Verify company exists (include parent for branch aliasing)
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, parentCompanyId: true } as any,
    }) as any;

    if (!company) {
      res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
      return;
    }

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      companyId, // Always filter by company
    };

    if (status && status !== 'all') {
      where.status = status as DepartmentStatus;
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [departments, total] = await Promise.all([
      prisma.department.findMany({
        where,
        skip,
        take: limitNum,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              tag: true,
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
      prisma.department.count({ where }),
    ]);

    let parentName: string | null = null;
    if (company?.parentCompanyId) {
      const parent = await prisma.company.findUnique({
        where: { id: String(company.parentCompanyId).trim() },
        select: { name: true } as any,
      }) as any;
      parentName = parent?.name ? String(parent.name).trim() : null;
    }
    const companyAliases = buildCompanyScopeAliases(company.name, parentName);
    const employeeDirectoryBase: Prisma.UserWhereInput = {
      role: { notIn: [UserRole.TENDER_ENGINEER] },
      isActive: true,
      ...(companyAliases.length > 0
        ? {
            OR: companyAliases.map((n) => ({
              company: { equals: n, mode: 'insensitive' as const },
            })),
          }
        : { company: { equals: company.name, mode: 'insensitive' as const } }),
    };

    const deptIds = departments.map((d) => d.id);
    const allSubs =
      deptIds.length === 0
        ? []
        : await prisma.subDepartment.findMany({
            where: { departmentId: { in: deptIds } },
            select: { id: true, name: true, departmentId: true },
          });
    const subsByDeptId = new Map<string, { id: string; name: string }[]>();
    for (const s of allSubs) {
      const arr = subsByDeptId.get(s.departmentId) ?? [];
      arr.push({ id: s.id, name: s.name });
      subsByDeptId.set(s.departmentId, arr);
    }
    const subIdList = allSubs.map((s) => s.id);
    const positionsUnderSubs =
      subIdList.length === 0
        ? []
        : await prisma.position.findMany({
            where: { subDepartmentId: { in: subIdList } },
            select: { id: true, subDepartmentId: true },
          });
    const positionIdsBySubId = new Map<string, string[]>();
    for (const p of positionsUnderSubs) {
      const arr = positionIdsBySubId.get(p.subDepartmentId) ?? [];
      arr.push(p.id);
      positionIdsBySubId.set(p.subDepartmentId, arr);
    }

    const normKey = (s: string) => s.trim().toLowerCase();

    const buildDeptMatchOr = (dept: { id: string; name: string }): Prisma.UserWhereInput[] => {
      const clauses: Prisma.UserWhereInput[] = [];
      const seen = new Set<string>();
      const pushDeptString = (raw: string) => {
        const t = raw?.trim();
        if (!t) return;
        const k = normKey(t);
        if (seen.has(k)) return;
        seen.add(k);
        clauses.push({ department: { equals: t, mode: 'insensitive' } });
      };
      pushDeptString(dept.name);
      const subs = subsByDeptId.get(dept.id) ?? [];
      for (const s of subs) pushDeptString(s.name);
      const positionIds: string[] = [];
      for (const s of subs) {
        positionIds.push(...(positionIdsBySubId.get(s.id) ?? []));
      }
      if (positionIds.length > 0) {
        clauses.push({
          positionAssignments: { some: { positionId: { in: positionIds } } },
        });
      }
      return clauses;
    };

    const [companyActiveEmployeeTotal, ...perDeptCounts] = await Promise.all([
      prisma.user.count({ where: employeeDirectoryBase }),
      ...departments.map((dept) => {
        const deptOr = buildDeptMatchOr(dept);
        return prisma.user.count({
          where: {
            AND: [
              employeeDirectoryBase,
              deptOr.length > 0 ? { OR: deptOr } : { id: { in: [] } },
            ],
          },
        });
      }),
    ]);

    const enrichedDepartments = departments.map((dept, i) => ({
      ...dept,
      activeEmployeeCount: perDeptCounts[i],
    }));

    res.json({
      success: true,
      data: enrichedDepartments,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      companyEmployeeSummary: {
        activeTotal: companyActiveEmployeeTotal,
      },
    });
  } catch (error) {
    console.error('Get company departments error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get department by ID
 * GET /api/departments/:id
 */
export const getDepartmentById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            tag: true,
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

    if (!department) {
      res.status(404).json({ success: false, message: 'Department not found' });
      return;
    }

    res.json({
      success: true,
      data: department,
    });
  } catch (error) {
    console.error('Get department by ID error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Create department for a specific company
 * POST /api/companies/:companyId/departments
 */
export const createCompanyDepartment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Employee role: Cannot create departments
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to create this content. Please contact your manager.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    const { companyId } = req.params;
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
        message: 'Department name is required',
      });
      return;
    }
       
    // Verify company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      res.status(404).json({
        success: false,
        message: 'Company not found',
      });
      return;
    }

    // Create department
    const department = await prisma.department.create({
      data: {
        companyId,
        name,
        description: description || null,
        status: (status as DepartmentStatus) || DepartmentStatus.ACTIVE,
        managerId: managerId || null,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            tag: true,
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

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: department,
    });
  } catch (error) {
    console.error('Create department error:', error);
    let errorMessage = 'Internal server error';
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        errorMessage = 'A department with this name already exists in this company';
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
 * Update department
 * PUT /api/departments/:id
 */
export const updateDepartment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Employee role: Cannot update departments
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to edit this content. Please contact your manager.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    const { id } = req.params;
    const updateData = req.body;

    // Don't allow changing companyId through update
    if (updateData.companyId) {
      delete updateData.companyId;
    }

    // Convert status enum if provided
    if (updateData.status) {
      updateData.status = updateData.status as DepartmentStatus;
    }

    const department = await prisma.department.update({
      where: { id },
      data: updateData,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            tag: true,
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

    res.json({
      success: true,
      message: 'Department updated successfully',
      data: department,
    });
  } catch (error) {
    console.error('Update department error:', error);
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      res.status(404).json({ success: false, message: 'Department not found' });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
};

/**
 * Delete department
 * DELETE /api/departments/:id
 */
export const deleteDepartment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Employee role: Cannot delete departments
    if (req.user?.role === 'EMPLOYEE') {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You do not have permission to delete this content. Please contact your manager.',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    const { id } = req.params;

    const department = await prisma.department.findUnique({
      where: { id },
    });

    if (!department) {
      res.status(404).json({ success: false, message: 'Department not found' });
      return;
    }

    await prisma.department.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Department deleted successfully',
    });
  } catch (error) {
    console.error('Delete department error:', error);
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      res.status(404).json({ success: false, message: 'Department not found' });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
};
