import type { Prisma } from '@prisma/client';
import { computeNextProjectNumber } from './project-number';

type Tx = Prisma.TransactionClient;

/**
 * When load-out runs again (or an ERP project already exists for the contract ref),
 * duplicate the existing project row and its task tree instead of creating an empty shell from contract fields only.
 */
export async function resolveSourceProjectIdForLoadOut(
  tx: Tx,
  contract: { projectId: string | null; referenceNumber: string }
): Promise<string | null> {
  if (contract.projectId) {
    const linked = await tx.project.findUnique({
      where: { id: contract.projectId },
      select: { id: true },
    });
    if (linked) return linked.id;
  }
  const byRef = await tx.project.findUnique({
    where: { referenceNumber: contract.referenceNumber },
    select: { id: true },
  });
  return byRef?.id ?? null;
}

function pickProjectCloneData(
  source: Prisma.ProjectGetPayload<{
    include: { assignedEmployees: true; checklists: true };
  }>,
  projectNumber: number,
  referenceNumber: string,
  createdBy: string | null
): Prisma.ProjectUncheckedCreateInput {
  return {
    projectNumber,
    referenceNumber,
    pin: null,
    name: source.name,
    clientId: source.clientId,
    owner: source.owner,
    description: source.description,
    status: source.status,
    projectManager: source.projectManager,
    startDate: source.startDate,
    endDate: source.endDate,
    deadline: source.deadline,
    planDays: source.planDays,
    remarks: source.remarks,
    assigneeNotes: source.assigneeNotes,
    location: source.location,
    makaniNumber: source.makaniNumber,
    plotNumber: source.plotNumber,
    community: source.community,
    projectType: source.projectType,
    projectFloor: source.projectFloor,
    developerProject: source.developerProject,
    createdBy,
  };
}

export async function duplicateProjectAssignmentsAndChecklists(
  tx: Tx,
  sourceProjectId: string,
  targetProjectId: string,
  assignedByUserId: string | null
): Promise<void> {
  const [assignments, checklists] = await Promise.all([
    tx.projectAssignment.findMany({ where: { projectId: sourceProjectId } }),
    tx.projectChecklist.findMany({ where: { projectId: sourceProjectId } }),
  ]);

  for (const a of assignments) {
    const existing = await tx.projectAssignment.findUnique({
      where: {
        projectId_employeeId: { projectId: targetProjectId, employeeId: a.employeeId },
      },
    });
    if (existing) continue;
    await tx.projectAssignment.create({
      data: {
        projectId: targetProjectId,
        employeeId: a.employeeId,
        assignedBy: assignedByUserId ?? a.assignedBy,
        role: a.role,
      },
    });
  }

  for (const c of checklists) {
    await tx.projectChecklist.create({
      data: {
        projectId: targetProjectId,
        title: c.title,
        description: c.description,
        isCompleted: c.isCompleted,
        completedAt: c.completedAt,
        completedBy: c.completedBy,
        order: c.order,
      },
    });
  }
}

/**
 * Deep-copy all tasks for a project: preserves tree (parentTaskId), then restores predecessorId links.
 */
export async function duplicateTaskTreeForProject(
  tx: Tx,
  sourceProjectId: string,
  targetProjectId: string,
  createdBy: string | null
): Promise<void> {
  const tasks = await tx.task.findMany({
    where: { projectId: sourceProjectId },
    include: {
      assignments: true,
      checklists: true,
    },
    orderBy: [{ taskOrder: 'asc' }, { createdAt: 'asc' }],
  });

  if (tasks.length === 0) return;

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const idMap = new Map<string, string>();
  const remaining = new Set(tasks.map((t) => t.id));

  while (remaining.size > 0) {
    const ready = [...remaining].filter((oid) => {
      const t = byId.get(oid);
      if (!t) return false;
      if (!t.parentTaskId) return true;
      return idMap.has(t.parentTaskId);
    });

    if (ready.length === 0) {
      throw new Error('loadOutDuplicateProject: invalid task hierarchy (cycle or missing parent)');
    }

    ready.sort((a, b) => {
      const ta = byId.get(a)!;
      const tb = byId.get(b)!;
      return (ta.taskOrder ?? 0) - (tb.taskOrder ?? 0);
    });

    for (const oid of ready) {
      const t = byId.get(oid)!;
      const newParentId = t.parentTaskId ? idMap.get(t.parentTaskId) ?? null : null;

      const created = await tx.task.create({
        data: {
          title: t.title,
          description: t.description,
          projectId: targetProjectId,
          parentTaskId: newParentId,
          status: t.status,
          workflowStatus: t.workflowStatus,
          priority: t.priority,
          startDate: t.startDate,
          dueDate: t.dueDate,
          completedAt: t.completedAt,
          estimatedHours: t.estimatedHours,
          actualHours: t.actualHours,
          tags: t.tags ?? [],
          category: t.category,
          referenceNumber: t.referenceNumber,
          planDays: t.planDays,
          remarks: t.remarks,
          assigneeNotes: t.assigneeNotes,
          link: t.link,
          assignedEmployeeId: t.assignedEmployeeId,
          location: t.location,
          makaniNumber: t.makaniNumber,
          plotNumber: t.plotNumber,
          community: t.community,
          projectType: t.projectType,
          projectFloor: t.projectFloor,
          developerProject: t.developerProject,
          predecessors: t.predecessors,
          predecessorId: null,
          taskOrder: t.taskOrder,
          createdBy: createdBy ?? t.createdBy,
          assignments:
            t.assignments.length > 0
              ? {
                  create: t.assignments.map((a) => ({
                    employeeId: a.employeeId,
                    assignedBy: createdBy ?? a.assignedBy,
                    status: a.status,
                  })),
                }
              : undefined,
          checklists:
            t.checklists.length > 0
              ? {
                  create: t.checklists.map((c) => ({
                    title: c.title,
                    isCompleted: c.isCompleted,
                    completedAt: c.completedAt,
                    completedBy: c.completedBy,
                    order: c.order,
                  })),
                }
              : undefined,
        },
      });

      idMap.set(t.id, created.id);
      remaining.delete(t.id);
    }
  }

  for (const t of tasks) {
    if (!t.predecessorId) continue;
    const newTaskId = idMap.get(t.id);
    const newPredId = idMap.get(t.predecessorId);
    if (!newTaskId || !newPredId) continue;
    await tx.task.update({
      where: { id: newTaskId },
      data: { predecessorId: newPredId },
    });
  }
}

