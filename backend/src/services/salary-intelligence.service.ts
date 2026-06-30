import { Prisma, UserRole } from '@prisma/client';
import prisma from '../config/database';
import { buildCompanyScopedUserFilter } from '../utils/attendance-manual-entry';

type IntelligenceViewer = { id: string; role: string; department?: string | null };

export type SalaryIntelligenceQuery = {
  year?: number;
  month?: number;
  companyId?: string;
};

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const EXEC_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
const FINANCE_ROLES = new Set(['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN', 'HR']);
const FULL_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'HR', 'ACCOUNTANT']);

export function resolveIntelligenceAccessLevel(role: string): 'executive' | 'finance' | 'hr' | 'manager' | 'none' {
  if (EXEC_ROLES.has(role)) return 'executive';
  if (role === 'ACCOUNTANT') return 'finance';
  if (role === 'HR') return 'hr';
  if (role === 'PROJECT_MANAGER' || role === 'MANAGER') return 'manager';
  return 'none';
}

export function canViewSalaryIntelligence(role: string): boolean {
  return resolveIntelligenceAccessLevel(role) !== 'none';
}

async function buildEmployeeScope(
  viewer: IntelligenceViewer,
  companyId?: string,
): Promise<Prisma.UserWhereInput> {
  const and: Prisma.UserWhereInput[] = [
    { role: { notIn: [UserRole.CONTRACTOR, UserRole.TENDER_ENGINEER] } },
  ];

  if (companyId) {
    const companyFilter = await buildCompanyScopedUserFilter(companyId);
    if (companyFilter) and.push(companyFilter);
  }

  const access = resolveIntelligenceAccessLevel(viewer.role);
  if (access === 'manager' && viewer.department) {
    and.push({
      OR: [
        { department: viewer.department },
        { managerId: viewer.id },
      ],
    });
  }

  return { AND: and };
}

async function listScopedEmployees(viewer: IntelligenceViewer, companyId?: string) {
  const where = await buildEmployeeScope(viewer, companyId);
  return prisma.user.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      employeeId: true,
      department: true,
      jobTitle: true,
      company: true,
      joiningDate: true,
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
}

function personName(u: { firstName: string | null; lastName: string | null; email: string | null }) {
  const n = `${u.firstName || ''} ${u.lastName || ''}`.trim();
  return n || u.email || '—';
}

