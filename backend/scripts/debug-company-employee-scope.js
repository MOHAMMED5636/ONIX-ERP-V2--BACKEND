const prisma = require('../dist/config/database').default || require('../dist/config/database');
const { buildCompanyNameAliases, buildCompanyScopeAliases } = require('../dist/utils/company-name-aliases');

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error('Usage: node scripts/debug-company-employee-scope.js <companyId>');
    process.exit(2);
  }

  const company = await prisma.company.findUnique({
    where: { id: String(companyId).trim() },
    select: { id: true, name: true, parentCompanyId: true },
  });
  if (!company) {
    console.error('Company not found:', companyId);
    process.exit(1);
  }

  let parentName = null;
  if (company.parentCompanyId) {
    const parent = await prisma.company.findUnique({
      where: { id: String(company.parentCompanyId).trim() },
      select: { id: true, name: true },
    });
    parentName = parent?.name || null;
  }

  const aliases = buildCompanyScopeAliases(company.name, parentName);
  const exactAliases = buildCompanyNameAliases(company.name);

  console.log('Company:', company);
  console.log('Parent name:', parentName);
  console.log('Exact aliases:', exactAliases);
  console.log('Scope aliases:', aliases);

  const counts = [];
  for (const n of aliases) {
    const c = await prisma.user.count({
      where: {
        role: { notIn: ['TENDER_ENGINEER'] },
        isActive: true,
        company: { equals: n, mode: 'insensitive' },
      },
    });
    counts.push([n, c]);
  }
  console.log('Counts per alias:');
  for (const [n, c] of counts) console.log('-', JSON.stringify(n), c);

  const top = await prisma.user.groupBy({
    by: ['company'],
    where: { role: { notIn: ['TENDER_ENGINEER'] }, isActive: true },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });
  console.log('Top company values (active):');
  for (const row of top) console.log('-', JSON.stringify(row.company), row._count.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch {}
  });

