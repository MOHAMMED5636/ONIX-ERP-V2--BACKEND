/**
 * Restore subtasks on a target project by cloning from a source project
 * (e.g. after accidental delete on 2583, copy back from pasted rows on 2604).
 *
 * Usage:
 *   npx ts-node scripts/restore-subtasks-between-projects.ts --from 2604 --to 2583
 *   npx ts-node scripts/restore-subtasks-between-projects.ts --from 2604 --to 2583 --dry-run
 */
import 'dotenv/config';
import prisma from '../src/config/database';
import { computeNextStableWorkSeq } from '../src/utils/project-number';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dryRun = process.argv.includes('--dry-run');
const fromNum = parseInt(arg('--from') || '', 10);
const toNum = parseInt(arg('--to') || '', 10);

function cleanTitle(title: string): string {
  return title.replace(/\s*\(Copy\)\s*$/i, '').trim() || title;
}

async function findProjectByNumber(n: number) {
  return prisma.project.findFirst({
    where: { projectNumber: n },
    select: { id: true, projectNumber: true, name: true, referenceNumber: true },
  });
}

type TaskRow = Awaited<ReturnType<typeof loadProjectSubtasks>>[number];

async function loadProjectSubtasks(projectId: string) {
  return prisma.task.findMany({
    where: { projectId, parentTaskId: null },
    orderBy: [{ stableWorkSeq: 'asc' }, { taskOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      subtasks: {
        orderBy: [{ stableWorkSeq: 'asc' }, { taskOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });
}

async function cloneTaskTree(
  source: TaskRow,
  targetProjectId: string,
  parentTaskId: string | null,
  seqOverride?: number,
) {
  const stableSeq =
    seqOverride ??
    (await computeNextStableWorkSeq(prisma, targetProjectId, parentTaskId));

  const data = {
    title: cleanTitle(source.title),
    description: source.description,
    projectId: targetProjectId,
    parentTaskId,
    status: source.status,
    workflowStatus: source.workflowStatus,
    priority: source.priority,
    startDate: source.startDate,
    dueDate: source.dueDate,
    completedAt: source.completedAt,
    tags: source.tags,
    category: source.category,
    referenceNumber: source.referenceNumber,
    planDays: source.planDays,
    remarks: source.remarks,
    assigneeNotes: source.assigneeNotes,
    assignedEmployeeId: source.assignedEmployeeId,
    location: source.location,
    makaniNumber: source.makaniNumber,
    plotNumber: source.plotNumber,
    community: source.community,
    projectType: source.projectType,
    projectFloor: source.projectFloor,
    developerProject: source.developerProject,
    predecessors: null as string | null,
    predecessorId: null as string | null,
    stableWorkSeq: stableSeq,
    taskOrder: stableSeq,
    createdBy: source.createdBy,
  };

  if (dryRun) {
    console.log(
      `  [dry-run] would create ${parentTaskId ? 'child' : 'subtask'}: "${data.title}" seq=${stableSeq}`,
    );
    for (const child of source.subtasks || []) {
      await cloneTaskTree(child as TaskRow, targetProjectId, 'dry-run-parent', undefined);
    }
    return null;
  }

  const created = await prisma.task.create({ data });
  console.log(`  ✅ ${parentTaskId ? 'Child' : 'Subtask'}: "${created.title}" (${created.id}) seq=${stableSeq}`);

  let childSeq = 1;
  for (const child of source.subtasks || []) {
    await cloneTaskTree(child as TaskRow, targetProjectId, created.id, childSeq++);
  }
  return created.id;
}

async function main() {
  if (!Number.isFinite(fromNum) || !Number.isFinite(toNum)) {
    console.error('Usage: npx ts-node scripts/restore-subtasks-between-projects.ts --from 2604 --to 2583 [--dry-run]');
    process.exit(1);
  }

  const fromProject = await findProjectByNumber(fromNum);
  const toProject = await findProjectByNumber(toNum);

  if (!fromProject) {
    console.error(`Source project projectNumber=${fromNum} not found`);
    process.exit(1);
  }
  if (!toProject) {
    console.error(`Target project projectNumber=${toNum} not found`);
    process.exit(1);
  }

  const sourceSubtasks = await loadProjectSubtasks(fromProject.id);
  const existingTarget = await loadProjectSubtasks(toProject.id);

  console.log(`Source: #${fromProject.projectNumber} ${fromProject.name} — ${sourceSubtasks.length} subtask(s)`);
  console.log(`Target: #${toProject.projectNumber} ${toProject.name} — ${existingTarget.length} subtask(s) now`);
  console.log(dryRun ? 'DRY RUN — no writes\n' : 'Restoring…\n');

  if (sourceSubtasks.length === 0) {
    console.error('No subtasks on source project to copy.');
    process.exit(1);
  }

  let nextSeq = await computeNextStableWorkSeq(prisma, toProject.id, null);
  for (const sub of sourceSubtasks) {
    await cloneTaskTree(sub, toProject.id, null, nextSeq++);
  }

  const after = dryRun ? existingTarget.length : (await loadProjectSubtasks(toProject.id)).length;
  console.log(`\nDone. Target now has ${after} subtask(s). Refresh the Tasks page.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
