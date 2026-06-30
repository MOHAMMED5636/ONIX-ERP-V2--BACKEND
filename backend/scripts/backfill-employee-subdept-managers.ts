/**
 * One-time backfill: set managerId + secondLineManagerId from sub-department managers.
 * Usage: npx ts-node scripts/backfill-employee-subdept-managers.ts
 */
import 'dotenv/config';
import prisma from '../src/config/database';
import {
  resolveSubDepartmentManagerIds,
  syncEmployeeManagersFromSubDepartments,
} from '../src/services/employeeSubDepartmentManagers.service';
import { UserRole } from '@prisma/client';

const EMPLOYEE_ROLES: UserRole[] = [
  UserRole.EMPLOYEE,
  UserRole.PROJECT_MANAGER,
  UserRole.TENDER_ENGINEER,
  UserRole.HR,
  UserRole.MANAGER,
];

async function main() {
  const users = await prisma.user.findMany({
    where: { role: { in: EMPLOYEE_ROLES } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeId: true,
      department: true,
      position: true,
      jobTitle: true,
      managerId: true,
      secondLineManagerId: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  console.log(`Scanning ${users.length} employee(s)…\n`);

  let updated = 0;
  let unchanged = 0;
  let noSubDeptManager = 0;
  const changes: string[] = [];

  for (const u of users) {
    const managerIds = await resolveSubDepartmentManagerIds(u.id);
    if (managerIds.length === 0) {
      noSubDeptManager += 1;
      continue;
    }

    const result = await syncEmployeeManagersFromSubDepartments(u.id);
    const label =
      `${u.firstName} ${u.lastName}`.trim() +
      (u.employeeId ? ` (${u.employeeId})` : '');

    if (result.changed) {
      updated += 1;
      changes.push(
        `  ✓ ${label}\n` +
          `    manager: ${u.managerId ?? '—'} → ${result.managerId ?? '—'}\n` +
          `    second line: ${u.secondLineManagerId ?? '—'} → ${result.secondLineManagerId ?? '—'}`,
      );
    } else {
      unchanged += 1;
    }
  }

  console.log('--- Backfill complete ---');
  console.log(`Total scanned:     ${users.length}`);
  console.log(`Updated:           ${updated}`);
  console.log(`Already correct:   ${unchanged}`);
  console.log(`No sub-dept match: ${noSubDeptManager}`);

  if (changes.length > 0) {
    console.log('\nChanges:');
    console.log(changes.join('\n'));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