export async function getSalaryIntelligenceDashboard(
  viewer: IntelligenceViewer,
  query: SalaryIntelligenceQuery,
) {
  const now = new Date();
  const year = query.year ?? now.getFullYear();
  const month = query.month ?? now.getMonth() + 1;

  const employees = await listScopedEmployees(viewer, query.companyId);
  const employeeIds = employees.map((e) => e.id);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const structures = employeeIds.length
    ? await prisma.salaryStructure.findMany({
        where: { employeeId: { in: employeeIds }, effectiveFrom: { lte: monthEnd } },
        orderBy: [{ employeeId: 'asc' }, { effectiveFrom: 'desc' }],
        include: {
          increments: { orderBy: { effectiveDate: 'asc' } },
          allowances: true,
          deductions: true,
        },
      })
    : [];

  const latestStructureByEmployee = new Map<string, (typeof structures)[0]>();
  for (const s of structures) {
    if (!latestStructureByEmployee.has(s.employeeId)) {
      latestStructureByEmployee.set(s.employeeId, s);
    }
  }

  const monthlyLines = employeeIds.length
    ? await prisma.salaryMonthlyLine.findMany({
        where: { year, month, employeeId: { in: employeeIds } },
      })
    : [];

  const payrollRun = await prisma.payrollRun.findFirst({
    where: { periodYear: year, periodMonth: month },
    include: {
      lines: employeeIds.length ? { where: { employeeId: { in: employeeIds } } } : true,
      approvals: { include: { approvedBy: { select: { firstName: true, lastName: true, email: true } } } },
      auditLogs: {
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { performedBy: { select: { firstName: true, lastName: true, email: true } } },
      },
    },
  });

  const payrollTrend = await prisma.payrollRun.findMany({
    where: {
      periodYear: year,
      ...(month ? { periodMonth: { lte: month } } : {}),
    },
    orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
    take: 12,
    select: {
      periodYear: true,
      periodMonth: true,
      totalGross: true,
      totalDeductions: true,
      totalNet: true,
      totalEmployees: true,
      status: true,
    },
  });

  const salaryAuditLogs = await prisma.salaryAuditLog.findMany({
    where: {
      salaryStructure: employeeIds.length ? { employeeId: { in: employeeIds } } : undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: 40,
    include: {
      performedBy: { select: { firstName: true, lastName: true, email: true } },
      salaryStructure: {
        select: {
          employeeId: true,
          basicSalary: true,
          employee: { select: { firstName: true, lastName: true, employeeId: true, email: true } },
        },
      },
    },
  });

  let totalBasic = 0;
  let totalContract = 0;
  let withStructure = 0;
  const departmentMap = new Map<
    string,
    { department: string; headcount: number; basicTotal: number; paidTotal: number; contractTotal: number }
  >();
  const distributionBuckets = [
    { label: '< 3K', min: 0, max: 3000, count: 0 },
    { label: '3K–5K', min: 3000, max: 5000, count: 0 },
    { label: '5K–8K', min: 5000, max: 8000, count: 0 },
    { label: '8K–12K', min: 8000, max: 12000, count: 0 },
    { label: '12K+', min: 12000, max: Infinity, count: 0 },
  ];

  const employeeSummaries = employees.map((emp) => {
    const structure = latestStructureByEmployee.get(emp.id);
    const line = monthlyLines.find((l) => l.employeeId === emp.id);
    const basic = toNum(structure?.basicSalary);
    const contract = toNum(structure?.contractSalaryAmount);
    const paid = toNum(line?.paidSalary ?? line?.totalSalary);
    const dept = emp.department?.trim() || 'Unassigned';

    if (structure) {
      withStructure += 1;
      totalBasic += basic;
      totalContract += contract;
    }

    const bucket = distributionBuckets.find((b) => basic >= b.min && basic < b.max);
    if (bucket && basic > 0) bucket.count += 1;

    const deptRow = departmentMap.get(dept) || {
      department: dept,
      headcount: 0,
      basicTotal: 0,
      paidTotal: 0,
      contractTotal: 0,
    };
    deptRow.headcount += 1;
    deptRow.basicTotal += basic;
    deptRow.paidTotal += paid;
    deptRow.contractTotal += contract;
    departmentMap.set(dept, deptRow);

    return {
      id: emp.id,
      employeeNo: emp.employeeId || '',
      name: personName(emp),
      department: dept,
      jobTitle: emp.jobTitle || '',
      basicSalary: basic || null,
      contractSalary: contract || null,
      paidSalary: paid || null,
      hasStructure: Boolean(structure),
      structureId: structure?.id ?? null,
    };
  });

  const incrementEvents: Array<{
    id: string;
    employeeId: string;
    employeeName: string;
    department: string;
    effectiveDate: string;
    incrementType: string;
    amount: number;
    note: string | null;
  }> = [];

  for (const s of structures) {
    const emp = employees.find((e) => e.id === s.employeeId);
    if (!emp) continue;
    for (const inc of s.increments) {
      incrementEvents.push({
        id: inc.id,
        employeeId: s.employeeId,
        employeeName: personName(emp),
        department: emp.department?.trim() || 'Unassigned',
        effectiveDate: inc.effectiveDate.toISOString(),
        incrementType: inc.incrementType,
        amount: toNum(inc.amount),
        note: inc.note,
      });
    }
  }
  incrementEvents.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));

  const actualPayroll = payrollRun ? toNum(payrollRun.totalNet) : monthlyLines.reduce((s, l) => s + toNum(l.paidSalary), 0);
  const budgetPayroll = totalContract > 0 ? totalContract : totalBasic;
  const variance = round2(actualPayroll - budgetPayroll);
  const variancePct = budgetPayroll > 0 ? round2((variance / budgetPayroll) * 100) : 0;

  const trendNets = payrollTrend.map((r) => toNum(r.totalNet));
  const forecastNext =
    trendNets.length >= 2
      ? round2(trendNets[trendNets.length - 1] + (trendNets[trendNets.length - 1] - trendNets[trendNets.length - 2]))
      : actualPayroll;

  const payrollBreakdown = payrollRun
    ? {
        gross: toNum(payrollRun.totalGross),
        deductions: toNum(payrollRun.totalDeductions),
        net: toNum(payrollRun.totalNet),
        employees: payrollRun.totalEmployees,
        status: payrollRun.status,
      }
    : {
        gross: monthlyLines.reduce((s, l) => s + toNum(l.totalSalary), 0),
        deductions: monthlyLines.reduce(
          (s, l) => s + toNum(l.otherDeductions) + toNum((l.worksheetData as Record<string, unknown>)?.lateDeduction),
          0,
        ),
        net: actualPayroll,
        employees: monthlyLines.length,
        status: 'SHEET_ONLY',
      };

  const accessLevel = resolveIntelligenceAccessLevel(viewer.role);

  return {
    accessLevel,
    filters: { year, month, companyId: query.companyId || null },
    kpis: {
      headcount: employees.length,
      withSalaryStructure: withStructure,
      avgBasicSalary: withStructure > 0 ? round2(totalBasic / withStructure) : 0,
      totalPayrollCost: round2(actualPayroll),
      budgetPayroll: round2(budgetPayroll),
      budgetVariance: variance,
      budgetVariancePct: variancePct,
      incrementCountYtd: incrementEvents.filter((e) => e.effectiveDate.startsWith(String(year))).length,
      forecastNextMonth: forecastNext,
      openPayslipDisputes: employeeIds.length
        ? await prisma.salaryPayslipRequest.count({
            where: { employeeId: { in: employeeIds }, status: 'OPEN', year, month },
          })
        : 0,
    },
    departmentBreakdown: [...departmentMap.values()]
      .map((d) => ({
        ...d,
        basicTotal: round2(d.basicTotal),
        paidTotal: round2(d.paidTotal),
        contractTotal: round2(d.contractTotal),
        avgBasic: d.headcount > 0 ? round2(d.basicTotal / d.headcount) : 0,
      }))
      .sort((a, b) => b.paidTotal - a.paidTotal),
    salaryDistribution: distributionBuckets,
    payrollCostTrend: payrollTrend.map((r) => ({
      label: `${r.periodYear}-${String(r.periodMonth).padStart(2, '0')}`,
      year: r.periodYear,
      month: r.periodMonth,
      gross: toNum(r.totalGross),
      deductions: toNum(r.totalDeductions),
      net: toNum(r.totalNet),
      employees: r.totalEmployees,
      status: r.status,
    })),
    budgetVsActual: {
      budget: round2(budgetPayroll),
      actual: round2(actualPayroll),
      variance,
      variancePct,
    },
    incrementAnalytics: {
      totalIncrements: incrementEvents.length,
      totalIncrementAmount: round2(incrementEvents.reduce((s, e) => s + e.amount, 0)),
      byType: Object.entries(
        incrementEvents.reduce<Record<string, number>>((acc, e) => {
          acc[e.incrementType] = (acc[e.incrementType] || 0) + e.amount;
          return acc;
        }, {}),
      ).map(([type, amount]) => ({ type, amount: round2(amount) })),
      recent: incrementEvents.slice(0, 25),
    },
    employees: employeeSummaries,
    auditLogs: [
      ...salaryAuditLogs.map((log) => ({
        id: log.id,
        source: 'salary' as const,
        action: log.action,
        createdAt: log.createdAt.toISOString(),
        performedBy: log.performedBy ? personName(log.performedBy) : null,
        employeeName: log.salaryStructure?.employee
          ? personName(log.salaryStructure.employee)
          : null,
        employeeNo: log.salaryStructure?.employee?.employeeId || null,
        details: log.details,
      })),
      ...(payrollRun?.auditLogs || []).map((log) => ({
        id: log.id,
        source: 'payroll' as const,
        action: log.action,
        createdAt: log.createdAt.toISOString(),
        performedBy: log.performedBy ? personName(log.performedBy) : null,
        employeeName: null,
        employeeNo: null,
        details: log.details,
      })),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50),
    approvals: (payrollRun?.approvals || []).map((a) => ({
      id: a.id,
      stage: a.stage,
      rejected: a.rejected,
      decidedAt: a.approvedAt?.toISOString() ?? null,
      approver: a.approvedBy ? personName(a.approvedBy) : null,
      notes: a.comments || a.rejectionReason,
    })),
    forecast: {
      method: 'linear_trend',
      nextMonthNet: forecastNext,
      ytdNet: round2(trendNets.reduce((s, n) => s + n, 0)),
      monthsIncluded: payrollTrend.length,
    },
  };
}

