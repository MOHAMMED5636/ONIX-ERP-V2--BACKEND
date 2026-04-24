/**
 * Permanently delete all users in a company except one employee (by email or name match).
 * Preserves ADMIN and TENDER_ENGINEER roles (never deletes them).
 *
 * Usage (from backend folder):
 *   node scripts/delete-company-employees-except.js --dry-run
 *   node scripts/delete-company-employees-except.js --keep-email=aboodalakhras21@gmail.com
 *   node scripts/delete-company-employees-except.js --company="ONIX ENGINEERING CONSULTANCY"
 *
 * If --keep-email is omitted, matches first name containing "abdul" and last name containing
 * "lakhi", "akhras", "khras", or "alakhr" (case-insensitive).
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const PHOTOS_DIR = path.join(process.cwd(), 'uploads', 'photos');
const DOCS_DIR = path.join(process.cwd(), 'uploads', 'documents');

function parseArg(name) {
  const p = process.argv.find((a) => a.startsWith(`${name}=`));
  return p ? p.slice(name.length + 1).trim() : null;
}

const dryRun = process.argv.includes('--dry-run');

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Match "ABDULLAHA ALAKHRAS" / "abdull lakhiaras" style names */
function matchesKeepByName(u) {
  const fn = norm(u.firstName);
  const ln = norm(u.lastName);
  const abd = fn.includes('abdul');
  const last =
    ln.includes('lakhi') ||
    ln.includes('akhras') ||
    ln.includes('khras') ||
    ln.includes('alakhr') ||
    ln.includes('lakha');
  return abd && last;
}

async function clearBlockingRows(employeeIds) {
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

  await prisma.user.updateMany({
    where: { managerId: { in: employeeIds } },
    data: { managerId: null },
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

function collectFiles(u) {
  const out = [];
  const add = (rel, baseDir) => {
    if (!rel || typeof rel !== 'string') return;
    const p = path.isAbsolute(rel) ? rel : path.join(baseDir, path.basename(rel));
    out.push(p);
  };
  if (u.photo) add(u.photo, PHOTOS_DIR);
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

async function main() {
  const companyName =
    parseArg('--company') || 'ONIX ENGINEERING CONSULTANCY';
  const keepEmail = parseArg('--keep-email');

  const inCompany = await prisma.user.findMany({
    where: { company: companyName },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      photo: true,
      passportAttachment: true,
      nationalIdAttachment: true,
      residencyAttachment: true,
      insuranceAttachment: true,
      drivingLicenseAttachment: true,
      labourIdAttachment: true,
    },
  });

  console.log(`Company "${companyName}": ${inCompany.length} user row(s).`);

  let keep = null;
  if (keepEmail) {
    const e = keepEmail.trim().toLowerCase();
    keep = inCompany.find((u) => u.email.toLowerCase() === e) || null;
    if (!keep) {
      console.error(`No user in this company with email: ${keepEmail}`);
      process.exit(1);
    }
  } else {
    const candidates = inCompany.filter(matchesKeepByName);
    if (candidates.length === 0) {
      console.error('No keep-candidate by name. Pass --keep-email=... or adjust name logic.');
      console.log(
        'Users:',
        inCompany.map((u) => `${u.firstName} ${u.lastName} <${u.email}>`)
      );
      process.exit(1);
    }
    if (candidates.length > 1) {
      console.error('Multiple name matches; use --keep-email=...');
      candidates.forEach((u) => console.error(`  - ${u.email}`));
      process.exit(1);
    }
    keep = candidates[0];
  }

  const toDelete = inCompany.filter(
    (u) =>
      u.id !== keep.id &&
      u.role !== 'ADMIN' &&
      u.role !== 'TENDER_ENGINEER'
  );

  console.log('KEEP:', `${keep.firstName} ${keep.lastName} <${keep.email}> (${keep.id})`);
  console.log(
    'DELETE:',
    toDelete.length,
    'user(s)',
    toDelete.map((u) => `${u.firstName} ${u.lastName} <${u.email}>`)
  );

  if (dryRun) {
    console.log('Dry run — no DB changes.');
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
        } catch (_) {
          /* ignore */
        }
      }
      await prisma.user.delete({ where: { id: u.id } });
      ok++;
      console.log('Deleted:', u.email);
    } catch (err) {
      console.error('Failed:', u.email, err.message);
    }
  }

  const remaining = await prisma.user.count({ where: { company: companyName } });
  const company = await prisma.company.findFirst({
    where: { name: companyName },
    select: { id: true, employees: true },
  });
  if (company) {
    await prisma.company.update({
      where: { id: company.id },
      data: { employees: remaining },
    });
  }

  console.log(`Done. Removed ${ok}/${toDelete.length}. Remaining in company: ${remaining}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
