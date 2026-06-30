"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSubDepartmentManagerIds = resolveSubDepartmentManagerIds;
exports.syncEmployeeManagersFromSubDepartments = syncEmployeeManagersFromSubDepartments;
exports.findEmployeeUserIdsForSubDepartment = findEmployeeUserIdsForSubDepartment;
exports.syncEmployeesForSubDepartment = syncEmployeesForSubDepartment;
const database_1 = __importDefault(require("../config/database"));
function resolvePositionManagerId(position) {
    if (!position?.subDepartment?.managerId)
        return null;
    return position.subDepartment.managerId;
}
async function findPrimaryOrgPosition(user) {
    const posName = user.position?.trim() || user.jobTitle?.trim();
    if (!posName)
        return null;
    const deptName = user.department?.trim();
    if (deptName) {
        const matched = await database_1.default.position.findFirst({
            where: {
                name: { equals: posName, mode: 'insensitive' },
                OR: [
                    { subDepartment: { name: { equals: deptName, mode: 'insensitive' } } },
                    { subDepartment: { department: { name: { equals: deptName, mode: 'insensitive' } } } },
                ],
            },
            select: {
                id: true,
                subDepartment: { select: { id: true, managerId: true } },
            },
        });
        if (matched)
            return matched;
    }
    return database_1.default.position.findFirst({
        where: { name: { equals: posName, mode: 'insensitive' } },
        select: {
            id: true,
            subDepartment: { select: { id: true, managerId: true } },
        },
    });
}
/**
 * Collect sub-department manager IDs: primary org position first, then additional assignments.
 */
async function resolveSubDepartmentManagerIds(userId) {
    const user = await database_1.default.user.findUnique({
        where: { id: userId },
        select: { id: true, position: true, department: true, jobTitle: true },
    });
    if (!user)
        return [];
    const ordered = [];
    const seen = new Set();
    const add = (managerId) => {
        if (!managerId || managerId === userId || seen.has(managerId))
            return;
        seen.add(managerId);
        ordered.push(managerId);
    };
    const primary = await findPrimaryOrgPosition(user);
    add(resolvePositionManagerId(primary));
    const assignments = await database_1.default.employeePositionAssignment.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
            position: {
                select: {
                    id: true,
                    subDepartment: { select: { id: true, managerId: true } },
                },
            },
        },
    });
    for (const row of assignments) {
        if (primary && row.position.id === primary.id)
            continue;
        add(resolvePositionManagerId(row.position));
    }
    return ordered;
}
/**
 * Set managerId + secondLineManagerId from sub-department managers (reporting structure).
 */
async function syncEmployeeManagersFromSubDepartments(userId) {
    const managerIds = await resolveSubDepartmentManagerIds(userId);
    const nextManagerId = managerIds[0] ?? null;
    const nextSecond = managerIds[1] ?? null;
    const existing = await database_1.default.user.findUnique({
        where: { id: userId },
        select: { managerId: true, secondLineManagerId: true },
    });
    if (!existing) {
        return { managerId: nextManagerId, secondLineManagerId: nextSecond, changed: false };
    }
    if (managerIds.length === 0) {
        return {
            managerId: existing.managerId,
            secondLineManagerId: existing.secondLineManagerId,
            changed: false,
        };
    }
    const changed = existing.managerId !== nextManagerId ||
        existing.secondLineManagerId !== nextSecond;
    if (changed) {
        await database_1.default.user.update({
            where: { id: userId },
            data: {
                managerId: nextManagerId,
                secondLineManagerId: nextSecond,
            },
        });
    }
    return { managerId: nextManagerId, secondLineManagerId: nextSecond, changed };
}
async function findEmployeeUserIdsForSubDepartment(subDepartmentId) {
    const subDept = await database_1.default.subDepartment.findUnique({
        where: { id: subDepartmentId },
        include: {
            department: { select: { name: true } },
            positions: { select: { id: true, name: true } },
        },
    });
    if (!subDept)
        return [];
    const ids = new Set();
    const positionIds = subDept.positions.map((p) => p.id);
    const positionNames = subDept.positions.map((p) => p.name);
    const deptNames = [subDept.name, subDept.department?.name].filter(Boolean);
    if (positionIds.length > 0) {
        const assigned = await database_1.default.employeePositionAssignment.findMany({
            where: { positionId: { in: positionIds } },
            select: { userId: true },
        });
        for (const row of assigned)
            ids.add(row.userId);
    }
    if (positionNames.length > 0 && deptNames.length > 0) {
        const orClauses = positionNames.flatMap((name) => deptNames.map((dept) => ({
            position: { equals: name, mode: 'insensitive' },
            department: { equals: dept, mode: 'insensitive' },
        })));
        const primaryMatches = await database_1.default.user.findMany({
            where: { OR: orClauses },
            select: { id: true },
        });
        for (const row of primaryMatches)
            ids.add(row.id);
    }
    return [...ids];
}
async function syncEmployeesForSubDepartment(subDepartmentId) {
    const userIds = await findEmployeeUserIdsForSubDepartment(subDepartmentId);
    let count = 0;
    for (const userId of userIds) {
        const result = await syncEmployeeManagersFromSubDepartments(userId);
        if (result.changed)
            count += 1;
    }
    return count;
}
//# sourceMappingURL=employeeSubDepartmentManagers.service.js.map