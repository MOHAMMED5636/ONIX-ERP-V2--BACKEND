import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import prisma from '../src/config/database';

/**
 * Permanently delete:
 * - All users with role EMPLOYEE (default), or
 * - Specific users: --email=one@x.com --email=two@x.com (any role except ADMIN unless --allow-admin)
 *
 * From backend folder:
 *   npx ts-node scripts/delete-all-employees.ts --dry-run
 *   npx ts-node scripts/delete-all-employees.ts --confirm
 *   npx ts-node scripts/delete-all-employees.ts --confirm --email=abdullah@onixgroup.ae
 */

const PHOTOS_DIR = path.join(process.cwd(), 'uploads', 'photos');
const DOCS_DIR = path.join(process.cwd(), 'uploads', 'documents');

async function clearBlockingRows(employeeIds: string[]) {
  if (employeeIds.length === 0) return;

  await prisma.payrollLine.deleteMany({ where: { employeeId: { in: employeeIds } } });
  await prisma.payrollApproval.updateMany({
    where: { approvedById: { in: employeeIds } },
    data: { approvedById: null },
  });

  await prisma.attendance.deleteMany({ where: { userId: { in: employeeIds } } });

  await prisma.leave.updateMany({
    where: { managerActionById: { in: employeeIds } },
    data: { managerActionById: null },
  });
  await prisma.leave.updateMany({
    where: { approvedById: { in: employeeIds } },
    data: { approvedById: null },
  });
  await prisma.leave.updateMany({
    where: { rejectedById: { in: employeeIds } },
    data: { rejectedById: null },
  });
  await prisma.leave.deleteMany({ where: { userId: { in: employeeIds } } });

  await prisma.projectAssignment.deleteMany({ where: { employeeId: { in: employeeIds } } });
  await prisma.taskAssignment.deleteMany({ where: { employeeId: { in: employeeIds } } });

  await prisma.taskDelegation.deleteMany({
    where: {
      OR: [
        { originalAssigneeId: { in: employeeIds } },
        { newAssigneeId: { in: employeeIds } },
        { delegatedById: { in: employeeIds } },
      ],
    },
  });

  await prisma.tenderInvitation.deleteMany({ where: { engineerId: { in: employeeIds } } });
  await prisma.questionnaireResponse.deleteMany({ where: { answeredBy: { in: employeeIds } } });

  await prisma.questionnaireAssignment.updateMany({
    where: { assignedBy: { in: employeeIds } },
    data: { assignedBy: null },
  });

  await prisma.user.updateMany({
    where: { managerId: { in: employeeIds } },
    data: { managerId: null },
  });
  await prisma.user.updateMany({
    where: { createdBy: { in: employeeIds } },
    data: { createdBy: null },
  });
  await prisma.department.updateMany({
    where: { managerId: { in: employeeIds } },
    data: { managerId: null },
  });
  await prisma.subDepartment.updateMany({
    where: { managerId: { in: employeeIds } },
    data: { managerId: null },
  });
  await prisma.position.updateMany({
    where: { managerId: { in: employeeIds } },
    data: { managerId: null },
  });

  await prisma.task.updateMany({
    where: { assignedEmployeeId: { in: employeeIds } },
    data: { assignedEmployeeId: null },
  });

  await prisma.projectMessage.updateMany({
    where: { senderId: { in: employeeIds } },
    data: { senderId: null },
  });

  await prisma.contract.updateMany({
    where: { createdBy: { in: employeeIds } },
    data: { createdBy: null },
  });
  await prisma.contract.updateMany({
    where: { approvedBy: { in: employeeIds } },
    data: { approvedBy: null },
  });
  await prisma.contract.updateMany({
    where: { assignedManagerId: { in: employeeIds } },
    data: { assignedManagerId: null },
  });

  await prisma.project.updateMany({
    where: { createdBy: { in: employeeIds } },
    data: { createdBy: null },
  });

  await prisma.companyPolicy.updateMany({
    where: { createdById: { in: employeeIds } },
    data: { createdById: null },
  });
  await prisma.questionnaireTemplate.updateMany({
    where: { createdBy: { in: employeeIds } },
    data: { createdBy: null },
  });
  await prisma.feedbackSurvey.updateMany({
    where: { createdBy: { in: employeeIds } },
    data: { createdBy: null },
  });
}

