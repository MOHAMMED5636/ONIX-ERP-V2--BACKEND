"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isManagerWorkloadRole = isManagerWorkloadRole;
exports.getManagerNameVariations = getManagerNameVariations;
exports.getManagerProjectIds = getManagerProjectIds;
exports.getManagedEmployeeIdsFromOrg = getManagedEmployeeIdsFromOrg;
exports.getProjectTeamEmployeeIds = getProjectTeamEmployeeIds;
exports.getManagerProjects = getManagerProjects;
exports.filterTeamIdsByProjects = filterTeamIdsByProjects;
exports.getManagerTeamUserIds = getManagerTeamUserIds;
exports.listPeerProjectManagersForWorkload = listPeerProjectManagersForWorkload;
exports.resolvePeerProjectManagerView = resolvePeerProjectManagerView;
const database_1 = __importDefault(require("../config/database"));
const companyAccess_service_1 = require("./companyAccess.service");
const company_name_aliases_1 = require("../utils/company-name-aliases");
function isManagerWorkloadRole(role) {
    return role === 'MANAGER' || role === 'PROJECT_MANAGER';
}
async function getManagerNameVariations(managerUserId) {
    const u = await database_1.default.user.findUnique({
        where: { id: managerUserId },
        select: { firstName: true, lastName: true },
    });
    if (!u)
        return [];
    const first = u.firstName?.trim().toLowerCase() || '';
    const last = u.lastName?.trim().toLowerCase() || '';
    const vars = new Set();
    if (first)
        vars.add(first);
    if (last)
        vars.add(last);
    if (first && last) {
        vars.add(`${first} ${last}`);
        vars.add(`${first} ${last.charAt(0)}`);
    }
    return [...vars];
}
/** Project IDs this manager owns or leads (matches project list scoping). */
async function getManagerProjectIds(managerUserId, managerEmail) {
    const nameVars = await getManagerNameVariations(managerUserId);
    const orConditions = [{ createdBy: managerUserId }];
    if (managerEmail) {
        orConditions.push({
            contracts: { some: { assignedManagerEmail: managerEmail } },
        });
    }
    orConditions.push({
        contracts: { some: { assignedManagerId: managerUserId } },
    });
    if (nameVars.length > 0) {
        orConditions.push({
            OR: nameVars.map((name) => ({
                projectManager: { contains: name, mode: 'insensitive' },
            })),
        });
    }
    const projects = await database_1.default.project.findMany({
        where: { OR: orConditions, deletedAt: null },
        select: { id: true },
    });
    return projects.map((p) => p.id);
}
/**
 * Org hierarchy team: direct reports + departments/positions/sub-departments they manage.
 */
