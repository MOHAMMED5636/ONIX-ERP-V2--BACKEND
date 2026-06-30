import prisma from '../config/database';
import {
  CompanyStatus,
  DepartmentStatus,
  Prisma,
  TaskEffortType,
  TaskPriority,
  TaskStatus,
  UserRole,
} from '@prisma/client';
import { resolveCompanyAccessScope, resolveEmployeeCompanyRecords } from './companyAccess.service';
import {
  filterTeamIdsByProjects,
  getManagerProjects,
  getManagerTeamUserIds,
  isManagerWorkloadRole,
  resolvePeerProjectManagerView,
  type PeerProjectManagerOption,
} from './managerTeam.service';
import { buildCompanyScopeAliases } from '../utils/company-name-aliases';
import {
  WORKLOAD_VISIBLE_TASK_STATUSES,
  buildAnalysisReasons,
  computeUtilizationPercent,
  DEFAULT_WORKLOAD_SETTINGS,
  deriveScheduleStatus,
  effortTypeLabel,
  formatWorkloadCalendarDate,
  parseFloorsFactor,
  priorityLabel,
  resolveMonitoringCoefficient,
  buildTaskDisplayId,
  computeCompletionStarRating,
  deriveTaskCompletionScheduleVariant,
  getWorkerStatus,
  scheduleStatusBonus,
  scheduleStatusLabel,
  taskAnalyticsContributionScore,
  workerStatusColor,
  type WorkerStatusLabel,
  type WorkloadAnalyticsSettings,
  type WorkloadStatusColor,
} from '../utils/workload.utils';

export type WorkloadSettings = WorkloadAnalyticsSettings;

export type WorkloadTaskRow = {
  id: string;
  taskDisplayId: string;
  referenceNumber: string | null;
  stableWorkSeq: number | null;
  title: string;
  weight: number;
  type: string;
  effortType: TaskEffortType;
  priority: TaskPriority;
  priorityLabel: string;
  status: TaskStatus;
  contribution: number;
  /** Points actually added to employee total (0 until status is Completed). */
  scoreContribution: number;
  dueDate: string | null;
  completedAt: string | null;
  planDays: number | null;
  floors: number;
  isSubtask: boolean;
  projectId: string;
  isDelayed: boolean;
  scheduleBonus: number;
  scheduleStatusLabel: string | null;
};

export type WorkloadAnalysis = {
  fullFocusTasks: number;
  highPriorityTasks: number;
  delayedTasks: number;
  activeSubtasks: number;
  utilizationPercent: number;
  reasons: string[];
};

export type EmployeePerformance = {
  managerRating: number | null;
  scheduleStatus: 'on_track' | 'at_risk' | 'delayed';
  scheduleOnTimePercent: number;
  completionQuality: number | null;
  totalXp: number;
  starCount: number;
  /** (completed assigned tasks ÷ total assigned) × 5 — matches project-table rating scale. */
  completionStarRating: number;
  assignedTasksTotal: number;
  assignedTasksCompleted: number;
};

export type EmployeeWorkloadRow = {
  employeeId: string;
  userId: string;
  name: string;
  department: string | null;
  jobTitle: string | null;
  workloadScore: number;
  /** Pending open-task load as % of points capacity. */
  utilizationPercent: number;
  /** Completed-task points as % of points capacity (reference only). */
  completedUtilizationPercent: number;
  /** Active open tasks right now (display capacity). */
  employeeCapacity: number;
  /** Points cap from workload settings (utilization denominator). */
  pointsCapacity: number;
  pendingLoad: number;
  workerStatus: WorkerStatusLabel;
  statusColor: WorkloadStatusColor;
  activeTasksCount: number;
  activeProjectsCount: number;
  mainTaskCount: number;
  subtaskCount: number;
  fullFocusCount: number;
  monitoringCount: number;
  performance: EmployeePerformance;
  analysis: WorkloadAnalysis;
  tasks: WorkloadTaskRow[];
  /** Performance-only fields at top level for backward compatibility */
  starCount: number;
  totalXp: number;
  completionStarRating: number;
  assignedTasksTotal: number;
  assignedTasksCompleted: number;
  companyId?: string;
  companyName?: string;
  departmentId?: string;
  departmentName?: string;
};

