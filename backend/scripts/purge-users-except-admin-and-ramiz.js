/**
 * HARD DELETE all users except exactly two (by default):
 *   1) Ramiz — first user whose first/last name or email contains "ramiz" (case-insensitive),
 *      or the user given by --ramiz-email=
 *   2) The main Admin — one ADMIN account: use --admin-email=..., or defaults to the ADMIN whose
 *      email matches /^admin@/i, else the lexicographically first ADMIN email (other than Ramiz).
 *
 * Clears foreign keys and related rows like payroll lines, assignments, etc., then deletes users.
 * Upload photos/documents for deleted users are removed from disk when possible.
 *
 * Usage (from backend folder, DATABASE_URL required):
 *   node scripts/purge-users-except-admin-and-ramiz.js --dry-run
 *   node scripts/purge-users-except-admin-and-ramiz.js --dry-run --admin-email=admin@onixgroup.ae --ramiz-email=ramiz@onixgroup.ae
 *   node scripts/purge-users-except-admin-and-ramiz.js --confirm-erase-all-other-users
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const PHOTOS_DIR = path.join(process.cwd(), 'uploads', 'photos');
const DOCS_DIR = path.join(process.cwd(), 'uploads', 'documents');

const dryRun = process.argv.includes('--dry-run');
const confirmed = process.argv.includes('--confirm-erase-all-other-users');

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseArg(name) {
  const p = process.argv.find((a) => a.startsWith(`${name}=`));
  return p ? p.slice(name.length + 1).trim() : null;
}

function matchesRamiz(u) {
  const fn = norm(u.firstName);
  const ln = norm(u.lastName);
  const em = norm(u.email);
  return fn.includes('ramiz') || ln.includes('ramiz') || em.includes('ramiz');
}

/**
 * Pick Ramiz user and one Admin user to keep; everyone else is deleted.
 */
function resolveKeepPair(allUsers) {
  const ramizEmailArg = parseArg('--ramiz-email');
  const adminEmailArg = parseArg('--admin-email');

  let ramiz = null;
  if (ramizEmailArg) {
    ramiz = allUsers.find((u) => norm(u.email) === norm(ramizEmailArg)) || null;
    if (!ramiz) {
      throw new Error(`--ramiz-email: no user with email ${ramizEmailArg}`);
    }
  } else {
    const hits = allUsers.filter(matchesRamiz);
    if (hits.length === 0) {
      throw new Error('No user matched "Ramiz" (name/email). Pass --ramiz-email=...');
    }
    if (hits.length > 1) {
      console.warn(
        `Multiple Ramiz matches (${hits.length}); keeping first: ${hits[0].email}. Use --ramiz-email= to pin.`
      );
    }
    ramiz = hits[0];
  }

  let adminUser = null;
  if (adminEmailArg) {
    adminUser = allUsers.find((u) => norm(u.email) === norm(adminEmailArg)) || null;
    if (!adminUser) {
      throw new Error(`--admin-email: no user with email ${adminEmailArg}`);
    }
    if (adminUser.role !== 'ADMIN') {
      throw new Error(`--admin-email: ${adminEmailArg} is not role ADMIN (is ${adminUser.role})`);
    }
  } else {
    const admins = allUsers.filter((u) => u.role === 'ADMIN' && u.id !== ramiz.id);
    const adminAt = admins.find((u) => /^admin@/i.test(String(u.email).trim()));
    adminUser = adminAt || admins.sort((a, b) => norm(a.email).localeCompare(norm(b.email)))[0];
    if (!adminUser) {
      if (ramiz.role === 'ADMIN') {
        throw new Error(
          'Ramiz is the only ADMIN. Pass --admin-email= for the second account to keep, or create another ADMIN first.'
        );
      }
      throw new Error('No other ADMIN found to keep. Pass --admin-email=...');
    }
  }

  if (adminUser.id === ramiz.id) {
    throw new Error('Ramiz and Admin resolved to the same user. Use distinct --ramiz-email and --admin-email.');
  }

  const keepIds = new Set([ramiz.id, adminUser.id]);
  return { ramiz, adminUser, keepIds };
}

async function clearBlockingRows(employeeIds) {
  if (employeeIds.length === 0) return;

  await prisma.payrollLine.deleteMany({ where: { employeeId: { in: employeeIds } } });
  await prisma.payrollApproval.updateMany({
    where: { approvedById: { in: employeeIds } },
    data: { approvedById: null },
  });
  await prisma.payrollAuditLog.updateMany({
    where: { performedById: { in: employeeIds } },
    data: { performedById: null },
  });

  await prisma.salaryAuditLog.updateMany({
    where: { performedById: { in: employeeIds } },
    data: { performedById: null },
  });
  await prisma.salaryStructure.deleteMany({ where: { employeeId: { in: employeeIds } } });

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

  try {
    await prisma.technicalSubmission.deleteMany({ where: { engineerId: { in: employeeIds } } });
  } catch (_) {
    /* model may differ in older migrations */
  }

  await prisma.feedbackSurveyAssignment.deleteMany({ where: { userId: { in: employeeIds } } });
  await prisma.feedbackSurveyResponse.deleteMany({ where: { userId: { in: employeeIds } } });
  await prisma.companyPolicyAcknowledgement.deleteMany({ where: { userId: { in: employeeIds } } });

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
  if (!dryRun && !confirmed) {
    console.error(
      'Refusing: pass --dry-run to preview, or --confirm-erase-all-other-users to execute.'
    );
    process.exit(1);
  }

  const all = await prisma.user.findMany({
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

  let ramiz;
  let adminUser;
  let keptIds;
  try {
    ({ ramiz, adminUser, keepIds } = resolveKeepPair(all));
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }

  const kept = all.filter((u) => keepIds.has(u.id));
  const toDelete = all.filter((u) => !keepIds.has(u.id));

  console.log('KEEP (not deleted) — exactly these 2 accounts:');
  console.log(
    `  Ramiz:  ${ramiz.firstName} ${ramiz.lastName} <${ramiz.email}> [${ramiz.role}]`
  );
  console.log(
    `  Admin:  ${adminUser.firstName} ${adminUser.lastName} <${adminUser.email}> [${adminUser.role}]`
  );

  console.log(`\nDELETE (${toDelete.length} user(s)):`);
  toDelete.forEach((u) =>
    console.log(`  ✗ ${u.firstName} ${u.lastName} <${u.email}> [${u.role}]`)
  );

  if (adminUser.role !== 'ADMIN') {
    console.error('Refusing: designated Admin user must have role ADMIN.');
    process.exit(1);
  }

  if (dryRun) {
    console.log('\nDry run — no changes.');
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

  console.log(`\nDone. Removed ${ok}/${toDelete.length} user(s). ${kept.length} account(s) remain.`);

  try {
    const companies = await prisma.company.findMany({ select: { id: true, name: true, employees: true } });
    for (const c of companies) {
      const n = await prisma.user.count({
        where: { company: { equals: c.name, mode: 'insensitive' } },
      });
      await prisma.company.update({ where: { id: c.id }, data: { employees: n } });
    }
    console.log('Updated company employee counts.');
  } catch (e) {
    console.warn('Could not refresh company.employees counts:', e.message);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