export async function getEmployeeSalaryIntelligenceDetail(
  viewer: IntelligenceViewer,
  employeeId: string,
  query: SalaryIntelligenceQuery,
) {
  const scope = await buildEmployeeScope(viewer, query.companyId);
  const employee = await prisma.user.findFirst({
    where: { id: employeeId, ...scope },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      employeeId: true,
      department: true,
      jobTitle: true,
      company: true,
      joiningDate: true,
      role: true,
    },
  });

  if (!employee) return null;

  const structures = await prisma.salaryStructure.findMany({
    where: { employeeId },
    orderBy: { effectiveFrom: 'desc' },
    include: {
      allowances: true,
      deductions: true,
      increments: { orderBy: { effectiveDate: 'desc' } },
      auditLogs: {
        orderBy: { createdAt: 'desc' },
        include: { performedBy: { select: { firstName: true, lastName: true, email: true } } },
      },
    },
  });

  const monthlyHistory = await prisma.salaryMonthlyLine.findMany({
    where: { employeeId },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    take: 24,
  });

  const payrollHistory = await prisma.payrollLine.findMany({
    where: { employeeId },
    orderBy: { createdAt: 'desc' },
    take: 24,
    include: {
      payrollRun: {
        select: { periodYear: true, periodMonth: true, status: true },
      },
    },
  });

  const payslipRequests = await prisma.salaryPayslipRequest.findMany({
    where: { employeeId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const changeLogs = await prisma.employeeChangeLog.findMany({
    where: {
      employeeId,
      OR: [
        { fieldKey: { contains: 'salary', mode: 'insensitive' } },
        { fieldKey: { contains: 'pay', mode: 'insensitive' } },
        { fieldLabel: { contains: 'salary', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { changedBy: { select: { firstName: true, lastName: true, email: true } } },
  });

  const latest = structures[0] ?? null;
  const historyPoints = monthlyHistory
    .map((l) => ({
      label: `${l.year}-${String(l.month).padStart(2, '0')}`,
      year: l.year,
      month: l.month,
      paid: toNum(l.paidSalary ?? l.totalSalary),
      basic: toNum(l.totalSalary),
    }))
    .reverse();

  return {
    employee: {
      id: employee.id,
      name: personName(employee),
      employeeNo: employee.employeeId,
      department: employee.department,
      jobTitle: employee.jobTitle,
      company: employee.company,
      joiningDate: employee.joiningDate?.toISOString() ?? null,
    },
    currentStructure: latest
      ? {
          id: latest.id,
          effectiveFrom: latest.effectiveFrom.toISOString(),
          basicSalary: toNum(latest.basicSalary),
          perHourRate: toNum(latest.perHourRate),
          contractSalaryAmount: toNum(latest.contractSalaryAmount),
          notes: latest.notes,
          allowances: latest.allowances.map((a) => ({
            type: a.allowanceType,
            amount: toNum(a.amount),
            notes: a.notes,
          })),
          deductions: latest.deductions.map((d) => ({
            type: d.deductionType,
            mode: d.mode,
            value: toNum(d.value),
            notes: d.notes,
          })),
        }
      : null,
    salaryHistory: historyPoints,
    structures: structures.map((s) => ({
      id: s.id,
      effectiveFrom: s.effectiveFrom.toISOString(),
      basicSalary: toNum(s.basicSalary),
      contractSalaryAmount: toNum(s.contractSalaryAmount),
      incrementCount: s.increments.length,
    })),
    increments: structures.flatMap((s) =>
      s.increments.map((inc) => ({
        id: inc.id,
        structureId: s.id,
        effectiveDate: inc.effectiveDate.toISOString(),
        type: inc.incrementType,
        amount: toNum(inc.amount),
        note: inc.note,
      })),
    ),
    payrollImpact: payrollHistory.map((line) => ({
      id: line.id,
      period: `${line.payrollRun.periodYear}-${String(line.payrollRun.periodMonth).padStart(2, '0')}`,
      status: line.payrollRun.status,
      gross: toNum(line.grossSalary),
      deductions: toNum(line.totalDeductions),
      net: toNum(line.netSalary),
    })),
    auditTrail: [
      ...structures.flatMap((s) =>
        s.auditLogs.map((log) => ({
          id: log.id,
          source: 'salary_structure',
          action: log.action,
          at: log.createdAt.toISOString(),
          by: log.performedBy ? personName(log.performedBy) : null,
          details: log.details,
        })),
      ),
      ...changeLogs.map((log) => ({
        id: log.id,
        source: 'employee_change',
        action: log.fieldLabel || log.fieldKey,
        at: log.createdAt.toISOString(),
        by: log.changedBy ? personName(log.changedBy) : null,
        details: { oldValue: log.oldValue, newValue: log.newValue, reason: log.reason },
      })),
    ].sort((a, b) => b.at.localeCompare(a.at)),
    payslipRequests: payslipRequests.map((r) => ({
      id: r.id,
      year: r.year,
      month: r.month,
      status: r.status,
      message: r.message,
      hrResponse: r.hrResponse,
      createdAt: r.createdAt.toISOString(),
    })),
    promotionImpact: structures.length >= 2
      ? {
          previousBasic: toNum(structures[1].basicSalary),
          currentBasic: toNum(structures[0].basicSalary),
          changeAmount: round2(toNum(structures[0].basicSalary) - toNum(structures[1].basicSalary)),
          changePct:
            toNum(structures[1].basicSalary) > 0
              ? round2(
                  ((toNum(structures[0].basicSalary) - toNum(structures[1].basicSalary)) /
                    toNum(structures[1].basicSalary)) *
                    100,
                )
              : null,
        }
      : null,
  };
}
