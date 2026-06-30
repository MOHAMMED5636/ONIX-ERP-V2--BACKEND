"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDepartment = exports.updateDepartment = exports.createCompanyDepartment = exports.getDepartmentById = exports.getCompanyDepartments = void 0;
const database_1 = __importDefault(require("../config/database"));
const client_1 = require("@prisma/client");
const company_name_aliases_1 = require("../utils/company-name-aliases");
/**
 * Get all departments for a specific company
 * GET /api/companies/:companyId/departments
 */
const getCompanyDepartments = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { status, search, page = '1', limit = '100', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        // Verify company exists (include parent for branch aliasing)
        const company = await database_1.default.company.findUnique({
            where: { id: companyId },
            select: { id: true, name: true, parentCompanyId: true },
        });
        if (!company) {
            res.status(404).json({
                success: false,
                message: 'Company not found'
            });
            return;
        }
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;
        const where = {
            companyId, // Always filter by company
        };
        if (status && status !== 'all') {
            where.status = status;
        }
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [departments, total] = await Promise.all([
            database_1.default.department.findMany({
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
                    [sortBy]: sortOrder,
                },
            }),
            database_1.default.department.count({ where }),
        ]);
        let parentName = null;
        if (company?.parentCompanyId) {
            const parent = await database_1.default.company.findUnique({
                where: { id: String(company.parentCompanyId).trim() },
                select: { name: true },
            });
            parentName = parent?.name ? String(parent.name).trim() : null;
        }
        const companyAliases = (0, company_name_aliases_1.buildCompanyScopeAliases)(company.name, parentName);
        const employeeDirectoryBase = {
            role: { notIn: [client_1.UserRole.TENDER_ENGINEER] },
            isActive: true,
            ...(companyAliases.length > 0
                ? {
                    OR: companyAliases.map((n) => ({
                        company: { equals: n, mode: 'insensitive' },
                    })),
                }
                : { company: { equals: company.name, mode: 'insensitive' } }),
        };
        const deptIds = departments.map((d) => d.id);
        const allSubs = deptIds.length === 0
            ? []
            : await database_1.default.subDepartment.findMany({
                where: { departmentId: { in: deptIds } },
                select: { id: true, name: true, departmentId: true },
            });
        const subsByDeptId = new Map();
        for (const s of allSubs) {
            const arr = subsByDeptId.get(s.departmentId) ?? [];
            arr.push({ id: s.id, name: s.name });
            subsByDeptId.set(s.departmentId, arr);
        }
        const subIdList = allSubs.map((s) => s.id);
        const positionsUnderSubs = subIdList.length === 0
            ? []
            : await database_1.default.position.findMany({
                where: { subDepartmentId: { in: subIdList } },
                select: { id: true, subDepartmentId: true },
            });
        const positionIdsBySubId = new Map();
        for (const p of positionsUnderSubs) {
            const arr = positionIdsBySubId.get(p.subDepartmentId) ?? [];
            arr.push(p.id);
            positionIdsBySubId.set(p.subDepartmentId, arr);
        }
        const normKey = (s) => s.trim().toLowerCase();
        const buildDeptMatchOr = (dept) => {
            const clauses = [];
            const seen = new Set();
            const pushDeptString = (raw) => {
                const t = raw?.trim();
                if (!t)
                    return;
                const k = normKey(t);
                if (seen.has(k))
                    return;
                seen.add(k);
                clauses.push({ department: { equals: t, mode: 'insensitive' } });
            };
            pushDeptString(dept.name);
            const subs = subsByDeptId.get(dept.id) ?? [];
            for (const s of subs)
                pushDeptString(s.name);
            const positionIds = [];
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
            database_1.default.user.count({ where: employeeDirectoryBase }),
            ...departments.map((dept) => {
                const deptOr = buildDeptMatchOr(dept);
                return database_1.default.user.count({
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
    }
    catch (error) {
        console.error('Get company departments error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
exports.getCompanyDepartments = getCompanyDepartments;
/**
 * Get department by ID
 * GET /api/departments/:id
 */
const getDepartmentById = async (req, res) => {
    try {
        const { id } = req.params;
        const department = await database_1.default.department.findUnique({
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
    }
    catch (error) {
        console.error('Get department by ID error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
exports.getDepartmentById = getDepartmentById;
/**
 * Create department for a specific company
 * POST /api/companies/:companyId/departments
 */
const createCompanyDepartment = async (req, res) => {
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
        const { name, description, status, managerId, } = req.body;
        // Validate required fields
        if (!name) {
            res.status(400).json({
                success: false,
                message: 'Department name is required',
            });
            return;
        }
        // Verify company exists
        const company = await database_1.default.company.findUnique({
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
        const department = await database_1.default.department.create({
            data: {
                companyId,
                name,
                description: description || null,
                status: status || client_1.DepartmentStatus.ACTIVE,
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
    }
    catch (error) {
        console.error('Create department error:', error);
        let errorMessage = 'Internal server error';
        if (error instanceof Error) {
            if (error.message.includes('Unique constraint')) {
                errorMessage = 'A department with this name already exists in this company';
            }
            else {
                errorMessage = error.message;
            }
        }
        res.status(500).json({
            success: false,
            message: errorMessage,
        });
    }
};
exports.createCompanyDepartment = createCompanyDepartment;
/**
 * Update department
 * PUT /api/departments/:id
 */
const updateDepartment = async (req, res) => {
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
            updateData.status = updateData.status;
        }
        const department = await database_1.default.department.update({
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
    }
    catch (error) {
        console.error('Update department error:', error);
        if (error instanceof Error && error.message.includes('Record to update not found')) {
            res.status(404).json({ success: false, message: 'Department not found' });
        }
        else {
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
};
exports.updateDepartment = updateDepartment;
/**
 * Delete department
 * DELETE /api/departments/:id
 */
const deleteDepartment = async (req, res) => {
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
        const department = await database_1.default.department.findUnique({
            where: { id },
        });
        if (!department) {
            res.status(404).json({ success: false, message: 'Department not found' });
            return;
        }
        await database_1.default.department.delete({
            where: { id },
        });
        res.json({
            success: true,
            message: 'Department deleted successfully',
        });
    }
    catch (error) {
        console.error('Delete department error:', error);
        if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
            res.status(404).json({ success: false, message: 'Department not found' });
        }
        else {
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
};
exports.deleteDepartment = deleteDepartment;
//# sourceMappingURL=departments.controller.js.map