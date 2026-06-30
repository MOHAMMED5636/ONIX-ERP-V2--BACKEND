"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleUsesCompanyAccessScope = roleUsesCompanyAccessScope;
exports.resolveEmployeeCompanyRecords = resolveEmployeeCompanyRecords;
exports.employeeCompanyCompatibleWithPositionCompany = employeeCompanyCompatibleWithPositionCompany;
exports.grantCompanyAccessForOrgPosition = grantCompanyAccessForOrgPosition;
exports.resolveCompanyAccessScope = resolveCompanyAccessScope;
exports.assertCanAccessCompany = assertCanAccessCompany;
exports.prismaCompanyWhereFromScope = prismaCompanyWhereFromScope;
exports.resolveCompanyNameAliasesForScope = resolveCompanyNameAliasesForScope;
exports.buildEmployeeWhereForCompanyScope = buildEmployeeWhereForCompanyScope;
exports.countActiveEmployeesForScope = countActiveEmployeesForScope;
exports.assertEmployeeInCompanyScope = assertEmployeeInCompanyScope;
const database_1 = __importDefault(require("../config/database"));
const client_1 = require("@prisma/client");
const company_name_aliases_1 = require("../utils/company-name-aliases");
const SCOPED_ROLES = new Set([client_1.UserRole.ADMIN, client_1.UserRole.HR]);
function roleUsesCompanyAccessScope(role) {
    return role != null && SCOPED_ROLES.has(role);
}
function locationHints(location) {
    const loc = String(location ?? '').trim().toLowerCase();
    if (!loc)
        return [];
    const hints = [loc];
    if (loc.includes('dubai') || loc.includes('dubi'))
        hints.push('dubai', 'onix dubai');
    if (loc.includes('abu') && loc.includes('dhabi'))
        hints.push('abu dhabi', 'onix ad');
    if (loc.includes('syria') || loc.includes('idlib'))
        hints.push('syria', 'idlib', 'onix syr');
    return [...new Set(hints)];
}
function companyMatchesLocation(c, hints) {
    if (!hints.length)
        return true;
    const hay = [c.name, c.tag, c.branchName, c.address].filter(Boolean).join(' ').toLowerCase();
    return hints.some((h) => hay.includes(h));
}
function nameMatchesUserCompany(companyName, parentName, userCompany) {
    const userAliases = (0, company_name_aliases_1.buildCompanyNameAliases)(userCompany);
    const scopeAliases = (0, company_name_aliases_1.buildCompanyScopeAliases)(companyName, parentName);
    return scopeAliases.some((sa) => userAliases.some((ua) => ua.toLowerCase() === sa.toLowerCase()));
}
/**
 * Resolve org Company rows for an employee/manager from profile `company` + `companyLocation`
 * (handles parent vs branch names, e.g. ONIX ENGINEERING CONSULTANCY + Dubai HQ → Dubai branch).
 */
async function resolveEmployeeCompanyRecords(userId) {
    const user = await database_1.default.user.findUnique({
        where: { id: userId },
        select: { company: true, companyLocation: true },
    });
    const userCompany = user?.company?.trim() ?? '';
    if (!userCompany)
        return [];
    const all = await database_1.default.company.findMany({
        select: {
            id: true,
            name: true,
            tag: true,
            branchName: true,
            address: true,
            logo: true,
            parentCompany: { select: { name: true } },
        },
    });
    let candidates = all.filter((c) => nameMatchesUserCompany(c.name, c.parentCompany?.name ?? null, userCompany));
    const hints = locationHints(user?.companyLocation);
    if (candidates.length > 1 && hints.length > 0) {
        const narrowed = candidates.filter((c) => companyMatchesLocation(c, hints));
        if (narrowed.length > 0)
            candidates = narrowed;
    }
    return candidates.map(({ parentCompany: _p, ...c }) => c);
}
/**
 * Whether an employee's User.company text can be assigned to an org position under positionCompanyName.
 * Allows same company, parent↔branch, and sibling branches under one parent (Load from Employee Directory).
 */
