/**
 * Fix duplicate ARCH - SHOP DRAWING (Copy) on project 2602 from bulk paste bug.
 * Moves child tasks to the correct parent (stableWorkSeq=5) and removes duplicate shell (stableWorkSeq=22).
 */
import 'dotenv/config';
import prisma from '../src/config/database';

async function main() {
  const project = await prisma.project.findFirst({ where: { referenceNumber: '2602' } });
  if (!project) throw new Error('Project 2602 not found');

  const archRows = await prisma.task.findMany({
    where: {
      projectId: project.id,
      parentTaskId: null,
      title: { contains: 'ARCH - SHOP DRAWING (Copy)', mode: 'insensitive' },
    },
    include: { subtasks: true },
    orderBy: { stableWorkSeq: 'asc' },
  });

  if (archRows.length < 2) {
    console.log('No duplicate ARCH row to fix.');
    return;
  }

  const keep = archRows.find((r) => r.stableWorkSeq === 5) || archRows[0];
  const duplicate = archRows.find((r) => r.id !== keep.id && r.subtasks.length > 0) || archRows[1];

  console.log(`Keep: seq=${keep.stableWorkSeq} id=${keep.id} children=${keep.subtasks.length}`);
  console.log(
    `Remove duplicate: seq=${duplicate.stableWorkSeq} id=${duplicate.id} children=${duplicate.subtasks.length}`,
  );

  if (duplicate.subtasks.length > 0) {
    await prisma.task.updateMany({
      where: { parentTaskId: duplicate.id },
      data: { parentTaskId: keep.id },
    });
    console.log(`Moved ${duplicate.subtasks.length} child task(s) to parent seq=${keep.stableWorkSeq}`);
  }

  await prisma.task.delete({ where: { id: duplicate.id } });
  console.log('Deleted duplicate ARCH parent row.');

  const count = await prisma.task.count({
    where: { projectId: project.id, parentTaskId: null },
  });
  console.log(`Project 2602 now has ${count} top-level subtask(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