export async function createProjectFromSourceForLoadOut(
  tx: Tx,
  sourceProjectId: string,
  projectReferenceNumber: string,
  createdBy: string | null
) {
  const source = await tx.project.findUnique({
    where: { id: sourceProjectId },
    include: {
      assignedEmployees: true,
      checklists: true,
    },
  });

  if (!source) {
    throw new Error('Source ERP project not found for load-out copy');
  }

  const projectNumber = await computeNextProjectNumber(tx as any);

  const data = pickProjectCloneData(source, projectNumber, projectReferenceNumber, createdBy);

  return tx.project.create({
    data,
    include: projectCreateInclude,
  });
}

const projectCreateInclude = {
  client: true,
  contracts: {
    select: {
      id: true,
      referenceNumber: true,
      title: true,
    },
  },
} as const;

/**
 * Full load-out inside a transaction: allocate reference, copy existing ERP project+tasks when possible,
 * otherwise create a project from contract fields, then link the contract to the new project.
 */
export async function runContractLoadOutTransaction(
  tx: Tx,
  contract: Record<string, any>,
  userId: string | null
): Promise<{ project: Record<string, unknown> & { id: string; referenceNumber: string; name: string; client?: { name?: string | null } | null }; mode: 'copied' | 'created' }> {
  const baseReferenceNumber = contract.referenceNumber as string;
  let projectReferenceNumber = baseReferenceNumber;
  let suffix = 1;

  while (true) {
    const existingProject = await tx.project.findUnique({
      where: { referenceNumber: projectReferenceNumber },
    });
    if (!existingProject) break;
    projectReferenceNumber = `${baseReferenceNumber}-${suffix}`;
    suffix++;
    if (suffix > 1000) {
      const timestamp = Date.now().toString(36).toUpperCase().substring(0, 6);
      projectReferenceNumber = `${baseReferenceNumber}-${timestamp}`;
      break;
    }
  }

  const sourceProjectId = await resolveSourceProjectIdForLoadOut(tx, {
    projectId: contract.projectId ?? null,
    referenceNumber: baseReferenceNumber,
  });

  if (sourceProjectId) {
    const project = await createProjectFromSourceForLoadOut(tx, sourceProjectId, projectReferenceNumber, userId);
    await duplicateTaskTreeForProject(tx, sourceProjectId, project.id, userId);
    await duplicateProjectAssignmentsAndChecklists(tx, sourceProjectId, project.id, userId);
    await tx.contract.update({
      where: { id: contract.id },
      data: { projectId: project.id },
    });
    return { project, mode: 'copied' };
  }

  let planDays: number | null = null;
  if (contract.startDate && contract.endDate) {
    const start = new Date(contract.startDate);
    const end = new Date(contract.endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    planDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }

  const projectName = contract.title || `Project ${contract.referenceNumber}`;
  const projectManager =
    (contract.assignedManager
      ? `${contract.assignedManager.firstName || ''} ${contract.assignedManager.lastName || ''}`.trim().substring(0, 100)
      : null) ||
    (contract.projectManager ? String(contract.projectManager).trim().substring(0, 100) : null) ||
    (contract.creator
      ? `${contract.creator.firstName || ''} ${contract.creator.lastName || ''}`.trim().substring(0, 100)
      : null);

  let locationString: string | null = null;
  if (contract.latitude != null && contract.longitude != null) {
    locationString = `${contract.latitude}, ${contract.longitude}`;
  }

  const projectNumber = await computeNextProjectNumber(tx as any);

  const project = await tx.project.create({
    data: {
      projectNumber,
      name: projectName,
      referenceNumber: projectReferenceNumber,
      pin: null,
      clientId: contract.clientId || null,
      owner: contract.developerName || null,
      description: contract.description || null,
      status: 'OPEN',
      projectManager,
      startDate: contract.startDate ? new Date(contract.startDate) : null,
      endDate: contract.endDate ? new Date(contract.endDate) : null,
      deadline: contract.endDate ? new Date(contract.endDate) : null,
      planDays,
      remarks: contract.specialClauses || contract.termsAndConditions || null,
      assigneeNotes: contract.paymentTerms || null,
      location: locationString,
      makaniNumber: contract.makaniNumber || null,
      plotNumber: contract.plotNumber || null,
      community: contract.community || null,
      projectType: contract.contractType || null,
      projectFloor: contract.numberOfFloors ? contract.numberOfFloors.toString() : null,
      developerProject: contract.developerName || null,
      createdBy: userId,
    },
    include: projectCreateInclude,
  });

  await tx.contract.update({
    where: { id: contract.id },
    data: { projectId: project.id },
  });

  return { project, mode: 'created' };
}