function collectFiles(u: {
  photo: string | null;
  passportAttachment: string | null;
  nationalIdAttachment: string | null;
  residencyAttachment: string | null;
  insuranceAttachment: string | null;
  drivingLicenseAttachment: string | null;
  labourIdAttachment: string | null;
}): string[] {
  const out: string[] = [];
  const add = (rel: string | null | undefined, baseDir: string) => {
    if (!rel || typeof rel !== 'string') return;
    const p = path.isAbsolute(rel) ? rel : path.join(baseDir, path.basename(rel));
    out.push(p);
  };
  add(u.photo, PHOTOS_DIR);
  [
    u.passportAttachment,
    u.nationalIdAttachment,
    u.residencyAttachment,
    u.insuranceAttachment,
    u.drivingLicenseAttachment,
    u.labourIdAttachment,
  ].forEach((f) => add(f, DOCS_DIR));
  return out;
}

async function syncCompanyEmployeeCounts() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  for (const c of companies) {
    const n = await prisma.user.count({ where: { company: c.name } });
    await prisma.company.update({ where: { id: c.id }, data: { employees: n } });
  }
}

function parseEmailsFromArgv(): string[] {
  const out: string[] = [];
  for (const a of process.argv) {
    if (a.startsWith('--email=')) {
      const v = a.slice('--email='.length).trim();
      if (v) out.push(v);
    }
  }
  return out;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const confirm = process.argv.includes('--confirm');
  const allowAdmin = process.argv.includes('--allow-admin');
  const targetEmails = parseEmailsFromArgv();

  const userSelect = {
    id: true,
    email: true,
    role: true,
    firstName: true,
    lastName: true,
    photo: true,
    passportAttachment: true,
    nationalIdAttachment: true,
    residencyAttachment: true,
    insuranceAttachment: true,
    drivingLicenseAttachment: true,
    labourIdAttachment: true,
  } as const;

  const toDelete =
    targetEmails.length > 0
      ? await prisma.user.findMany({
          where: {
            OR: targetEmails.map((e) => ({
              email: { equals: e, mode: 'insensitive' as const },
            })),
          },
          select: userSelect,
        })
      : await prisma.user.findMany({
          where: { role: 'EMPLOYEE' },
          select: userSelect,
        });

  if (targetEmails.length > 0) {
    const missing = targetEmails.filter(
      (e) => !toDelete.some((u) => u.email.toLowerCase() === e.toLowerCase())
    );
    if (missing.length) {
      console.warn('No user found for email(s):', missing.join(', '));
    }
    console.log(`Found ${toDelete.length} user(s) matching --email=...`);
  } else {
    console.log(`Found ${toDelete.length} user(s) with role EMPLOYEE.`);
  }
  toDelete.forEach((u) =>
    console.log(`  - ${u.firstName} ${u.lastName} <${u.email}> (${u.role})`)
  );

  if (toDelete.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  if (dryRun) {
    console.log('Dry run — no changes.');
    return;
  }

  if (!confirm) {
    console.log('Refusing to delete without --confirm. Use --dry-run to preview or --confirm to execute.');
    process.exitCode = 1;
    return;
  }

  const adminBlock = toDelete.filter((u) => u.role === 'ADMIN');
  if (adminBlock.length && !allowAdmin) {
    console.error(
      'Refusing to delete ADMIN user(s). Pass --allow-admin if intentional:',
      adminBlock.map((u) => u.email).join(', ')
    );
    process.exitCode = 1;
    return;
  }

  const ids = toDelete.map((u) => u.id);
  await clearBlockingRows(ids);

  let ok = 0;
  for (const u of toDelete) {
    try {
      for (const fp of collectFiles(u)) {
        try {
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch {
          /* ignore */
        }
      }
      await prisma.user.delete({ where: { id: u.id } });
      ok++;
      console.log('Deleted:', u.email);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed:', u.email, msg);
    }
  }

  await syncCompanyEmployeeCounts();
  console.log(`Done. Removed ${ok}/${toDelete.length} employee user row(s). Company employee counts synced.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
