import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { ProjectStatus, TaskPriority, TaskStatus, Prisma } from '@prisma/client';
import { PROJECT_IMPORT_SCHEMA } from '../config/projectImportSchema';
import { buildXlsxBuffer, importCellString, safeCellString } from '../utils/excel';
import { taskRowInvolvesEmployee } from '../utils/employee-task-involvement';
import { buildDisplayTaskId } from '../utils/task-display-id';
import { mapFrontendTaskStatusToEnum } from '../utils/taskStatusMap';

function normalizeErpRole(role: unknown): string {
  const r = String(role ?? '').trim().toUpperCase();
  if (r === 'PROJECT_MANAGER') return 'MANAGER';
  if (r === 'SUPER_ADMIN') return 'SUPER_ADMIN';
  return r;
}

function formatDateExport(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

function mapStatusToTaskStatus(status: unknown): TaskStatus {
  return mapFrontendTaskStatusToEnum(status);
}

function normalizeProjectStatusValue(status: unknown): ProjectStatus | undefined {
  if (status == null) return undefined;
  const s = String(status).trim().toUpperCase().replace(/[\s-]+/g, '_');
  const map: Record<string, ProjectStatus> = {
    OPEN: ProjectStatus.OPEN,
    IN_PROGRESS: ProjectStatus.IN_PROGRESS,
    SUBMITTED_IN_PROGRESS: ProjectStatus.SUBMITTED_IN_PROGRESS,
    ON_HOLD: ProjectStatus.ON_HOLD,
    COMPLETED: ProjectStatus.COMPLETED,
    CANCELLED: ProjectStatus.CANCELLED,
    CLOSED: ProjectStatus.CLOSED,
  };
  return map[s];
}

function mapPriority(v: string): TaskPriority | undefined {
  const s = (v || '').trim().toUpperCase();
  if (s === 'LOW' || s === 'MEDIUM' || s === 'HIGH' || s === 'URGENT') return s as TaskPriority;
  return undefined;
}

function taskStatusToLabel(status: TaskStatus): string {
  const map: Partial<Record<TaskStatus, string>> = {
    [TaskStatus.PENDING]: 'Not Started',
    [TaskStatus.IN_PROGRESS]: 'In Progress',
    [TaskStatus.SUBMITTED_IN_PROGRESS]: 'Submitted-IN PROGRESS',
    [TaskStatus.NOT_REQUIRED]: 'Not Required',
    [TaskStatus.COMPLETED]: 'Done',
    [TaskStatus.ON_HOLD]: 'On Hold',
    [TaskStatus.CANCELLED]: 'Cancelled',
  };
  return map[status] || String(status);
}

type FlatRow = Record<string, string>;

function flattenProjectToRows(project: any): FlatRow[] {
  const rows: FlatRow[] = [];
  const pn = project.projectNumber;
  const base = (extra: Partial<FlatRow>): FlatRow => ({
    rowType: '',
    projectNumber: String(pn),
    taskId: '',
    taskDbId: '',
    projectName: project.name || '',
    taskName: '',
    projectStatus: project.status || '',
    status: '',
    phase: '',
    priority: '',
    predecessors: '',
    assignedEmployeeEmail: '',
    startDate: '',
    dueDate: '',
    planDays: '',
    plotNumber: project.plotNumber || '',
    community: project.community || '',
    projectType: project.projectType || '',
    projectFloor: project.projectFloor || '',
    developerProject: project.developerProject || '',
    location: project.location || '',
    remarks: '',
    assigneeNotes: '',
    referenceNumber: project.referenceNumber || '',
    projectManager: project.projectManager || '',
    ...extra,
  });

  rows.push(
    base({
      rowType: 'PROJECT',
      projectStatus: project.status || '',
      startDate: formatDateExport(project.startDate),
      dueDate: formatDateExport(project.endDate || project.deadline),
      planDays: project.planDays != null ? String(project.planDays) : '',
      remarks: project.remarks || '',
      assigneeNotes: project.assigneeNotes || '',
    }),
  );

  const mainTasks = (project.tasks || []).filter((t: any) => !t.parentTaskId);
  for (const main of mainTasks) {
    const subtasks = main.subtasks || [];
    for (const sub of subtasks) {
      const subSeq = sub.stableWorkSeq ?? sub.taskOrder;
      rows.push(
        base({
          rowType: 'SUBTASK',
          taskId: buildDisplayTaskId(pn, subSeq, null),
          taskDbId: sub.id,
          taskName: sub.title || '',
          status: taskStatusToLabel(sub.status),
          phase: sub.category || '',
          priority: sub.priority || '',
          predecessors: sub.predecessors || '',
          assignedEmployeeEmail: sub.assignedEmployee?.email || '',
          startDate: formatDateExport(sub.startDate),
          dueDate: formatDateExport(sub.dueDate),
          planDays: sub.planDays != null ? String(sub.planDays) : '',
          plotNumber: sub.plotNumber || '',
          community: sub.community || '',
          projectType: sub.projectType || '',
          projectFloor: sub.projectFloor || '',
          developerProject: sub.developerProject || '',
          location: sub.location || '',
          remarks: sub.remarks || '',
          assigneeNotes: sub.assigneeNotes || '',
        }),
      );
      for (const child of sub.subtasks || []) {
        const childSeq = child.stableWorkSeq ?? child.taskOrder;
        rows.push(
          base({
            rowType: 'CHILD',
            taskId: buildDisplayTaskId(pn, subSeq, childSeq),
            taskDbId: child.id,
            taskName: child.title || '',
            status: taskStatusToLabel(child.status),
            phase: child.category || '',
            priority: child.priority || '',
            predecessors: child.predecessors || '',
            assignedEmployeeEmail: child.assignedEmployee?.email || '',
            startDate: formatDateExport(child.startDate),
            dueDate: formatDateExport(child.dueDate),
            planDays: child.planDays != null ? String(child.planDays) : '',
            plotNumber: child.plotNumber || '',
            community: child.community || '',
            projectType: child.projectType || '',
            projectFloor: child.projectFloor || '',
            developerProject: child.developerProject || '',
            location: child.location || '',
            remarks: child.remarks || '',
            assigneeNotes: child.assigneeNotes || '',
          }),
        );
      }
    }
  }
  return rows;
}

async function buildScopedProjectWhere(req: AuthRequest): Promise<Prisma.ProjectWhereInput> {
  const userRole = normalizeErpRole(req.user?.role);
  const userId = req.user?.id;
  if (!userId) return { id: { in: [] } };
  if (['ADMIN', 'SUPER_ADMIN', 'HR'].includes(userRole)) return {};

  if (userRole === 'EMPLOYEE') {
    const [employeeTasks, assignedProjects] = await Promise.all([
      prisma.task.findMany({
        where: taskRowInvolvesEmployee(userId),
        select: { projectId: true },
        distinct: ['projectId'],
      }),
      prisma.projectAssignment.findMany({
        where: { employeeId: userId },
        select: { projectId: true },
        distinct: ['projectId'],
      }),
    ]);
    const ids = Array.from(
      new Set([
        ...employeeTasks.map((t) => t.projectId).filter((id): id is string => !!id),
        ...assignedProjects.map((a) => a.projectId).filter((id): id is string => !!id),
      ]),
    );
    return ids.length ? { id: { in: ids } } : { id: { in: [] } };
  }

  if (userRole === 'MANAGER') {
    const managerUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const orConditions: Prisma.ProjectWhereInput[] = [{ createdBy: userId }];
    if (req.user?.email) {
      orConditions.push({ contracts: { some: { assignedManagerEmail: req.user.email } } });
    }
    orConditions.push({ contracts: { some: { assignedManagerId: userId } } });
    orConditions.push({
      tasks: {
        some: {
          OR: [
            { assignedEmployeeId: userId },
            { subtasks: { some: { assignedEmployeeId: userId } } },
            { subtasks: { some: { subtasks: { some: { assignedEmployeeId: userId } } } } },
          ],
        },
      },
    });
    if (managerUser) {
      const names: string[] = [];
      const fn = managerUser.firstName?.trim().toLowerCase();
      const ln = managerUser.lastName?.trim().toLowerCase();
      if (fn) names.push(fn);
      if (ln) names.push(ln);
      if (fn && ln) names.push(`${fn} ${ln}`);
      if (names.length) {
        orConditions.push({
          OR: names.map((name) => ({
            projectManager: { contains: name, mode: 'insensitive' },
          })),
        });
      }
    }
    return { OR: orConditions };
  }

  return {};
}

const PROJECT_EXPORT_INCLUDE = {
  tasks: {
    where: { parentTaskId: null },
    orderBy: [{ taskOrder: 'asc' }, { stableWorkSeq: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      subtasks: {
        orderBy: [{ taskOrder: 'asc' }, { stableWorkSeq: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          title: true,
          status: true,
          category: true,
          priority: true,
          predecessors: true,
          stableWorkSeq: true,
          taskOrder: true,
          startDate: true,
          dueDate: true,
          planDays: true,
          plotNumber: true,
          community: true,
          projectType: true,
          projectFloor: true,
          developerProject: true,
          location: true,
          remarks: true,
          assigneeNotes: true,
          assignedEmployee: { select: { email: true } },
          subtasks: {
            orderBy: [{ taskOrder: 'asc' }, { stableWorkSeq: 'asc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              title: true,
              status: true,
              category: true,
              priority: true,
              predecessors: true,
              stableWorkSeq: true,
              taskOrder: true,
              startDate: true,
              dueDate: true,
              planDays: true,
              plotNumber: true,
              community: true,
              projectType: true,
              projectFloor: true,
              developerProject: true,
              location: true,
              remarks: true,
              assigneeNotes: true,
              assignedEmployee: { select: { email: true } },
            },
          },
        },
      },
    },
  },
};

async function fetchProjectsForExport(req: AuthRequest) {
  const where = await buildScopedProjectWhere(req);
  return prisma.project.findMany({
    where,
    orderBy: { projectNumber: 'asc' },
    select: {
      id: true,
      projectNumber: true,
      name: true,
      referenceNumber: true,
      status: true,
      projectManager: true,
      startDate: true,
      endDate: true,
      deadline: true,
      planDays: true,
      plotNumber: true,
      community: true,
      projectType: true,
      projectFloor: true,
      developerProject: true,
      location: true,
      remarks: true,
      assigneeNotes: true,
      tasks: PROJECT_EXPORT_INCLUDE.tasks as any,
    },
  });
}

async function buildWorkbookFromRows(rows: FlatRow[], sheetName: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ONIX ERP';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 2 }] });
  const instr = wb.addWorksheet('Instructions');
  const labels = PROJECT_IMPORT_SCHEMA.map((f) => `${f.label}${f.required ? ' *' : ''}`);
  const keys = PROJECT_IMPORT_SCHEMA.map((f) => f.key);
  ws.addRow(labels);
  ws.addRow(keys);
  ws.getRow(2).hidden = true;
  for (const row of rows) {
    ws.addRow(keys.map((k) => row[k] ?? ''));
  }
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  PROJECT_IMPORT_SCHEMA.forEach((f, idx) => {
    ws.getColumn(idx + 1).width = Math.max(14, Math.min(36, (f.label.length || 10) + 8));
  });
  instr.addRow(['Project / Task Import & Export']);
  instr.getRow(1).font = { bold: true, size: 14 };
  instr.addRow([]);
  instr.addRow(['1) Row 1 = headers, row 2 = hidden keys (do not change). Data from row 3.']);
  instr.addRow(['2) PROJECT row: one per project. SUBTASK / CHILD rows: work items (Task ID like 2583-3-1).']);
  instr.addRow(['3) Keep Task DB Id unchanged when re-importing updates.']);
  instr.addRow(['4) Dates: YYYY-MM-DD. Task Status uses labels from the Main Table.']);
  instr.columns = [{ width: 100 }];
  return wb;
}

export const downloadProjectTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sample = PROJECT_IMPORT_SCHEMA.map((f) => f.sample || '');
    const wb = await buildWorkbookFromRows(
      [
        Object.fromEntries(
          PROJECT_IMPORT_SCHEMA.map((f, i) => [f.key, i === 0 ? 'SUBTASK' : sample[i] || '']),
        ) as FlatRow,
      ],
      'Project Tasks',
    );
    const buffer = await buildXlsxBuffer(wb);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="project-tasks-import-template.xlsx"');
    res.send(buffer);
  } catch (e: any) {
    console.error('downloadProjectTemplate error:', e);
    res.status(500).json({ success: false, message: 'Failed to generate template', error: e?.message });
  }
};

export const exportProjectsExcel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const projects = await fetchProjectsForExport(req);
    const rows = projects.flatMap((p) => flattenProjectToRows(p));
    const wb = await buildWorkbookFromRows(rows, 'Project Tasks');
    const buffer = await buildXlsxBuffer(wb);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="project-tasks-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    );
    res.send(buffer);
  } catch (e: any) {
    console.error('exportProjectsExcel error:', e);
    res.status(500).json({ success: false, message: 'Failed to export projects', error: e?.message });
  }
};

