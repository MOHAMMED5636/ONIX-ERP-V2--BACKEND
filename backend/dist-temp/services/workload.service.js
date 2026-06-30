"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWorkloadSettings = getWorkloadSettings;
exports.fetchCompletionStatsBatch = fetchCompletionStatsBatch;
exports.computeEmployeeWorkload = computeEmployeeWorkload;
exports.buildReassignRecommendations = buildReassignRecommendations;
exports.getWorkloadMatrix = getWorkloadMatrix;
exports.getDepartmentWorkloadMatrix = getDepartmentWorkloadMatrix;
exports.getEmployeeWorkloadProfile = getEmployeeWorkloadProfile;
exports.resolveDepartmentIdsForUsers = resolveDepartmentIdsForUsers;
const database_1 = __importDefault(require("../config/database"));
const client_1 = require("@prisma/client");
const companyAccess_service_1 = require("./companyAccess.service");
const managerTeam_service_1 = require("./managerTeam.service");
const company_name_aliases_1 = require("../utils/company-name-aliases");
const workload_utils_1 = require("../utils/workload.utils");
function dec(v, fallback) {
    if (v == null)
        return fallback;
    const n = typeof v === 'object' && v !== null && 'toNumber' in v
        ? v.toNumber()
        : Number(v);
    return Number.isFinite(n) ? n : fallback;
}
function int(v, fallback) {
    const n = dec(v, fallback);
    return Math.max(1, Math.round(n));
}
async function getWorkloadSettings() {
    const row = await database_1.default.organizationPreferences.findFirst({
        select: {
            workloadMonitoringCoefficient: true,
            workloadSubtaskCoefficient: true,
            workloadDefaultPlannedDays: true,
            workloadEmployeeCapacity: true,
            workloadOverloadUtilizationPercent: true,
            workloadBalancedUtilizationMin: true,
            workloadAvailableUtilizationMax: true,
            workloadOverloadThreshold: true,
            workloadBalancedMin: true,
            workloadAvailableMax: true,
        },
    });
    return {
        monitoringCoefficient: (0, workload_utils_1.resolveMonitoringCoefficient)(row?.workloadMonitoringCoefficient),
        subtaskCoefficient: dec(row?.workloadSubtaskCoefficient, workload_utils_1.DEFAULT_WORKLOAD_SETTINGS.subtaskCoefficient),
        defaultPlannedDays: int(row?.workloadDefaultPlannedDays, workload_utils_1.DEFAULT_WORKLOAD_SETTINGS.defaultPlannedDays),
        employeeCapacity: dec(row?.workloadEmployeeCapacity, workload_utils_1.DEFAULT_WORKLOAD_SETTINGS.employeeCapacity),
        overloadUtilizationPercent: dec(row?.workloadOverloadUtilizationPercent, workload_utils_1.DEFAULT_WORKLOAD_SETTINGS.overloadUtilizationPercent),
        balancedUtilizationMin: dec(row?.workloadBalancedUtilizationMin, workload_utils_1.DEFAULT_WORKLOAD_SETTINGS.balancedUtilizationMin),
        availableUtilizationMax: dec(row?.workloadAvailableUtilizationMax, workload_utils_1.DEFAULT_WORKLOAD_SETTINGS.availableUtilizationMax),
        overloadThreshold: dec(row?.workloadOverloadThreshold, workload_utils_1.DEFAULT_WORKLOAD_SETTINGS.overloadThreshold),
        balancedMin: dec(row?.workloadBalancedMin, workload_utils_1.DEFAULT_WORKLOAD_SETTINGS.balancedMin),
        availableMax: dec(row?.workloadAvailableMax, workload_utils_1.DEFAULT_WORKLOAD_SETTINGS.availableMax),
    };
}
const visibleTaskStatusFilter = [...workload_utils_1.WORKLOAD_VISIBLE_TASK_STATUSES];
const inProgressStatusFilter = [
    client_1.TaskStatus.IN_PROGRESS,
    client_1.TaskStatus.SUBMITTED_IN_PROGRESS,
];
const assignedTaskStatusFilter = [
    client_1.TaskStatus.PENDING,
    client_1.TaskStatus.IN_PROGRESS,
    client_1.TaskStatus.SUBMITTED_IN_PROGRESS,
    client_1.TaskStatus.COMPLETED,
    client_1.TaskStatus.ON_HOLD,
];
function assigneeTaskWhere(userId) {
    return {
        OR: [
            { assignedEmployeeId: userId },
            { assignments: { some: { employeeId: userId } } },
        ],
        status: { in: assignedTaskStatusFilter },
    };
}
async function fetchAssigneeTaskCompletionStats(userId) {
    const where = assigneeTaskWhere(userId);
    const [assignedTasksTotal, assignedTasksCompleted] = await Promise.all([
        database_1.default.task.count({ where }),
        database_1.default.task.count({ where: { ...where, status: client_1.TaskStatus.COMPLETED } }),
    ]);
    return {
        assignedTasksTotal,
        assignedTasksCompleted,
        completionStarRating: (0, workload_utils_1.computeCompletionStarRating)(assignedTasksCompleted, assignedTasksTotal),
    };
}
/** Batch overall rating (completion stars) for employee directory lists. */
async function fetchCompletionStatsBatch(userIds) {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (unique.length === 0)
        return new Map();
    const pairs = await Promise.all(unique.map(async (userId) => {
        const stats = await fetchAssigneeTaskCompletionStats(userId);
        return [
            userId,
            {
                ...stats,
                overallRating: stats.completionStarRating,
            },
        ];
    }));
    return new Map(pairs);
}
const taskSelectFields = {
    id: true,
    title: true,
    status: true,
    effortType: true,
    taskWeight: true,
    priority: true,
    dueDate: true,
    planDays: true,
    projectFloor: true,
    parentTaskId: true,
    projectId: true,
    assignedEmployeeId: true,
    referenceNumber: true,
    stableWorkSeq: true,
    completedAt: true,
};
async function fetchActiveTasksForUser(userId) {
    return database_1.default.task.findMany({
        where: {
            status: { in: visibleTaskStatusFilter },
            OR: [
                { assignedEmployeeId: userId },
                {
                    assignments: {
                        some: {
                            employeeId: userId,
                            status: { in: ['PENDING', 'IN_PROGRESS'] },
                        },
                    },
                },
            ],
        },
        select: {
            ...taskSelectFields,
            parentTask: {
                select: { stableWorkSeq: true },
            },
            project: {
                select: { planDays: true, projectNumber: true },
            },
        },
        orderBy: [{ taskWeight: 'desc' }, { dueDate: 'asc' }],
    });
}
function dedupeTasksById(rows) {
    const seen = new Set();
    const out = [];
    for (const r of rows) {
        if (seen.has(r.id))
            continue;
        seen.add(r.id);
        out.push(r);
    }
    return out;
}
async function computeEmployeePerformance(userId, userXp, completionStats) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const completed = await database_1.default.task.findMany({
        where: {
            OR: [
                { assignedEmployeeId: userId },
                { assignments: { some: { employeeId: userId } } },
            ],
            status: 'COMPLETED',
            completedAt: { gte: ninetyDaysAgo },
        },
        select: { rating: true, dueDate: true, completedAt: true },
    });
    const rated = completed.filter((t) => t.rating > 0);
    const managerRating = rated.length > 0
        ? Math.round((rated.reduce((s, t) => s + t.rating, 0) / rated.length) * 10) / 10
        : null;
    const completionQuality = managerRating;
    let onTime = 0;
    let withDue = 0;
    for (const t of completed) {
        if (t.dueDate && t.completedAt) {
            withDue += 1;
            if (t.completedAt <= t.dueDate)
                onTime += 1;
        }
    }
    const scheduleOnTimePercent = withDue > 0 ? Math.round((onTime / withDue) * 100) : 100;
    return {
        managerRating,
        scheduleStatus: (0, workload_utils_1.deriveScheduleStatus)(scheduleOnTimePercent),
        scheduleOnTimePercent,
        completionQuality,
        totalXp: userXp.totalXp,
        starCount: userXp.starCount,
        completionStarRating: completionStats.completionStarRating,
        assignedTasksTotal: completionStats.assignedTasksTotal,
        assignedTasksCompleted: completionStats.assignedTasksCompleted,
    };
}
function mapTaskRow(t, cfg, now) {
    const scheduleVariant = t.status === client_1.TaskStatus.COMPLETED
        ? (0, workload_utils_1.deriveTaskCompletionScheduleVariant)(t.dueDate, t.completedAt ?? now)
        : null;
    const scheduleBonusPts = (0, workload_utils_1.scheduleStatusBonus)(scheduleVariant);
    const contribution = (0, workload_utils_1.taskAnalyticsContributionScore)({
        taskWeight: t.taskWeight,
        effortType: t.effortType,
        priority: t.priority,
        projectFloor: t.projectFloor,
        planDays: t.planDays ?? t.project?.planDays ?? null,
        parentTaskId: t.parentTaskId,
        dueDate: t.dueDate,
        completedAt: t.completedAt,
        taskStatus: t.status,
    }, cfg);
    const isDelayed = Boolean(t.dueDate && t.dueDate < now);
    return {
        contribution,
        row: {
            id: t.id,
            taskDisplayId: (0, workload_utils_1.buildTaskDisplayId)({
                referenceNumber: t.referenceNumber,
                stableWorkSeq: t.stableWorkSeq,
                parentTaskId: t.parentTaskId,
                parentStableWorkSeq: t.parentTask?.stableWorkSeq ?? null,
                projectNumber: t.project.projectNumber,
            }),
            referenceNumber: t.referenceNumber,
            stableWorkSeq: t.stableWorkSeq,
            title: t.title,
            weight: t.taskWeight,
            type: (0, workload_utils_1.effortTypeLabel)(t.effortType),
            effortType: t.effortType,
            priority: t.priority,
            priorityLabel: (0, workload_utils_1.priorityLabel)(t.priority),
            status: t.status,
            contribution,
            scoreContribution: t.status === client_1.TaskStatus.COMPLETED ? contribution : 0,
            dueDate: t.dueDate ? (0, workload_utils_1.formatWorkloadCalendarDate)(t.dueDate) : null,
            completedAt: t.completedAt ? (0, workload_utils_1.formatWorkloadCalendarDate)(t.completedAt) : null,
            planDays: t.planDays,
            floors: (0, workload_utils_1.parseFloorsFactor)(t.projectFloor),
            isSubtask: Boolean(t.parentTaskId),
            projectId: t.projectId,
            isDelayed,
            scheduleBonus: scheduleBonusPts,
            scheduleStatusLabel: (0, workload_utils_1.scheduleStatusLabel)(scheduleVariant),
        },
    };
}
async function computeEmployeeWorkload(userId, settings, options) {
    const cfg = settings ?? (await getWorkloadSettings());
    const user = await database_1.default.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            department: true,
            jobTitle: true,
            employeeId: true,
            totalXp: true,
            starCount: true,
            isActive: true,
        },
    });
    if (!user || !user.isActive)
        return null;
    const now = new Date();
    let rawTasks = dedupeTasksById(await fetchActiveTasksForUser(userId));
    if (options?.projectIds?.length) {
        const allowedProjects = new Set(options.projectIds);
        rawTasks = rawTasks.filter((t) => allowedProjects.has(t.projectId));
    }
    let workloadScore = 0;
    let pendingLoad = 0;
    let fullFocusCount = 0;
    let monitoringCount = 0;
    let mainTaskCount = 0;
    let subtaskCount = 0;
    let highPriorityTasks = 0;
    let delayedTasks = 0;
    const projectIds = new Set();
    const tasks = rawTasks.map((t) => {
        const { row, contribution } = mapTaskRow(t, cfg, now);
        const countsForScore = t.status === client_1.TaskStatus.COMPLETED;
        if (countsForScore) {
            workloadScore += contribution;
        }
        projectIds.add(t.projectId);
        const isOpen = t.status !== client_1.TaskStatus.COMPLETED;
        if (isOpen) {
            pendingLoad += contribution;
            if (t.effortType === client_1.TaskEffortType.MONITORING)
                monitoringCount += 1;
            else
                fullFocusCount += 1;
            if (t.parentTaskId)
                subtaskCount += 1;
            else
                mainTaskCount += 1;
            if (t.priority === client_1.TaskPriority.HIGH || t.priority === client_1.TaskPriority.URGENT) {
                highPriorityTasks += 1;
            }
            if (row.isDelayed)
                delayedTasks += 1;
        }
        return row;
    });
    workloadScore = Math.round(workloadScore * 100) / 100;
    pendingLoad = Math.round(pendingLoad * 100) / 100;
    const openTasksCount = tasks.filter((t) => t.status !== client_1.TaskStatus.COMPLETED).length;
    const pointsCapacity = cfg.employeeCapacity;
    const utilizationPercent = (0, workload_utils_1.computeUtilizationPercent)(pendingLoad, pointsCapacity);
    const completedUtilizationPercent = (0, workload_utils_1.computeUtilizationPercent)(workloadScore, pointsCapacity);
    const workerStatus = (0, workload_utils_1.getWorkerStatus)(openTasksCount, utilizationPercent);
    const analysis = {
        fullFocusTasks: fullFocusCount,
        highPriorityTasks,
        delayedTasks,
        activeSubtasks: subtaskCount,
        utilizationPercent,
        reasons: (0, workload_utils_1.buildAnalysisReasons)({
            openTasks: openTasksCount,
            utilizationPercent,
            workerStatus,
            fullFocusTasks: fullFocusCount,
            highPriorityTasks,
            delayedTasks,
            activeSubtasks: subtaskCount,
        }),
    };
    const completionStats = await fetchAssigneeTaskCompletionStats(userId);
    const performance = await computeEmployeePerformance(userId, {
        totalXp: user.totalXp,
        starCount: user.starCount,
    }, completionStats);
    return {
        employeeId: user.employeeId ?? user.id,
        userId: user.id,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.id,
        department: user.department,
        jobTitle: user.jobTitle,
        starCount: user.starCount,
        totalXp: user.totalXp,
        completionStarRating: completionStats.completionStarRating,
        assignedTasksTotal: completionStats.assignedTasksTotal,
        assignedTasksCompleted: completionStats.assignedTasksCompleted,
        workloadScore,
        utilizationPercent,
        completedUtilizationPercent,
        employeeCapacity: openTasksCount,
        pointsCapacity,
        pendingLoad,
        workerStatus,
        statusColor: (0, workload_utils_1.workerStatusColor)(openTasksCount, utilizationPercent),
        activeTasksCount: openTasksCount,
        activeProjectsCount: projectIds.size,
        mainTaskCount,
        subtaskCount,
        fullFocusCount,
        monitoringCount,
        performance,
        analysis,
        tasks,
    };
}
function buildReassignRecommendations(employees, settings) {
    const overloaded = employees
        .filter((e) => e.workerStatus === 'Overloaded' || e.statusColor === 'red')
        .sort((a, b) => b.utilizationPercent - a.utilizationPercent);
    const available = employees
        .filter((e) => e.workerStatus === 'Available' ||
        e.workerStatus === 'Moderate' ||
        e.statusColor === 'blue' ||
        e.statusColor === 'yellow')
        .sort((a, b) => a.utilizationPercent - b.utilizationPercent);
    if (!overloaded.length || !available.length)
        return [];
    const recommendations = [];
    let targetIdx = 0;
    for (const from of overloaded) {
        const movable = [...from.tasks]
            .filter((t) => t.status !== client_1.TaskStatus.COMPLETED)
            .sort((a, b) => b.contribution - a.contribution);
        for (const task of movable.slice(0, 2)) {
            const to = available[targetIdx % available.length];
            recommendations.push({
                fromEmployeeId: from.userId,
                fromEmployeeName: from.name,
                toEmployeeId: to.userId,
                toEmployeeName: to.name,
                taskId: task.id,
                taskTitle: task.title,
                taskContribution: task.contribution,
                reason: `Reassign "${task.title}" (load ${task.contribution}) from ${from.name} (${from.utilizationPercent}% util.) to ${to.name} (${to.utilizationPercent}% util.)`,
            });
            targetIdx += 1;
            if (recommendations.length >= 12)
                return recommendations;
        }
    }
    return recommendations;
}
const normDeptKey = (s) => s.trim().toLowerCase();
async function buildDepartmentEmployeeWhere(dept) {
    let parentName = null;
    if (dept.company.parentCompanyId) {
        const parent = await database_1.default.company.findUnique({
            where: { id: dept.company.parentCompanyId },
            select: { name: true },
        });
        parentName = parent?.name?.trim() || null;
    }
    const companyAliases = (0, company_name_aliases_1.buildCompanyScopeAliases)(dept.company.name, parentName);
    const employeeDirectoryBase = {
        role: { notIn: [client_1.UserRole.TENDER_ENGINEER] },
        isActive: true,
        ...(companyAliases.length > 0
            ? {
                OR: companyAliases.map((n) => ({
                    company: { equals: n, mode: 'insensitive' },
                })),
            }
            : { company: { equals: dept.company.name, mode: 'insensitive' } }),
    };
    const subs = await database_1.default.subDepartment.findMany({
        where: { departmentId: dept.id },
        select: { id: true, name: true },
    });
    const subIds = subs.map((s) => s.id);
    const positions = subIds.length === 0
        ? []
        : await database_1.default.position.findMany({
            where: { subDepartmentId: { in: subIds } },
            select: { id: true, subDepartmentId: true },
        });
    const positionIdsBySubId = new Map();
    for (const p of positions) {
        const arr = positionIdsBySubId.get(p.subDepartmentId) ?? [];
        arr.push(p.id);
        positionIdsBySubId.set(p.subDepartmentId, arr);
    }
    const clauses = [];
    const seen = new Set();
    const pushDeptString = (raw) => {
        const t = raw?.trim();
        if (!t)
            return;
        const k = normDeptKey(t);
        if (seen.has(k))
            return;
        seen.add(k);
        clauses.push({ department: { equals: t, mode: 'insensitive' } });
    };
    pushDeptString(dept.name);
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
    if (clauses.length === 0)
        return null;
    return {
        AND: [employeeDirectoryBase, { OR: clauses }],
    };
}
async function findUserIdsForDepartment(dept) {
    const where = await buildDepartmentEmployeeWhere(dept);
    if (!where)
        return [];
    const users = await database_1.default.user.findMany({
        where,
        select: { id: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return users.map((u) => u.id);
}
async function resolveMatrixDepartments(actorUserId, actorRole, companyIds, departmentIds) {
    const access = await (0, companyAccess_service_1.resolveCompanyAccessScope)(actorUserId, actorRole);
    let allowedCompanyIds;
    if (access.unrestricted) {
        if (companyIds?.length) {
            allowedCompanyIds = companyIds;
        }
        else {
            const all = await database_1.default.company.findMany({
                where: { status: client_1.CompanyStatus.ACTIVE },
                select: { id: true },
            });
            allowedCompanyIds = all.map((c) => c.id);
        }
    }
    else if (companyIds?.length) {
        allowedCompanyIds = companyIds.filter((id) => access.companyIds.includes(id));
    }
    else {
        allowedCompanyIds = access.companyIds;
    }
    if (allowedCompanyIds.length === 0)
        return [];
    const where = {
        companyId: { in: allowedCompanyIds },
        status: client_1.DepartmentStatus.ACTIVE,
    };
    if (departmentIds?.length) {
        where.id = { in: departmentIds };
    }
    return database_1.default.department.findMany({
        where,
        select: {
            id: true,
            name: true,
            companyId: true,
            company: { select: { id: true, name: true, parentCompanyId: true } },
        },
        orderBy: [{ company: { name: 'asc' } }, { name: 'asc' }],
    });
}
async function resolveOrganizationProjects() {
    return database_1.default.project.findMany({
        where: { deletedAt: null },
        select: {
            id: true,
            name: true,
            projectNumber: true,
            referenceNumber: true,
        },
        orderBy: [{ projectNumber: 'desc' }, { referenceNumber: 'asc' }, { name: 'asc' }],
    });
}
async function resolveManagerCompanyContext(actorUserId) {
    const matches = await (0, companyAccess_service_1.resolveEmployeeCompanyRecords)(actorUserId);
    if (matches.length > 0) {
        const pick = matches[0];
        return {
            id: pick.id,
            name: pick.name,
            displayName: pick.name,
            tag: pick.tag,
        };
    }
    const actor = await database_1.default.user.findUnique({
        where: { id: actorUserId },
        select: { company: true, companyLocation: true },
    });
    const companyText = actor?.company?.trim();
    if (!companyText)
        return null;
    const location = String(actor?.companyLocation || '').trim();
    const locLower = location.toLowerCase();
    let displayName = companyText;
    if (location && !companyText.toLowerCase().includes('dubai') && locLower.includes('dubai')) {
        displayName = `${companyText.replace(/\s*-\s*$/g, '').trim()} Dubai`;
    }
    else if (location && !companyText.toLowerCase().includes('abu') && locLower.includes('abu')) {
        displayName = `${companyText.replace(/\s*-\s*$/g, '').trim()} Abu Dhabi`;
    }
    return { id: '', name: companyText, displayName, tag: null };
}
async function getWorkloadMatrix(options) {
    const settings = await getWorkloadSettings();
    if ((0, managerTeam_service_1.isManagerWorkloadRole)(options.actorRole)) {
        const peerView = await (0, managerTeam_service_1.resolvePeerProjectManagerView)(options.actorUserId, options.viewAsProjectManagerId);
        const effectiveManagerId = peerView.managerUserId;
        const actor = await database_1.default.user.findUnique({
            where: { id: effectiveManagerId },
            select: { email: true },
        });
        const managerCompany = await resolveManagerCompanyContext(effectiveManagerId);
        let teamIds = await (0, managerTeam_service_1.getManagerTeamUserIds)(effectiveManagerId, actor?.email);
        const managerProjects = await (0, managerTeam_service_1.getManagerProjects)(effectiveManagerId, actor?.email);
        const projectFilter = options.projectIds?.length ? options.projectIds : undefined;
        if (projectFilter) {
            teamIds = await (0, managerTeam_service_1.filterTeamIdsByProjects)(teamIds, projectFilter, [...workload_utils_1.WORKLOAD_VISIBLE_TASK_STATUSES]);
        }
        if (options.departmentIds?.length) {
            const depts = await database_1.default.department.findMany({
                where: { id: { in: options.departmentIds } },
                select: { name: true },
            });
            const deptNames = new Set(depts.map((d) => d.name.trim().toLowerCase()));
            if (deptNames.size > 0) {
                const users = await database_1.default.user.findMany({
                    where: { id: { in: teamIds } },
                    select: { id: true, department: true },
                });
                teamIds = users
                    .filter((u) => u.department && deptNames.has(u.department.trim().toLowerCase()))
                    .map((u) => u.id);
            }
        }
        const managedDepts = await database_1.default.department.findMany({
            where: { managerId: effectiveManagerId, status: client_1.DepartmentStatus.ACTIVE },
            select: {
                id: true,
                name: true,
                companyId: true,
                company: { select: { id: true, name: true } },
            },
        });
        const rows = [];
        for (const userId of teamIds) {
            const row = await computeEmployeeWorkload(userId, settings, { projectIds: projectFilter });
            if (row)
                rows.push(row);
        }
        const teamMeta = teamIds.length > 0
            ? await database_1.default.user.findMany({
                where: { id: { in: teamIds } },
                select: { id: true, company: true, department: true },
            })
            : [];
        const teamMetaById = new Map(teamMeta.map((u) => [u.id, u]));
        const defaultCompanyName = managerCompany?.displayName || managerCompany?.name || '';
        for (const row of rows) {
            const meta = teamMetaById.get(row.userId);
            row.companyName = meta?.company?.trim() || defaultCompanyName || row.companyName;
            row.departmentName = meta?.department?.trim() || row.department || row.departmentName;
        }
        rows.sort((a, b) => b.utilizationPercent - a.utilizationPercent);
        const companyMap = new Map();
        for (const d of managedDepts) {
            companyMap.set(d.companyId, { id: d.companyId, name: d.company.name });
        }
        if (managerCompany?.name) {
            const key = managerCompany.id || managerCompany.name;
            companyMap.set(key, {
                id: managerCompany.id || key,
                name: managerCompany.displayName || managerCompany.name,
            });
        }
        return {
            companies: [...companyMap.values()],
            departments: managedDepts.map((d) => ({
                id: d.id,
                name: d.name,
                companyId: d.companyId,
                companyName: d.company.name,
            })),
            projects: managerProjects.map((p) => ({
                id: p.id,
                name: p.name,
                projectNumber: p.projectNumber,
                referenceNumber: p.referenceNumber,
            })),
            appliedFilters: {
                companyIds: [],
                departmentIds: options.departmentIds ?? [],
                projectIds: options.projectIds ?? [],
            },
            settings,
            employees: rows,
            recommendations: buildReassignRecommendations(rows, settings),
            scope: 'manager_team',
            managerCompany,
            readOnly: peerView.readOnly,
            viewingManager: peerView.viewingManager,
        };
    }
    const departments = await resolveMatrixDepartments(options.actorUserId, options.actorRole, options.companyIds, options.departmentIds);
    const projects = await resolveOrganizationProjects();
    const projectFilter = options.projectIds?.length ? options.projectIds : undefined;
    const userDeptMap = new Map();
    for (const dept of departments) {
        const userIds = await findUserIdsForDepartment(dept);
        for (const userId of userIds) {
            if (!userDeptMap.has(userId)) {
                userDeptMap.set(userId, dept);
            }
        }
    }
    let userEntries = [...userDeptMap.entries()];
    if (projectFilter?.length) {
        const allUserIds = userEntries.map(([id]) => id);
        const filteredIds = new Set(await (0, managerTeam_service_1.filterTeamIdsByProjects)(allUserIds, projectFilter, [...workload_utils_1.WORKLOAD_VISIBLE_TASK_STATUSES]));
        userEntries = userEntries.filter(([id]) => filteredIds.has(id));
    }
    const rows = [];
    for (const [userId, dept] of userEntries) {
        const row = await computeEmployeeWorkload(userId, settings, { projectIds: projectFilter });
        if (!row)
            continue;
        rows.push({
            ...row,
            companyId: dept.companyId,
            companyName: dept.company.name,
            departmentId: dept.id,
            departmentName: dept.name,
        });
    }
    rows.sort((a, b) => b.utilizationPercent - a.utilizationPercent);
    const companyMap = new Map();
    for (const d of departments) {
        companyMap.set(d.companyId, d.company.name);
    }
    return {
        companies: [...companyMap.entries()].map(([id, name]) => ({ id, name })),
        departments: departments.map((d) => ({
            id: d.id,
            name: d.name,
            companyId: d.companyId,
            companyName: d.company.name,
        })),
        projects,
        appliedFilters: {
            companyIds: options.companyIds ?? [],
            departmentIds: options.departmentIds ?? [],
            projectIds: options.projectIds ?? [],
        },
        settings,
        employees: rows,
        recommendations: buildReassignRecommendations(rows, settings),
        scope: 'organization',
    };
}
async function getDepartmentWorkloadMatrix(departmentId) {
    const dept = await database_1.default.department.findUnique({
        where: { id: departmentId },
        select: {
            id: true,
            name: true,
            status: true,
            companyId: true,
            company: { select: { id: true, name: true, parentCompanyId: true } },
        },
    });
    if (!dept || dept.status !== client_1.DepartmentStatus.ACTIVE)
        return null;
    const settings = await getWorkloadSettings();
    const userIds = await findUserIdsForDepartment(dept);
    const rows = [];
    for (const userId of userIds) {
        const row = await computeEmployeeWorkload(userId, settings);
        if (!row)
            continue;
        rows.push({
            ...row,
            companyId: dept.companyId,
            companyName: dept.company.name,
            departmentId: dept.id,
            departmentName: dept.name,
        });
    }
    rows.sort((a, b) => b.utilizationPercent - a.utilizationPercent);
    return {
        department: { id: dept.id, name: dept.name },
        settings,
        employees: rows,
        recommendations: buildReassignRecommendations(rows, settings),
    };
}
async function getEmployeeWorkloadProfile(userId) {
    const settings = await getWorkloadSettings();
    const workload = await computeEmployeeWorkload(userId, settings);
    if (!workload)
        return null;
    const [overdueCount, inProgressCount, pendingCount, projectLinks] = await Promise.all([
        database_1.default.task.count({
            where: {
                OR: [
                    { assignedEmployeeId: userId },
                    { assignments: { some: { employeeId: userId } } },
                ],
                status: { in: visibleTaskStatusFilter.filter((s) => s !== client_1.TaskStatus.COMPLETED) },
                dueDate: { lt: new Date() },
            },
        }),
        database_1.default.task.count({
            where: {
                OR: [
                    { assignedEmployeeId: userId },
                    { assignments: { some: { employeeId: userId } } },
                ],
                status: { in: inProgressStatusFilter },
            },
        }),
        database_1.default.task.count({
            where: {
                OR: [
                    { assignedEmployeeId: userId },
                    { assignments: { some: { employeeId: userId } } },
                ],
                status: client_1.TaskStatus.PENDING,
            },
        }),
        database_1.default.projectAssignment.findMany({
            where: { employeeId: userId },
            select: {
                project: { select: { id: true, name: true, status: true, projectManager: true } },
            },
        }),
    ]);
    const projects = projectLinks.map((p) => ({
        id: p.project.id,
        name: p.project.name,
        status: p.project.status,
        role: 'MEMBER',
    }));
    return {
        ...workload,
        taskCounters: {
            overdue: overdueCount,
            inProgress: inProgressCount,
            pending: pendingCount,
        },
        effortDistribution: {
            fullFocus: workload.fullFocusCount,
            monitoring: workload.monitoringCount,
        },
        activeProjects: projects,
    };
}
/** Resolve department IDs for users (for socket refresh targeting). */
async function resolveDepartmentIdsForUsers(userIds) {
    if (!userIds.length)
        return [];
    const users = await database_1.default.user.findMany({
        where: { id: { in: userIds }, department: { not: null } },
        select: { department: true },
    });
    const deptNames = [...new Set(users.map((u) => u.department).filter(Boolean))];
    if (!deptNames.length)
        return [];
    const depts = await database_1.default.department.findMany({
        where: { name: { in: deptNames, mode: 'insensitive' } },
        select: { id: true },
    });
    return depts.map((d) => d.id);
}
//# sourceMappingURL=workload.service.js.map