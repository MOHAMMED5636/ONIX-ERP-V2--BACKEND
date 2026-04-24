import prisma from '../config/database';

/**
 * Hard-delete a user and remove or null out dependent rows so login email / employeeId can be reused.
 * Soft-deactivate alone leaves unique constraints populated — use this when HR needs a clean rehire.
 */
export async function permanentlyDeleteUser(userId: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.user.updateMany({ where: { managerId: userId }, data: { managerId: null } });
      await tx.user.updateMany({ where: { createdBy: userId }, data: { createdBy: null } });

      await tx.department.updateMany({ where: { managerId: userId }, data: { managerId: null } });
      await tx.subDepartment.updateMany({ where: { managerId: userId }, data: { managerId: null } });
      await tx.position.updateMany({ where: { managerId: userId }, data: { managerId: null } });

      await tx.contract.updateMany({ where: { assignedManagerId: userId }, data: { assignedManagerId: null } });
      await tx.contract.updateMany({ where: { createdBy: userId }, data: { createdBy: null } });
      await tx.contract.updateMany({ where: { approvedBy: userId }, data: { approvedBy: null } });

      await tx.project.updateMany({ where: { createdBy: userId }, data: { createdBy: null } });

      await tx.questionnaireTemplate.updateMany({ where: { createdBy: userId }, data: { createdBy: null } });
      await tx.questionnaireQuestion.updateMany({ where: { createdBy: userId }, data: { createdBy: null } });
      await tx.questionnaireAssignment.updateMany({ where: { assignedBy: userId }, data: { assignedBy: null } });

      await tx.feedbackSurvey.updateMany({ where: { createdBy: userId }, data: { createdBy: null } });

      await tx.companyPolicy.updateMany({ where: { createdById: userId }, data: { createdById: null } });

      await tx.projectMessage.updateMany({ where: { senderId: userId }, data: { senderId: null } });

      await tx.payrollLine.deleteMany({ where: { employeeId: userId } });
      await tx.payrollApproval.updateMany({ where: { approvedById: userId }, data: { approvedById: null } });

      await tx.attendance.deleteMany({ where: { userId } });

      await tx.leave.updateMany({ where: { managerActionById: userId }, data: { managerActionById: null } });
      await tx.leave.updateMany({ where: { approvedById: userId }, data: { approvedById: null } });
      await tx.leave.updateMany({ where: { rejectedById: userId }, data: { rejectedById: null } });
      await tx.leave.deleteMany({ where: { userId } });

      await tx.projectAssignment.deleteMany({ where: { employeeId: userId } });
      await tx.taskAssignment.deleteMany({ where: { employeeId: userId } });

      await tx.taskDelegation.deleteMany({
        where: {
          OR: [
            { originalAssigneeId: userId },
            { newAssigneeId: userId },
            { delegatedById: userId },
          ],
        },
      });

      await tx.task.updateMany({ where: { assignedEmployeeId: userId }, data: { assignedEmployeeId: null } });

      await tx.tenderInvitation.deleteMany({ where: { engineerId: userId } });

      await tx.questionnaireResponse.deleteMany({ where: { answeredBy: userId } });

      await tx.user.delete({ where: { id: userId } });
    },
    { maxWait: 30_000, timeout: 120_000 },
  );
}

export async function permanentlyDeleteUsersByEmails(emails: string[]): Promise<{ email: string; ok: boolean; error?: string }[]> {
  const normalized = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const results: { email: string; ok: boolean; error?: string }[] = [];

  for (const email of normalized) {
    try {
      const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (!user) {
        results.push({ email, ok: true });
        continue;
      }
      await permanentlyDeleteUser(user.id);
      results.push({ email, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ email, ok: false, error: msg });
    }
  }

  return results;
}