function parseDateOrNull(v: string): Date | null {
  const s = (v || '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    const d2 = new Date(year, month, day);
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
}

export const importProjectsExcel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file?.buffer) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet =
      workbook.Sheets['Project Tasks'] ||
      workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      res.status(400).json({ success: false, message: 'Invalid Excel file (no sheets)' });
      return;
    }

    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
    }) as any[][];
    if (!rows.length || rows.length < 2) {
      res.status(400).json({ success: false, message: 'File is empty' });
      return;
    }

    const headerKeys = (rows[1] || []).map((x) => safeCellString(x));
    const expectedKeys = PROJECT_IMPORT_SCHEMA.map((f) => f.key);
    if (headerKeys.join('|') !== expectedKeys.join('|')) {
      res.status(400).json({
        success: false,
        message:
          'Column headers do not match the current template. Download a fresh template and try again.',
      });
      return;
    }

    const dataRows = rows.slice(2);
    const errors: Array<{ rowNumber: number; field: string; message: string }> = [];
    let processed = 0;
    let updated = 0;
    let failed = 0;

    const scopedWhere = await buildScopedProjectWhere(req);

    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 3;
      const cells = dataRows[i] || [];
      const row: Record<string, string> = {};
      expectedKeys.forEach((key, idx) => {
        row[key] = importCellString(cells[idx]);
      });

      const rowType = row.rowType.toUpperCase();
      const pn = parseInt(row.projectNumber, 10);
      if (!rowType || !Number.isFinite(pn)) {
        if (cells.every((c) => !importCellString(c))) continue;
        errors.push({ rowNumber, field: 'rowType', message: 'Row Type and Project Number are required' });
        failed += 1;
        processed += 1;
        continue;
      }

      processed += 1;

      const project = await prisma.project.findFirst({
        where: { projectNumber: pn, ...scopedWhere },
        select: { id: true, projectNumber: true },
      });
      if (!project) {
        errors.push({ rowNumber, field: 'projectNumber', message: `Project ${pn} not found or not accessible` });
        failed += 1;
        continue;
      }

      try {
        if (rowType === 'PROJECT') {
          const data: Prisma.ProjectUpdateInput = {};
          if (row.projectName) data.name = row.projectName;
          const ps = normalizeProjectStatusValue(row.projectStatus);
          if (ps) data.status = ps;
          if (row.referenceNumber) data.referenceNumber = row.referenceNumber;
          if (row.projectManager) data.projectManager = row.projectManager;
          if (row.plotNumber) data.plotNumber = row.plotNumber;
          if (row.community) data.community = row.community;
          if (row.projectType) data.projectType = row.projectType;
          if (row.projectFloor) data.projectFloor = row.projectFloor;
          if (row.developerProject) data.developerProject = row.developerProject;
          if (row.location) data.location = row.location;
          if (row.remarks) data.remarks = row.remarks;
          if (row.assigneeNotes) data.assigneeNotes = row.assigneeNotes;
          if (row.startDate) data.startDate = parseDateOrNull(row.startDate);
          if (row.dueDate) data.endDate = parseDateOrNull(row.dueDate);
          if (row.planDays) {
            const pd = parseInt(row.planDays, 10);
            if (Number.isFinite(pd)) data.planDays = pd;
          }
          if (Object.keys(data).length) {
            await prisma.project.update({ where: { id: project.id }, data });
            updated += 1;
          }
        } else if (rowType === 'SUBTASK' || rowType === 'CHILD') {
          const taskId = row.taskDbId.trim();
          if (!taskId) {
            errors.push({ rowNumber, field: 'taskDbId', message: 'Task DB Id is required for subtask/child rows' });
            failed += 1;
            continue;
          }
          const task = await prisma.task.findFirst({
            where: { id: taskId, projectId: project.id },
            select: { id: true },
          });
          if (!task) {
            errors.push({ rowNumber, field: 'taskDbId', message: 'Task not found on this project' });
            failed += 1;
            continue;
          }
          const data: Prisma.TaskUncheckedUpdateInput = {};
          if (row.taskName) data.title = row.taskName;
          if (row.status) data.status = mapStatusToTaskStatus(row.status);
          if (row.phase) data.category = row.phase;
          const pr = mapPriority(row.priority);
          if (pr) data.priority = pr;
          if (row.predecessors !== undefined) data.predecessors = row.predecessors || null;
          if (row.startDate) data.startDate = parseDateOrNull(row.startDate);
          if (row.dueDate) data.dueDate = parseDateOrNull(row.dueDate);
          if (row.planDays) {
            const pd = parseInt(row.planDays, 10);
            if (Number.isFinite(pd)) data.planDays = pd;
          }
          if (row.plotNumber) data.plotNumber = row.plotNumber;
          if (row.community) data.community = row.community;
          if (row.projectType) data.projectType = row.projectType;
          if (row.projectFloor) data.projectFloor = row.projectFloor;
          if (row.developerProject) data.developerProject = row.developerProject;
          if (row.location) data.location = row.location;
          if (row.remarks) data.remarks = row.remarks;
          if (row.assigneeNotes) data.assigneeNotes = row.assigneeNotes;
          if (row.assignedEmployeeEmail) {
            const email = row.assignedEmployeeEmail.trim().toLowerCase();
            const user = await prisma.user.findFirst({
              where: { email: { equals: email, mode: 'insensitive' } },
              select: { id: true },
            });
            if (user) {
              data.assignedEmployeeId = user.id;
            }
            else {
              errors.push({ rowNumber, field: 'assignedEmployeeEmail', message: `User not found: ${email}` });
              failed += 1;
              continue;
            }
          }
          if (Object.keys(data).length) {
            await prisma.task.update({ where: { id: task.id }, data });
            updated += 1;
          }
        } else {
          errors.push({ rowNumber, field: 'rowType', message: 'Invalid Row Type' });
          failed += 1;
        }
      } catch (err: any) {
        errors.push({ rowNumber, field: 'row', message: err?.message || 'Update failed' });
        failed += 1;
      }
    }

    let errorReportBase64: string | undefined;
    if (errors.length) {
      const errWb = new ExcelJS.Workbook();
      const errWs = errWb.addWorksheet('Import Errors');
      errWs.addRow(['Row', 'Field', 'Message']);
      errors.forEach((e) => errWs.addRow([e.rowNumber, e.field, e.message]));
      const buf = await buildXlsxBuffer(errWb);
      errorReportBase64 = buf.toString('base64');
    }

    res.json({
      success: true,
      data: {
        processed,
        updated,
        failed,
        errorCount: errors.length,
        errorReportBase64,
      },
    });
  } catch (e: any) {
    console.error('importProjectsExcel error:', e);
    res.status(500).json({ success: false, message: 'Import failed', error: e?.message });
  }
};