export type ReassignRecommendation = {
  fromEmployeeId: string;
  fromEmployeeName: string;
  toEmployeeId: string;
  toEmployeeName: string;
  taskId: string;
  taskTitle: string;
  taskContribution: number;
  reason: string;
};

function dec(v: unknown, fallback: number): number {
  if (v == null) return fallback;
  const n =
    typeof v === 'object' && v !== null && 'toNumber' in v
      ? (v as { toNumber: () => number }).toNumber()
      : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function int(v: unknown, fallback: number): number {
  const n = dec(v, fallback);
  return Math.max(1, Math.round(n));
}

export async function getWorkloadSettings(): Promise<WorkloadSettings> {
  const row = await prisma.organizationPreferences.findFirst({
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
    monitoringCoefficient: resolveMonitoringCoefficient(row?.workloadMonitoringCoefficient),
    subtaskCoefficient: dec(
      row?.workloadSubtaskCoefficient,
      DEFAULT_WORKLOAD_SETTINGS.subtaskCoefficient,
    ),
    defaultPlannedDays: int(
      row?.workloadDefaultPlannedDays,
      DEFAULT_WORKLOAD_SETTINGS.defaultPlannedDays,
    ),
    employeeCapacity: dec(
      row?.workloadEmployeeCapacity,
      DEFAULT_WORKLOAD_SETTINGS.employeeCapacity,
    ),
    overloadUtilizationPercent: dec(
      row?.workloadOverloadUtilizationPercent,
      DEFAULT_WORKLOAD_SETTINGS.overloadUtilizationPercent,
    ),
    balancedUtilizationMin: dec(
      row?.workloadBalancedUtilizationMin,
      DEFAULT_WORKLOAD_SETTINGS.balancedUtilizationMin,
    ),
    availableUtilizationMax: dec(
      row?.workloadAvailableUtilizationMax,
      DEFAULT_WORKLOAD_SETTINGS.availableUtilizationMax,
    ),
    overloadThreshold: dec(
      row?.workloadOverloadThreshold,
      DEFAULT_WORKLOAD_SETTINGS.overloadThreshold,
    ),
    balancedMin: dec(row?.workloadBalancedMin, DEFAULT_WORKLOAD_SETTINGS.balancedMin),
    availableMax: dec(row?.workloadAvailableMax, DEFAULT_WORKLOAD_SETTINGS.availableMax),
  };
}

const visibleTaskStatusFilter: TaskStatus[] = [...WORKLOAD_VISIBLE_TASK_STATUSES];
const inProgressStatusFilter: TaskStatus[] = [
  TaskStatus.IN_PROGRESS,
  TaskStatus.SUBMITTED_IN_PROGRESS,
];

const assignedTaskStatusFilter: TaskStatus[] = [
  TaskStatus.PENDING,
  TaskStatus.IN_PROGRESS,
  TaskStatus.SUBMITTED_IN_PROGRESS,
  TaskStatus.COMPLETED,
  TaskStatus.ON_HOLD,
];

function assigneeTaskWhere(userId: string): Prisma.TaskWhereInput {
  return {
    OR: [
      { assignedEmployeeId: userId },
      { assignments: { some: { employeeId: userId } } },
    ],
    status: { in: assignedTaskStatusFilter },
  };
}

async function fetchAssigneeTaskCompletionStats(userId: string): Promise<{
  assignedTasksTotal: number;
  assignedTasksCompleted: number;
  completionStarRating: number;
}> {
  const where = assigneeTaskWhere(userId);
  const [assignedTasksTotal, assignedTasksCompleted] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.count({ where: { ...where, status: TaskStatus.COMPLETED } }),
  ]);
  return {
    assignedTasksTotal,
    assignedTasksCompleted,
    completionStarRating: computeCompletionStarRating(
      assignedTasksCompleted,
      assignedTasksTotal,
    ),
  };
}

