import prisma from '../src/config/database';
import { resolveCompanyAccessScope } from '../src/services/companyAccess.service';
import { buildProjectWhereForCompanyScope } from '../src/utils/contractBranchFilter';

async function main() {
  const ola = await prisma.user.findFirst({
    where: { email: { equals: 'info.ad@onixgroup.ae', mode: 'insensitive' } },
    select: { id: true, role: true },
  });
  const pauline = await prisma.user.findFirst({
    where: { email: { equals: 'info@onixgroup.ae', mode: 'insensitive' } },
    select: { id: true, role: true },
  });

  for (const [label, user] of [
    ['Ola', ola],
    ['Pauline', pauline],
  ] as const) {
    if (!user) continue;
    const scope = await resolveCompanyAccessScope(user.id, user.role);
    const where = { deletedAt: null, ...(await buildProjectWhereForCompanyScope(scope)) };
    const projects = await prisma.project.findMany({
      where,
      select: { referenceNumber: true, name: true },
      orderBy: { referenceNumber: 'asc' },
    });
    console.log(
      `${label} sees ${projects.length} project(s):`,
      projects.map((p) => p.referenceNumber).join(', ') || '(none)',
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
