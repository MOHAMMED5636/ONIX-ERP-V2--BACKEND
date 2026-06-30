import 'dotenv/config';
import prisma from '../src/config/database';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { computeNextStableWorkSeq } from '../src/utils/project-number';

const PROJECT_REF = '2583';
const dryRun = process.argv.includes('--dry-run');

type Change = { field: string; from: unknown; to: unknown };
type TaskState = Record<string, unknown> & {
  title: string;
  taskId?: string;
  deleted?: boolean;
  children: Map<string, TaskState>;
};

function mapStatus(s: unknown): TaskStatus {
  const v = String(s ?? 'NOT_STARTED').toUpperCase().replace(/\s+/g, '_');
  if (v in TaskStatus) return v as TaskStatus;
  if (v === 'IN_PROGRESS' || v === 'INPROGRESS') return TaskStatus.IN_PROGRESS;
  if (v === 'COMPLETED' || v === 'DONE') return TaskStatus.COMPLETED;
  if (v === 'NOT_STARTED') return TaskStatus.PENDING;
  return TaskStatus.PENDING;
}

function mapPriority(p: unknown): TaskPriority {
  const v = String(p ?? 'MEDIUM').toUpperCase();
  if (v in TaskPriority) return v as TaskPriority;
  return TaskPriority.MEDIUM;
}

function applyChanges(state: TaskState, changes: Change[]) {
  for (const ch of changes) {
    const f = String(ch.field);
    if (f === 'startDate' || f === 'dueDate') {
      state[f] = ch.to ? new Date(String(ch.to)) : null;
    } else if (f === 'planDays') {
      state.planDays = ch.to != null ? parseInt(String(ch.to), 10) : null;
    } else if (f === 'assignedEmployeeId' || f === 'assignedTo') {
      state.assignedEmployeeId = ch.to || null;
    } else {
      state[f] = ch.to;
    }
  }
}

