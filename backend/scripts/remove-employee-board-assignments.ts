/**
 * Remove Board of Directors *org-chart* assignments only for a user in a given company.
 * Does not delete the employee or change primary directory fields (department/job title on User).
 *
 * Usage (from backend folder, with DATABASE_URL set):
 *   npx ts-node scripts/remove-employee-board-assignments.ts --company="ONIX ENGINEERING" --employee="ABDULLAH" --dry-run
 *   npx ts-node scripts/remove-employee-board-assignments.ts --company="ONIX ENGINEERING" --employee="ABDULLAH" --execute
 * Optional disambiguation:
 *   ... --email=someone@example.com
 * If User.company text does not exactly match DB company.name, try:
 *   ... --userCompany="ONIX ENGINEERING CONSULTANCY"
 *
 * Matches:
 * - Company: single row where name is case-insensitive LIKE %companyArg%
 * - SubDepartments named like Board of Directors (name contains both "board" and "director", case-insensitive)
 * - Employee: User.company matches company name (case-insensitive) AND all tokens in --employee appear in firstName+lastName
 */
import 'dotenv/config';
import prisma from '../src/config/database';

function argValue(prefix: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(prefix));
  if (!a) return undefined;
  const eq = a.indexOf('=');
  return eq >= 0 ? a.slice(eq + 1).trim() : undefined;
}

function tokens(s: string): string[] {
  return s
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

async function main() {
  const companyArg = argValue('--company');
  const employeeArg = argValue('--employee');
  const emailArg = argValue('--email');
  const execute = process.argv.includes('--execute');
  const dryRun = process.argv.includes('--dry-run') || !execute;

  if (!companyArg || !employeeArg) {
    console.error(
      'Usage: npx ts-node scripts/remove-employee-board-assignments.ts --company="ONIX ENGINEERING" --employee="ABDULLAH" [--email=x] --dry-run | --execute'
    );
    process.exit(1);
  }

  const nameTokens = tokens(employeeArg).map(norm);
  if (nameTokens.length === 0) {
    console.error('No employee name tokens');
    process.exit(1);
  }

  const companies = await prisma.company.findMany({
    where: { name: { contains: companyArg, mode: 'insensitive' } },
    select: { id: true, name: true },
  });

  if (companies.length === 0) {
    console.error(`No company matching name containing: "${companyArg}"`);
    process.exit(1);
  }
  if (companies.length > 1) {
    console.error('Multiple companies match; narrow --company. Found:');
    companies.forEach((c) => console.error(`  - ${c.name} (${c.id})`));
    process.exit(1);
  }

  const company = companies[0];

  const departments = await prisma.department.findMany({
    where: { companyId: company.id },
    select: { id: true },
  });
  const deptIds = departments.map((d) => d.id);
  if (deptIds.length === 0) {
    console.error('No departments for this company.');
    process.exit(1);
  }

  const subDepts = await prisma.subDepartment.findMany({
    where: { departmentId: { in: deptIds } },
    select: { id: true, name: true },
  });

  const boardSubs = subDepts.filter((s) => {
    const n = norm(s.name);
    return n.includes('board') && n.includes('director');
  });

  if (boardSubs.length === 0) {
    console.error(
      'No sub-department named like "Board of Directors" under this company. Existing sub-departments:'
    );
    subDepts.forEach((s) => console.error(`  - ${s.name} (${s.id})`));
    process.exit(1);
  }

  const boardSubIds = boardSubs.map((s) => s.id);
  const positions = await prisma.position.findMany({
    where: { subDepartmentId: { in: boardSubIds } },
    select: { id: true, name: true, subDepartmentId: true },
  });

  if (positions.length === 0) {
    console.error('No positions under Board of Directors sub-departments.');
    process.exit(1);
  }

  const userCompanyOverride = argValue('--userCompany');
  const userWhere: { email?: object; company: object } = {
    company: userCompanyOverride
      ? { contains: userCompanyOverride.trim(), mode: 'insensitive' as const }
      : { equals: company.name, mode: 'insensitive' as const },
  };
  if (emailArg) {
    userWhere.email = { equals: emailArg.trim(), mode: 'insensitive' };
  }

  const candidates = await prisma.user.findMany({
    where: userWhere,
    select: { id: true, email: true, firstName: true, lastName: true, company: true },
  });

  const hay = (u: { firstName: string; lastName: string }) =>
    norm(`${u.firstName} ${u.lastName}`);

  const users = candidates.filter((u) => {
    const h = hay(u);
    return nameTokens.every((t) => h.includes(t));
  });

  if (users.length === 0) {
    console.error(
      `No user in company "${company.name}" (User.company) matching name tokens: ${nameTokens.join(', ')}`
    );
    if (emailArg) console.error('(with email filter applied)');
    console.error('Candidates in same company string (first 20):');
    const anyInCompany = await prisma.user.findMany({
      where: { company: { equals: company.name, mode: 'insensitive' } },
      take: 20,
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    anyInCompany.forEach((u) => console.error(`  - ${u.firstName} ${u.lastName} <${u.email}> ${u.id}`));
    process.exit(1);
  }

  if (users.length > 1) {
    console.error('Multiple users match; add --email=... to pick one:');
    users.forEach((u) => console.error(`  - ${u.firstName} ${u.lastName} <${u.email}> ${u.id}`));
    process.exit(1);
  }

  const user = users[0];
  const positionIds = positions.map((p) => p.id);

  const existing = await prisma.employeePositionAssignment.findMany({
    where: { userId: user.id, positionId: { in: positionIds } },
    include: { position: { select: { name: true, subDepartmentId: true } } },
  });

  const subNameById = new Map(boardSubs.map((s) => [s.id, s.name]));

  console.log(`Company: ${company.name} (${company.id})`);
  console.log(
    `Board sub-departments: ${boardSubs.map((s) => s.name).join(', ')}`
  );
  console.log(`Employee: ${user.firstName} ${user.lastName} <${user.email}> (${user.id})`);
  console.log(`Matching Board positions: ${positions.length}`);
  existing.forEach((a) => {
    const sub = subNameById.get(a.position.subDepartmentId) || '?';
    console.log(`  assignment ${a.id} → position "${a.position.name}" (${a.positionId}) under "${sub}"`);
  });

  if (existing.length === 0) {
    console.log('No Board of Directors position assignments for this user — nothing to remove.');
    process.exit(0);
  }

  if (dryRun) {
    console.log('\nDry run only. Re-run with --execute to delete these assignments.');
    process.exit(0);
  }

  const del = await prisma.employeePositionAssignment.deleteMany({
    where: { userId: user.id, positionId: { in: positionIds } },
  });
  console.log(`\nDeleted ${del.count} employee_position_assignment row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
