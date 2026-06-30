/**
 * One-time: align project 2604 tasks with reference template (2583 → fallback 2539).
 * Run: npx ts-node scripts/sync-2604-from-reference.ts
 */
import prisma from '../src/config/database';
import {
  loadReferencePlanDaysData,
  applyReferenceTemplateToTaskRow,
  isReferenceProjectRef,
} from '../src/utils/default-plan-days';

async function main() {
  const targetRef = '2604';
  const project = await prisma.project.findFirst({
    where: { referenceNumber: targetRef, deletedAt: null },
  });
  if (!project) {
    console.error('Project 2604 not found');
    return;
  }

  const reference = await loadReferencePlanDaysData(prisma);
  console.log('Reference keys:', Object.keys(reference.byName).length, 'slots:', reference.bySlot.length);

  const tasks = await prisma.task.findMany({
    where: { projectId: project.id, parentTaskId: null, deletedAt: null },
    orderBy: [{ taskOrder: 'asc' }, { stableWorkSeq: 'asc' }],
  });

  let updated = 0;
  for (let idx = 0; idx < tasks.length; idx++) {
    const t = tasks[idx];
    if (isReferenceProjectRef(targetRef)) continue;
    const aligned = applyReferenceTemplateToTaskRow(
      {
        title: t.title,
        planDays: t.planDays,
        category: t.category,
        priority: t.priority,
        assignedEmployeeId: t.assignedEmployeeId,
      },
      reference,
      idx,
    );
    const priMap: Record<string, string> = {
      Low: 'LOW',
      Medium: 'MEDIUM',
      High: 'HIGH',
      Urgent: 'URGENT',
    };
    const nextPriority = aligned.priority
      ? (priMap[String(aligned.priority)] as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT') || 'MEDIUM'
      : t.priority;

    const needsUpdate =
      (aligned.category && aligned.category !== t.category) ||
      (aligned.planDays != null && aligned.planDays !== t.planDays) ||
      (nextPriority !== t.priority) ||
      (aligned.assignedEmployeeId && aligned.assignedEmployeeId !== t.assignedEmployeeId);

    if (!needsUpdate) continue;

    await prisma.task.update({
      where: { id: t.id },
      data: {
        category: aligned.category || t.category,
        planDays: aligned.planDays ?? t.planDays,
        priority: nextPriority,
        assignedEmployeeId: aligned.assignedEmployeeId || t.assignedEmployeeId,
      },
    });
    console.log(`Updated: ${t.title} | phase=${aligned.category} | assignee=${aligned.assignedEmployeeId}`);
    updated++;
  }
  console.log(`Done. ${updated} task(s) updated on project ${targetRef}.`);
}

main().finally(() => prisma.$disconnect());