async function employeeCompanyCompatibleWithPositionCompany(userCompany, positionCompanyName) {
    const empCompany = userCompany.trim();
    const posName = positionCompanyName.trim();
    if (!empCompany || !posName)
        return false;
    const directAliases = (0, company_name_aliases_1.buildCompanyScopeAliases)(posName);
    const empAliases = (0, company_name_aliases_1.buildCompanyNameAliases)(empCompany);
    if (directAliases.some((da) => empAliases.some((ea) => ea.toLowerCase() === da.toLowerCase()))) {
        return true;
    }
    const posAliases = (0, company_name_aliases_1.buildCompanyNameAliases)(posName);
    const positionCompany = await database_1.default.company.findFirst({
        where: {
            OR: posAliases.map((n) => ({ name: { equals: n, mode: 'insensitive' } })),
        },
        select: {
            id: true,
            name: true,
            parentCompanyId: true,
            parentCompany: { select: { id: true, name: true } },
        },
    });
    if (!positionCompany) {
        return false;
    }
    const rootId = positionCompany.parentCompanyId ?? positionCompany.id;
    const [groupCompanies, rootCompany] = await Promise.all([
        database_1.default.company.findMany({
            where: {
                OR: [{ id: rootId }, { parentCompanyId: rootId }],
            },
            select: {
                name: true,
                parentCompany: { select: { name: true } },
            },
        }),
        database_1.default.company.findUnique({
            where: { id: rootId },
            select: { name: true },
        }),
    ]);
    const rootName = positionCompany.parentCompany?.name ?? rootCompany?.name ?? null;
    for (const c of groupCompanies) {
        const parentName = c.parentCompany?.name ?? rootName;
        if (nameMatchesUserCompany(c.name, parentName, empCompany)) {
            return true;
        }
    }
    return nameMatchesUserCompany(positionCompany.name, positionCompany.parentCompany?.name, empCompany);
}
const accessibleCompanySelect = {
    id: true,
    name: true,
    tag: true,
    branchName: true,
    address: true,
    logo: true,
};
/** Companies linked to org-chart position assignments for this user. */
async function resolveCompaniesFromOrgPositionAssignments(userId) {
    const assignments = await database_1.default.employeePositionAssignment.findMany({
        where: { userId },
        select: {
            position: {
                select: {
                    subDepartment: {
                        select: {
                            department: {
                                select: { company: { select: accessibleCompanySelect } },
                            },
                        },
                    },
                },
            },
        },
    });
    const byId = new Map();
    for (const row of assignments) {
        const company = row.position?.subDepartment?.department?.company;
        if (company)
            byId.set(company.id, company);
    }
    return Array.from(byId.values());
}
function mergeAccessibleCompanies(...lists) {
    const byId = new Map();
    for (const list of lists) {
        for (const c of list)
            byId.set(c.id, c);
    }
    return Array.from(byId.values());
}
/** Grant ERP company visibility when a user is assigned to an org-chart position (e.g. Syria branch HR). */
async function grantCompanyAccessForOrgPosition(userId, positionId, grantedById) {
    const position = await database_1.default.position.findUnique({
        where: { id: positionId },
        select: {
            subDepartment: {
                select: { department: { select: { companyId: true } } },
            },
        },
    });
    const companyId = position?.subDepartment?.department?.companyId;
    if (!companyId)
        return;
    await database_1.default.userCompanyAccess.upsert({
        where: { userId_companyId: { userId, companyId } },
        create: {
            userId,
            companyId,
            grantedById: grantedById ?? null,
        },
        update: {},
    });
}
/** SUPER_ADMIN: all companies. ADMIN/HR: assigned companies only. */
async function resolveCompanyAccessScope(userId, userRole) {
    if (userRole === client_1.UserRole.SUPER_ADMIN) {
        return { unrestricted: true, companyIds: [], companies: [] };
    }
    if (!roleUsesCompanyAccessScope(userRole)) {
        return { unrestricted: false, companyIds: [], companies: [] };
    }
    const user = await database_1.default.user.findUnique({
        where: { id: userId },
        select: { company: true, companyLocation: true },
    });
    const explicit = await database_1.default.userCompanyAccess.findMany({
        where: { userId },
        include: {
            company: {
                select: { id: true, name: true, tag: true, branchName: true, address: true, logo: true },
            },
        },
    });
    if (explicit.length > 0) {
        const orgCompanies = await resolveCompaniesFromOrgPositionAssignments(userId);
        const companies = mergeAccessibleCompanies(explicit.map((row) => row.company), orgCompanies);
        return {
            unrestricted: false,
            companyIds: companies.map((c) => c.id),
            companies,
        };
    }
    const userCompany = user?.company?.trim() ?? '';
    if (!userCompany) {
        return { unrestricted: false, companyIds: [], companies: [] };
    }
    const all = await database_1.default.company.findMany({
        select: {
            id: true,
            name: true,
            tag: true,
            branchName: true,
            address: true,
            logo: true,
            parentCompany: { select: { name: true } },
        },
    });
    let candidates = all.filter((c) => nameMatchesUserCompany(c.name, c.parentCompany?.name ?? null, userCompany));
    const orgCompanies = await resolveCompaniesFromOrgPositionAssignments(userId);
    const hints = locationHints(user?.companyLocation);
    if (candidates.length > 1 && hints.length > 0) {
        const narrowed = candidates.filter((c) => companyMatchesLocation(c, hints));
        if (narrowed.length > 0)
            candidates = narrowed;
    }
    const companies = mergeAccessibleCompanies(candidates.map(({ parentCompany: _p, ...c }) => c), orgCompanies);
    return {
        unrestricted: false,
        companyIds: companies.map((c) => c.id),
        companies,
    };
}
async function assertCanAccessCompany(userId, userRole, companyId) {
    const scope = await resolveCompanyAccessScope(userId, userRole);
    if (scope.unrestricted)
        return true;
    if (scope.companyIds.includes(companyId))
        return true;
    const employeeCompanies = await resolveEmployeeCompanyRecords(userId);
    return employeeCompanies.some((c) => c.id === companyId);
}
function prismaCompanyWhereFromScope(scope) {
    if (scope.unrestricted)
        return {};
    if (scope.companyIds.length === 0)
        return { id: { in: [] } };
    return { id: { in: scope.companyIds } };
}
/** Resolve all User.company string aliases covered by accessible companies. */
async function resolveCompanyNameAliasesForScope(scope) {
    if (scope.unrestricted)
        return [];
    const names = new Set();
    for (const brief of scope.companies) {
        const row = await database_1.default.company.findUnique({
            where: { id: brief.id },
            select: {
                name: true,
                parentCompany: { select: { name: true } },
            },
        });
        if (!row)
            continue;
        (0, company_name_aliases_1.buildCompanyScopeAliases)(row.name, row.parentCompany?.name).forEach((a) => {
            if (a.trim())
                names.add(a.trim());
        });
    }
    return Array.from(names);
}
/** Prisma filter for employees belonging to accessible companies (User.company text). */
async function buildEmployeeWhereForCompanyScope(scope) {
    if (scope.unrestricted)
        return undefined;
    const aliases = await resolveCompanyNameAliasesForScope(scope);
    if (aliases.length === 0)
        return { id: { in: [] } };
    return {
        OR: aliases.map((n) => ({ company: { equals: n, mode: 'insensitive' } })),
    };
}
async function countActiveEmployeesForScope(scope) {
    const employeeWhere = await buildEmployeeWhereForCompanyScope(scope);
    return database_1.default.user.count({
        where: {
            role: { notIn: [client_1.UserRole.TENDER_ENGINEER] },
            isActive: true,
            ...(employeeWhere ?? {}),
        },
    });
}
/** HR/Admin: ensure target employee belongs to actor's assigned companies (Super Admin bypasses). */
async function assertEmployeeInCompanyScope(employeeId, actorId, actorRole) {
    const scope = await resolveCompanyAccessScope(actorId, actorRole);
    if (scope.unrestricted)
        return { ok: true };
    const employee = await database_1.default.user.findUnique({
        where: { id: employeeId },
        select: { id: true, company: true },
    });
    if (!employee) {
        return { ok: false, message: 'Employee not found', status: 404 };
    }
    const aliases = await resolveCompanyNameAliasesForScope(scope);
    if (aliases.length === 0) {
        return { ok: false, message: 'Forbidden: no company access assigned', status: 403 };
    }
    const empCompany = (employee.company || '').trim().toLowerCase();
    if (!empCompany) {
        return {
            ok: false,
            message: 'Forbidden: this employee is not linked to a company in your scope',
            status: 403,
        };
    }
    const allowed = aliases.some((a) => a.toLowerCase() === empCompany);
    if (!allowed) {
        return {
            ok: false,
            message: 'Forbidden: this employee is outside your assigned companies',
            status: 403,
        };
    }
    return { ok: true };
}
//# sourceMappingURL=companyAccess.service.js.map