async function getManagedEmployeeIdsFromOrg(managerUserId) {
    const ids = new Set();
    const direct = await database_1.default.user.findMany({
        where: { managerId: managerUserId, isActive: true },
        select: { id: true },
    });
    direct.forEach((u) => ids.add(u.id));
    const managedDepts = await database_1.default.department.findMany({
        where: { managerId: managerUserId },
        select: { name: true },
    });
    for (const d of managedDepts) {
        const users = await database_1.default.user.findMany({
            where: {
                isActive: true,
                department: { equals: d.name, mode: 'insensitive' },
            },
            select: { id: true },
        });
        users.forEach((u) => ids.add(u.id));
    }
    const managedPositions = await database_1.default.position.findMany({
        where: { managerId: managerUserId },
        select: { name: true },
    });
    for (const p of managedPositions) {
        const name = p.name?.trim();
        if (!name)
            continue;
        const users = await database_1.default.user.findMany({
            where: {
                isActive: true,
                position: { equals: name, mode: 'insensitive' },
            },
            select: { id: true },
        });
        users.forEach((u) => ids.add(u.id));
    }
    const managedSubDepts = await database_1.default.subDepartment.findMany({
        where: { managerId: managerUserId },
        select: { id: true },
    });
    for (const sd of managedSubDepts) {
        const positions = await database_1.default.position.findMany({
            where: { subDepartmentId: sd.id },
            select: { name: true },
        });
        for (const p of positions) {
            const name = p.name?.trim();
            if (!name)
                continue;
            const users = await database_1.default.user.findMany({
                where: {
                    isActive: true,
                    position: { equals: name, mode: 'insensitive' },
                },
                select: { id: true },
            });
            users.forEach((u) => ids.add(u.id));
        }
    }
    ids.delete(managerUserId);
    return [...ids];
}
/** Employees on this manager's projects (task assignees + project members). */
async function getProjectTeamEmployeeIds(managerUserId, managerEmail) {
    const projectIds = await getManagerProjectIds(managerUserId, managerEmail);
    if (projectIds.length === 0)
        return [];
    const ids = new Set();
    const tasks = await database_1.default.task.findMany({
        where: {
            projectId: { in: projectIds },
            deletedAt: null,
        },
        select: {
            assignedEmployeeId: true,
            assignments: { select: { employeeId: true } },
        },
    });
    for (const t of tasks) {
        if (t.assignedEmployeeId)
            ids.add(t.assignedEmployeeId);
        for (const a of t.assignments)
            ids.add(a.employeeId);
    }
    const members = await database_1.default.projectAssignment.findMany({
        where: { projectId: { in: projectIds } },
        select: { employeeId: true },
    });
    for (const m of members)
        ids.add(m.employeeId);
    ids.delete(managerUserId);
    return [...ids];
}
/** Projects this manager leads (for workload project filter). */
async function getManagerProjects(managerUserId, managerEmail) {
    const ids = await getManagerProjectIds(managerUserId, managerEmail);
    if (ids.length === 0)
        return [];
    return database_1.default.project.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: {
            id: true,
            name: true,
            projectNumber: true,
            referenceNumber: true,
        },
        orderBy: [{ projectNumber: 'asc' }, { name: 'asc' }],
    });
}
/** Keep team members who have workload tasks or project membership on selected projects. */
async function filterTeamIdsByProjects(teamIds, projectIds, activeTaskStatuses) {
    if (!projectIds.length || !teamIds.length)
        return teamIds;
    const allowed = new Set();
    const tasks = await database_1.default.task.findMany({
        where: {
            projectId: { in: projectIds },
            deletedAt: null,
            status: { in: activeTaskStatuses },
            OR: [
                { assignedEmployeeId: { in: teamIds } },
                { assignments: { some: { employeeId: { in: teamIds } } } },
            ],
        },
        select: {
            assignedEmployeeId: true,
            assignments: { where: { employeeId: { in: teamIds } }, select: { employeeId: true } },
        },
    });
    for (const t of tasks) {
        if (t.assignedEmployeeId)
            allowed.add(t.assignedEmployeeId);
        for (const a of t.assignments)
            allowed.add(a.employeeId);
    }
    const members = await database_1.default.projectAssignment.findMany({
        where: { projectId: { in: projectIds }, employeeId: { in: teamIds } },
        select: { employeeId: true },
    });
    for (const m of members)
        allowed.add(m.employeeId);
    return teamIds.filter((id) => allowed.has(id));
}
/** Full team for workload: org hierarchy + project assignees. */
async function getManagerTeamUserIds(managerUserId, managerEmail) {
    const [orgIds, projectIds] = await Promise.all([
        getManagedEmployeeIdsFromOrg(managerUserId),
        getProjectTeamEmployeeIds(managerUserId, managerEmail),
    ]);
    const merged = new Set([...orgIds, ...projectIds]);
    merged.delete(managerUserId);
    return [...merged];
}
function peerSharesCompanyContext(actorCompanyIds, actorCompanyText, peerCompanyRecords, peerCompanyText) {
    if (actorCompanyIds.size > 0 &&
        peerCompanyRecords.some((record) => actorCompanyIds.has(record.id))) {
        return true;
    }
    if (!actorCompanyText || !peerCompanyText)
        return false;
    const actorAliases = new Set((0, company_name_aliases_1.buildCompanyNameAliases)(actorCompanyText).map((alias) => alias.toLowerCase()));
    return (0, company_name_aliases_1.buildCompanyNameAliases)(peerCompanyText).some((alias) => actorAliases.has(alias.toLowerCase()));
}
/** Other project managers in the same company — for read-only peer workload viewing. */
async function listPeerProjectManagersForWorkload(actorUserId) {
    const [actorRecords, actor] = await Promise.all([
        (0, companyAccess_service_1.resolveEmployeeCompanyRecords)(actorUserId),
        database_1.default.user.findUnique({
            where: { id: actorUserId },
            select: { company: true },
        }),
    ]);
    const actorCompanyIds = new Set(actorRecords.map((record) => record.id));
    const actorCompanyText = actor?.company?.trim() ?? '';
    const candidates = await database_1.default.user.findMany({
        where: {
            isActive: true,
            role: { in: ['MANAGER', 'PROJECT_MANAGER'] },
            id: { not: actorUserId },
        },
        select: { id: true, firstName: true, lastName: true, company: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    const peers = [];
    for (const candidate of candidates) {
        const peerRecords = await (0, companyAccess_service_1.resolveEmployeeCompanyRecords)(candidate.id);
        const peerCompanyText = candidate.company?.trim() ?? '';
        if (!peerSharesCompanyContext(actorCompanyIds, actorCompanyText, peerRecords, peerCompanyText)) {
            continue;
        }
        const firstName = candidate.firstName?.trim() || '';
        const lastName = candidate.lastName?.trim() || '';
        peers.push({
            id: candidate.id,
            firstName,
            lastName,
            fullName: [firstName, lastName].filter(Boolean).join(' ') || 'Project manager',
        });
    }
    return peers;
}
async function resolvePeerProjectManagerView(actorUserId, viewAsProjectManagerId) {
    const trimmed = viewAsProjectManagerId?.trim();
    if (!trimmed || trimmed === actorUserId) {
        return { managerUserId: actorUserId, readOnly: false, viewingManager: null };
    }
    const peers = await listPeerProjectManagersForWorkload(actorUserId);
    const target = peers.find((peer) => peer.id === trimmed);
    if (!target) {
        throw new Error('You cannot view that project manager\'s workload');
    }
    return {
        managerUserId: trimmed,
        readOnly: true,
        viewingManager: target,
    };
}
//# sourceMappingURL=managerTeam.service.js.map