function seqFromRef(ref: unknown): number | null {
  if (!ref) return null;
  const m = String(ref).match(/-(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

async function main() {
  const project = await prisma.project.findFirst({
    where: { referenceNumber: PROJECT_REF },
  });
  if (!project) throw new Error(`Project ref ${PROJECT_REF} not found`);

  const logs = await prisma.projectActivityLog.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: 'asc' },
    select: { action: true, taskId: true, metadata: true, createdAt: true },
  });

  const byTaskId = new Map<string, TaskState>();
  const byTitle = new Map<string, TaskState>();

  const getOrCreate = (title: string, taskId?: string | null): TaskState => {
    if (taskId && byTaskId.has(taskId)) return byTaskId.get(taskId)!;
    if (byTitle.has(title)) {
      const s = byTitle.get(title)!;
      if (taskId) byTaskId.set(taskId, s);
      return s;
    }
    const s: TaskState = {
      title,
      taskId: taskId ?? undefined,
      status: TaskStatus.PENDING,
      priority: TaskPriority.MEDIUM,
      children: new Map(),
    };
    byTitle.set(title, s);
    if (taskId) byTaskId.set(taskId, s);
    return s;
  };

  for (const log of logs) {
    const meta = (log.metadata ?? {}) as Record<string, unknown>;
    const title = String(meta.taskTitle ?? '').trim();
    if (!title && !log.taskId) continue;

    if (log.action === 'SUBTASK_CREATED') {
      const s = getOrCreate(title, log.taskId);
      if (meta.assigneeId) s.assignedEmployeeId = meta.assigneeId;
      s.deleted = false;
    } else if (log.action === 'SUBTASK_UPDATED' && Array.isArray(meta.changes)) {
      const s = getOrCreate(title, log.taskId);
      applyChanges(s, meta.changes as Change[]);
    } else if (log.action === 'SUBTASK_DELETED') {
      const s = getOrCreate(title, log.taskId);
      s.deleted = true;
    } else if (log.action === 'CHILD_TASK_CREATED') {
      const parentTitle = String(meta.parentTitle ?? meta.parentTaskTitle ?? '').trim();
      const childTitle = title;
      if (!parentTitle) continue;
      const parent = getOrCreate(parentTitle);
      const child: TaskState = {
        title: childTitle,
        taskId: log.taskId ?? undefined,
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        children: new Map(),
      };
      parent.children.set(childTitle, child);
      if (log.taskId) byTaskId.set(log.taskId, child);
    } else if (log.action === 'CHILD_TASK_UPDATED' && Array.isArray(meta.changes)) {
      const parentTitle = String(meta.parentTitle ?? meta.parentTaskTitle ?? '').trim();
      let child = log.taskId ? byTaskId.get(log.taskId) : undefined;
      if (!child && parentTitle) {
        const parent = byTitle.get(parentTitle);
        child = parent?.children.get(title);
      }
      if (child) applyChanges(child, meta.changes as Change[]);
    }
  }

  // Subtasks deleted in the latest bulk delete (today)
  const deletedToday = logs.filter(
    (l) =>
      l.action === 'SUBTASK_DELETED' &&
      l.createdAt >= new Date('2026-05-20T10:45:00Z') &&
      l.createdAt <= new Date('2026-05-20T10:46:00Z'),
  );
  const restoreTitles = new Set(
    deletedToday.map((l) => String((l.metadata as any)?.taskTitle ?? '').trim()).filter(Boolean),
  );

  let subtasks = [...byTitle.values()].filter((s) => restoreTitles.has(s.title));
  if (subtasks.length === 0) {
    // fallback: anything marked deleted
    subtasks = [...byTitle.values()].filter((s) => s.deleted);
  }

  subtasks.sort((a, b) => {
    const sa = seqFromRef(a.referenceNumber) ?? Number.MAX_SAFE_INTEGER;
    const sb = seqFromRef(b.referenceNumber) ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.title.localeCompare(b.title);
  });

  console.log(`Project ${PROJECT_REF} (${project.name}) — restoring ${subtasks.length} subtask(s)`);
  subtasks.forEach((s, i) => {
    console.log(
      `  ${i + 1}. ${s.title} ref=${s.referenceNumber ?? '-'} cat=${s.category ?? '-'} pri=${s.priority ?? '-'}`,
    );
  });

  if (dryRun) {
    console.log('\nDRY RUN — no DB writes');
    return;
  }

  let nextSeq = await computeNextStableWorkSeq(prisma, project.id, null);
  for (const sub of subtasks) {
    const created = await prisma.task.create({
      data: {
        title: sub.title,
        projectId: project.id,
        parentTaskId: null,
        status: mapStatus(sub.status),
        priority: mapPriority(sub.priority),
        category: (sub.category as string) ?? null,
        referenceNumber: (sub.referenceNumber as string) ?? null,
        planDays: typeof sub.planDays === 'number' ? sub.planDays : null,
        remarks: (sub.remarks as string) ?? null,
        assigneeNotes: (sub.assigneeNotes as string) ?? null,
        assignedEmployeeId: (sub.assignedEmployeeId as string) ?? null,
        startDate: sub.startDate instanceof Date ? sub.startDate : null,
        dueDate: sub.dueDate instanceof Date ? sub.dueDate : null,
        location: project.location,
        makaniNumber: project.makaniNumber,
        plotNumber: project.plotNumber,
        community: project.community,
        projectType: project.projectType,
        projectFloor: project.projectFloor,
        developerProject: project.developerProject,
        stableWorkSeq: nextSeq,
        taskOrder: nextSeq,
        createdBy: project.createdBy,
      },
    });
    console.log(`✅ Created "${created.title}" (${created.id}) seq=${nextSeq}`);
    nextSeq++;

    let childSeq = 1;
    for (const child of sub.children.values()) {
      await prisma.task.create({
        data: {
          title: child.title,
          projectId: project.id,
          parentTaskId: created.id,
          status: mapStatus(child.status),
          priority: mapPriority(child.priority),
          category: (child.category as string) ?? null,
          referenceNumber: (child.referenceNumber as string) ?? null,
          planDays: typeof child.planDays === 'number' ? child.planDays : null,
          remarks: (child.remarks as string) ?? null,
          assigneeNotes: (child.assigneeNotes as string) ?? null,
          assignedEmployeeId: (child.assignedEmployeeId as string) ?? null,
          startDate: child.startDate instanceof Date ? child.startDate : null,
          dueDate: child.dueDate instanceof Date ? child.dueDate : null,
          stableWorkSeq: childSeq,
          taskOrder: childSeq,
          createdBy: project.createdBy,
        },
      });
      childSeq++;
    }
  }

  const count = await prisma.task.count({
    where: { projectId: project.id, parentTaskId: null },
  });
  console.log(`\nDone. Project ${PROJECT_REF} now has ${count} subtask(s). Refresh the Tasks page.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
