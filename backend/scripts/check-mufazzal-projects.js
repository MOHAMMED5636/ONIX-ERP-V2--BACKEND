const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { contains: 'mufazzal', mode: 'insensitive' } },
          { firstName: { contains: 'mufazzal', mode: 'insensitive' } },
        ],
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
    console.log('user', user);
    if (!user) return;

    for (const ref of ['2588', '2507', '2539', '2583']) {
      const proj = await prisma.project.findFirst({
        where: {
          OR: [{ referenceNumber: ref }, { referenceNumber: { contains: ref } }],
        },
        select: {
          id: true,
          referenceNumber: true,
          projectManager: true,
          createdBy: true,
          name: true,
          contracts: {
            select: { assignedManagerId: true, assignedManagerEmail: true },
          },
        },
      });
      const reasons = [];
      if (proj) {
        const fn = (user.firstName || '').trim().toLowerCase();
        const ln = (user.lastName || '').trim().toLowerCase();
        const full = `${fn} ${ln}`.trim();
        const pm = String(proj.projectManager || '').toLowerCase();
        const hasContractPm = proj.contracts?.some((c) => c.assignedManagerId || c.assignedManagerEmail);
        if (proj.contracts?.some((c) => c.assignedManagerId === user.id)) reasons.push('contractManagerId');
        if (proj.contracts?.some((c) => c.assignedManagerEmail === user.email)) reasons.push('contractManagerEmail');
        if (!hasContractPm && full && pm.includes(full)) reasons.push('projectManagerFullName');
        if (!hasContractPm && fn && ln && pm.includes(`${fn} ${ln.charAt(0)}`)) reasons.push('projectManagerInitial');
        if (proj.createdBy === user.id) reasons.push('createdBy_ONLY_NOT_ACCESS');
      }
      console.log(`\nproject ${ref}:`, proj);
      console.log('match reasons:', reasons);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