/** Batch overall rating (completion stars) for employee directory lists. */
export async function fetchCompletionStatsBatch(userIds: string[]): Promise<
  Map<
    string,
    {
      assignedTasksTotal: number;
      assignedTasksCompleted: number;
      completionStarRating: number;
      overallRating: number;
    }
  >
> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const pairs = await Promise.all(
    unique.map(async (userId) => {
      const stats = await fetchAssigneeTaskCompletionStats(userId);
      return [
        userId,
        {
          ...stats,
          overallRating: stats.completionStarRating,
        },
      ] as const;
    }),
  );
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
} as const;

async function fetchActiveTasksForUser(userId: string) {
  return prisma.task.findMany({
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

function dedupeTasksById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

async function computeEmployeePerformance(
  userId: string,
  userXp: { totalXp: number; starCount: number },
  completionStats: {
    assignedTasksTotal: number;
    assignedTasksCompleted: number;
    completionStarRating: number;
  },
): Promise<EmployeePerformance> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const completed = await prisma.task.findMany({
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
  const managerRating =
    rated.length > 0
      ? Math.round((rated.reduce((s, t) => s + t.rating, 0) / rated.length) * 10) / 10
      : null;
  const completionQuality = managerRating;

  let onTime = 0;
  let withDue = 0;
  for (const t of completed) {
    if (t.dueDate && t.completedAt) {
      withDue += 1;
      if (t.completedAt <= t.dueDate) onTime += 1;
    }
  }
  const scheduleOnTimePercent =
    withDue > 0 ? Math.round((onTime / withDue) * 100) : 100;

  return {
    managerRating,
    scheduleStatus: deriveScheduleStatus(scheduleOnTimePercent),
    scheduleOnTimePercent,
    completionQuality,
    totalXp: userXp.totalXp,
    starCount: userXp.starCount,
    completionStarRating: completionStats.completionStarRating,
    assignedTasksTotal: completionStats.assignedTasksTotal,
    assignedTasksCompleted: completionStats.assignedTasksCompleted,
  };
}

function mapTaskRow(
  t: {
    id: string;
    title: string;
    status: TaskStatus;
    effortType: TaskEffortType;
    taskWeight: number;
    priority: TaskPriority;
    dueDate: Date | null;
    completedAt: Date | null;
    planDays: number | null;
    referenceNumber: string | null;
    stableWorkSeq: number | null;
    project: { planDays: number | null; projectNumber: number };
    projectFloor: string | null;
    parentTaskId: string | null;
    parentTask?: { stableWorkSeq: number | null } | null;
    projectId: string;
  },
  cfg: WorkloadSettings,
  now: Date,
): { row: WorkloadTaskRow; contribution: number } {
  const scheduleVariant =
    t.status === TaskStatus.COMPLETED
      ? deriveTaskCompletionScheduleVariant(
          t.dueDate,
          t.completedAt ?? now,
        )
      : null;
  const scheduleBonusPts = scheduleStatusBonus(scheduleVariant);

  const contribution = taskAnalyticsContributionScore(
    {
      taskWeight: t.taskWeight,
      effortType: t.effortType,
      priority: t.priority,
      projectFloor: t.projectFloor,
      planDays: t.planDays ?? t.project?.planDays ?? null,
      parentTaskId: t.parentTaskId,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      taskStatus: t.status,
    },
    cfg,
  );
  const isDelayed = Boolean(t.dueDate && t.dueDate < now);

  return {
    contribution,
    row: {
      id: t.id,
      taskDisplayId: buildTaskDisplayId({
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
      type: effortTypeLabel(t.effortType),
      effortType: t.effortType,
      priority: t.priority,
      priorityLabel: priorityLabel(t.priority),
      status: t.status,
      contribution,
      scoreContribution: t.status === TaskStatus.COMPLETED ? contribution : 0,
      dueDate: t.dueDate ? formatWorkloadCalendarDate(t.dueDate) : null,
      completedAt: t.completedAt ? formatWorkloadCalendarDate(t.completedAt) : null,
      planDays: t.planDays,
      floors: parseFloorsFactor(t.projectFloor),
      isSubtask: Boolean(t.parentTaskId),
      projectId: t.projectId,
      isDelayed,
      scheduleBonus: scheduleBonusPts,
      scheduleStatusLabel: scheduleStatusLabel(scheduleVariant),
    },
  };
}

export type ComputeEmployeeWorkloadOptions = {
  projectIds?: string[];
};

export async function computeEmployeeWorkload(
  userId: string,
  settings?: WorkloadSettings,
  options?: ComputeEmployeeWorkloadOptions,
): Promise<EmployeeWorkloadRow | null> {
  const cfg = settings ?? (await getWorkloadSettings());
  const user = await prisma.user.findUnique({
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
  if (!user || !user.isActive) return null;

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
  const projectIds = new Set<string>();

  const tasks: WorkloadTaskRow[] = rawTasks.map((t) => {
    const { row, contribution } = mapTaskRow(t, cfg, now);
    const countsForScore = t.status === TaskStatus.COMPLETED;
    if (countsForScore) {
      workloadScore += contribution;
    }
    projectIds.add(t.projectId);
    const isOpen = t.status !== TaskStatus.COMPLETED;
    if (isOpen) {
      pendingLoad += contribution;
      if (t.effortType === TaskEffortType.MONITORING) monitoringCount += 1;
      else fullFocusCount += 1;
      if (t.parentTaskId) subtaskCount += 1;
      else mainTaskCount += 1;
      if (t.priority === TaskPriority.HIGH || t.priority === TaskPriority.URGENT) {
        highPriorityTasks += 1;
      }
      if (row.isDelayed) delayedTasks += 1;
    }
    return row;
  });

  workloadScore = Math.round(workloadScore * 100) / 100;
  pendingLoad = Math.round(pendingLoad * 100) / 100;
  const openTasksCount = tasks.filter((t) => t.status !== TaskStatus.COMPLETED).length;
  const pointsCapacity = cfg.employeeCapacity;
  const utilizationPercent = computeUtilizationPercent(pendingLoad, pointsCapacity);
  const completedUtilizationPercent = computeUtilizationPercent(
    workloadScore,
    pointsCapacity,
  );
  const workerStatus = getWorkerStatus(openTasksCount, utilizationPercent);

  const analysis: WorkloadAnalysis = {
    fullFocusTasks: fullFocusCount,
    highPriorityTasks,
    delayedTasks,
    activeSubtasks: subtaskCount,
    utilizationPercent,
    reasons: buildAnalysisReasons({
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
  const performance = await computeEmployeePerformance(
    userId,
    {
      totalXp: user.totalXp,
      starCount: user.starCount,
    },
    completionStats,
  );

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
    statusColor: workerStatusColor(openTasksCount, utilizationPercent),
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

export function buildReassignRecommendations(
  employees: EmployeeWorkloadRow[],
  settings: WorkloadSettings,
): ReassignRecommendation[] {
  const overloaded = employees
    .filter((e) => e.workerStatus === 'Overloaded' || e.statusColor === 'red')
    .sort((a, b) => b.utilizationPercent - a.utilizationPercent);

  const available = employees
    .filter(
      (e) =>
        e.workerStatus === 'Available' ||
        e.workerStatus === 'Moderate' ||
        e.statusColor === 'blue' ||
        e.statusColor === 'yellow',
    )
    .sort((a, b) => a.utilizationPercent - b.utilizationPercent);

  if (!overloaded.length || !available.length) return [];

  const recommendations: ReassignRecommendation[] = [];
  let targetIdx = 0;

  for (const from of overloaded) {
    const movable = [...from.tasks]
      .filter((t) => t.status !== TaskStatus.COMPLETED)
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
      if (recommendations.length >= 12) return recommendations;
    }
  }

  return recommendations;
}

type DeptWithCompany = {
  id: string;
  name: string;
  companyId: string;
  company: { id: string; name: string; parentCompanyId: string | null };
};

const normDeptKey = (s: string) => s.trim().toLowerCase();

async function buildDepartmentEmployeeWhere(
  dept: DeptWithCompany,
): Promise<Prisma.UserWhereInput | null> {
  let parentName: string | null = null;
  if (dept.company.parentCompanyId) {
    const parent = await prisma.company.findUnique({
      where: { id: dept.company.parentCompanyId },
      select: { name: true },
    });
    parentName = parent?.name?.trim() || null;
  }

  const companyAliases = buildCompanyScopeAliases(dept.company.name, parentName);
  const employeeDirectoryBase: Prisma.UserWhereInput = {
    role: { notIn: [UserRole.TENDER_ENGINEER] },
    isActive: true,
    ...(companyAliases.length > 0
      ? {
          OR: companyAliases.map((n) => ({
            company: { equals: n, mode: 'insensitive' as const },
          })),
        }
      : { company: { equals: dept.company.name, mode: 'insensitive' as const } }),
  };

  const subs = await prisma.subDepartment.findMany({
    where: { departmentId: dept.id },
    select: { id: true, name: true },
  });
  const subIds = subs.map((s) => s.id);
  const positions =
    subIds.length === 0
      ? []
      : await prisma.position.findMany({
          where: { subDepartmentId: { in: subIds } },
          select: { id: true, subDepartmentId: true },
        });
  const positionIdsBySubId = new Map<string, string[]>();
  for (const p of positions) {
    const arr = positionIdsBySubId.get(p.subDepartmentId) ?? [];
    arr.push(p.id);
    positionIdsBySubId.set(p.subDepartmentId, arr);
  }

  const clauses: Prisma.UserWhereInput[] = [];
  const seen = new Set<string>();
  const pushDeptString = (raw: string) => {
    const t = raw?.trim();
    if (!t) return;
    const k = normDeptKey(t);
    if (seen.has(k)) return;
    seen.add(k);
    clauses.push({ department: { equals: t, mode: 'insensitive' } });
  };
  pushDeptString(dept.name);
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
  if (clauses.length === 0) return null;

  return {
    AND: [employeeDirectoryBase, { OR: clauses }],
  };
}

async function findUserIdsForDepartment(dept: DeptWithCompany): Promise<string[]> {
  const where = await buildDepartmentEmployeeWhere(dept);
  if (!where) return [];
  const users = await prisma.user.findMany({
    where,
    select: { id: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  return users.map((u) => u.id);
}

async function resolveMatrixDepartments(
  actorUserId: string,
  actorRole: string | undefined,
  companyIds?: string[],
  departmentIds?: string[],
): Promise<DeptWithCompany[]> {
  const access = await resolveCompanyAccessScope(actorUserId, actorRole);

  let allowedCompanyIds: string[];
  if (access.unrestricted) {
    if (companyIds?.length) {
      allowedCompanyIds = companyIds;
    } else {
      const all = await prisma.company.findMany({
        where: { status: CompanyStatus.ACTIVE },
        select: { id: true },
      });
      allowedCompanyIds = all.map((c) => c.id);
    }
  } else if (companyIds?.length) {
    allowedCompanyIds = companyIds.filter((id) => access.companyIds.includes(id));
  } else {
    allowedCompanyIds = access.companyIds;
  }

  if (allowedCompanyIds.length === 0) return [];

  const where: Prisma.DepartmentWhereInput = {
    companyId: { in: allowedCompanyIds },
    status: DepartmentStatus.ACTIVE,
  };
  if (departmentIds?.length) {
    where.id = { in: departmentIds };
  }

  return prisma.department.findMany({
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

export type WorkloadProjectOption = {
  id: string;
  name: string;
  projectNumber: number | null;
  referenceNumber: string | null;
};

async function resolveOrganizationProjects(): Promise<WorkloadProjectOption[]> {
  return prisma.project.findMany({
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

async function resolveManagerCompanyContext(actorUserId: string): Promise<{
  id: string;
  name: string;
  displayName: string;
  tag: string | null;
} | null> {
  const matches = await resolveEmployeeCompanyRecords(actorUserId);
  if (matches.length > 0) {
    const pick = matches[0];
    return {
      id: pick.id,
      name: pick.name,
      displayName: pick.name,
      tag: pick.tag,
    };
  }

  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { company: true, companyLocation: true },
  });
  const companyText = actor?.company?.trim();
  if (!companyText) return null;

  const location = String(actor?.companyLocation || '').trim();
  const locLower = location.toLowerCase();
  let displayName = companyText;
  if (location && !companyText.toLowerCase().includes('dubai') && locLower.includes('dubai')) {
    displayName = `${companyText.replace(/\s*-\s*$/g, '').trim()} Dubai`;
  } else if (location && !companyText.toLowerCase().includes('abu') && locLower.includes('abu')) {
    displayName = `${companyText.replace(/\s*-\s*$/g, '').trim()} Abu Dhabi`;
  }

  return { id: '', name: companyText, displayName, tag: null };
}

export async function getWorkloadMatrix(options: {
  actorUserId: string;
  actorRole: string | undefined;
  companyIds?: string[];
  departmentIds?: string[];
  projectIds?: string[];
  viewAsProjectManagerId?: string;
}): Promise<{
  companies: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string; companyId: string; companyName: string }>;
  projects: WorkloadProjectOption[];
  appliedFilters: { companyIds: string[]; departmentIds: string[]; projectIds: string[] };
  settings: WorkloadSettings;
  employees: EmployeeWorkloadRow[];
  recommendations: ReassignRecommendation[];
  scope?: 'manager_team' | 'organization';
  managerCompany?: { id: string; name: string; displayName: string; tag: string | null } | null;
  readOnly?: boolean;
  viewingManager?: PeerProjectManagerOption | null;
}> {
  const settings = await getWorkloadSettings();

  if (isManagerWorkloadRole(options.actorRole)) {
    const peerView = await resolvePeerProjectManagerView(
      options.actorUserId,
      options.viewAsProjectManagerId,
    );
    const effectiveManagerId = peerView.managerUserId;

    const actor = await prisma.user.findUnique({
      where: { id: effectiveManagerId },
      select: { email: true },
    });
    const managerCompany = await resolveManagerCompanyContext(effectiveManagerId);
    let teamIds = await getManagerTeamUserIds(effectiveManagerId, actor?.email);
    const managerProjects = await getManagerProjects(effectiveManagerId, actor?.email);
    const projectFilter = options.projectIds?.length ? options.projectIds : undefined;

    if (projectFilter) {
      teamIds = await filterTeamIdsByProjects(teamIds, projectFilter, [...WORKLOAD_VISIBLE_TASK_STATUSES]);
    }

    if (options.departmentIds?.length) {
      const depts = await prisma.department.findMany({
        where: { id: { in: options.departmentIds } },
        select: { name: true },
      });
      const deptNames = new Set(depts.map((d) => d.name.trim().toLowerCase()));
      if (deptNames.size > 0) {
        const users = await prisma.user.findMany({
          where: { id: { in: teamIds } },
          select: { id: true, department: true },
        });
        teamIds = users
          .filter(
            (u) => u.department && deptNames.has(u.department.trim().toLowerCase()),
          )
          .map((u) => u.id);
      }
    }

    const managedDepts = await prisma.department.findMany({
      where: { managerId: effectiveManagerId, status: DepartmentStatus.ACTIVE },
      select: {
        id: true,
        name: true,
        companyId: true,
        company: { select: { id: true, name: true } },
      },
    });

    const rows: EmployeeWorkloadRow[] = [];
    for (const userId of teamIds) {
      const row = await computeEmployeeWorkload(userId, settings, { projectIds: projectFilter });
      if (row) rows.push(row);
    }

    const teamMeta =
      teamIds.length > 0
        ? await prisma.user.findMany({
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

    const companyMap = new Map<string, { id: string; name: string }>();
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

  const departments = await resolveMatrixDepartments(
    options.actorUserId,
    options.actorRole,
    options.companyIds,
    options.departmentIds,
  );

  const projects = await resolveOrganizationProjects();
  const projectFilter = options.projectIds?.length ? options.projectIds : undefined;

  const userDeptMap = new Map<string, DeptWithCompany>();

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
    const filteredIds = new Set(
      await filterTeamIdsByProjects(allUserIds, projectFilter, [...WORKLOAD_VISIBLE_TASK_STATUSES]),
    );
    userEntries = userEntries.filter(([id]) => filteredIds.has(id));
  }

  const rows: EmployeeWorkloadRow[] = [];
  for (const [userId, dept] of userEntries) {
    const row = await computeEmployeeWorkload(userId, settings, { projectIds: projectFilter });
    if (!row) continue;
    rows.push({
      ...row,
      companyId: dept.companyId,
      companyName: dept.company.name,
      departmentId: dept.id,
      departmentName: dept.name,
    });
  }

  rows.sort((a, b) => b.utilizationPercent - a.utilizationPercent);

  const companyMap = new Map<string, string>();
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

export async function getDepartmentWorkloadMatrix(
  departmentId: string,
): Promise<{
  department: { id: string; name: string };
  settings: WorkloadSettings;
  employees: EmployeeWorkloadRow[];
  recommendations: ReassignRecommendation[];
} | null> {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: {
      id: true,
      name: true,
      status: true,
      companyId: true,
      company: { select: { id: true, name: true, parentCompanyId: true } },
    },
  });
  if (!dept || dept.status !== DepartmentStatus.ACTIVE) return null;

  const settings = await getWorkloadSettings();
  const userIds = await findUserIdsForDepartment(dept);

  const rows: EmployeeWorkloadRow[] = [];
  for (const userId of userIds) {
    const row = await computeEmployeeWorkload(userId, settings);
    if (!row) continue;
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

export async function getEmployeeWorkloadProfile(userId: string) {
  const settings = await getWorkloadSettings();
  const workload = await computeEmployeeWorkload(userId, settings);
  if (!workload) return null;

  const [overdueCount, inProgressCount, pendingCount, projectLinks] = await Promise.all([
    prisma.task.count({
      where: {
        OR: [
          { assignedEmployeeId: userId },
          { assignments: { some: { employeeId: userId } } },
        ],
        status: { in: visibleTaskStatusFilter.filter((s) => s !== TaskStatus.COMPLETED) },
        dueDate: { lt: new Date() },
      },
    }),
    prisma.task.count({
      where: {
        OR: [
          { assignedEmployeeId: userId },
          { assignments: { some: { employeeId: userId } } },
        ],
        status: { in: inProgressStatusFilter },
      },
    }),
    prisma.task.count({
      where: {
        OR: [
          { assignedEmployeeId: userId },
          { assignments: { some: { employeeId: userId } } },
        ],
        status: TaskStatus.PENDING,
      },
    }),
    prisma.projectAssignment.findMany({
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
    role: 'MEMBER' as const,
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
export async function resolveDepartmentIdsForUsers(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, department: { not: null } },
    select: { department: true },
  });
  const deptNames = [...new Set(users.map((u) => u.department).filter(Boolean))] as string[];
  if (!deptNames.length) return [];

  const depts = await prisma.department.findMany({
    where: { name: { in: deptNames, mode: 'insensitive' } },
    select: { id: true },
  });
  return depts.map((d) => d.id);
}
