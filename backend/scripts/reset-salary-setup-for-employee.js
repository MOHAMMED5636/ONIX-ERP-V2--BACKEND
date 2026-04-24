const { PrismaClient } = require('@prisma/client');

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const needleA = norm(process.argv[2] || 'mohammed');
    const needleB = norm(process.argv[3] || 'nazar');

    const users = await prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { firstName: { contains: needleA, mode: 'insensitive' } },
              { lastName: { contains: needleA, mode: 'insensitive' } },
              { email: { contains: needleA, mode: 'insensitive' } },
            ],
          },
          {
            OR: [
              { firstName: { contains: needleB, mode: 'insensitive' } },
              { lastName: { contains: needleB, mode: 'insensitive' } },
              { email: { contains: needleB, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: { id: true, firstName: true, lastName: true, email: true },
      take: 10,
    });

    if (!users.length) {
      console.log('No matching employee found for', { needleA, needleB });
      return;
    }

    // If multiple, pick the one with the longest lastName match (most specific).
    users.sort((a, b) => String(b.lastName || '').length - String(a.lastName || '').length);
    const chosen = users[0];

    console.log('Matched employees:', users);
    console.log('Chosen employee:', chosen);

    const before = await prisma.salaryStructure.count({ where: { employeeId: chosen.id } });
    console.log('Salary structures before:', before);

    // Cascade deletes allowances/deductions/increments because relations use onDelete: Cascade.
    const del = await prisma.salaryStructure.deleteMany({ where: { employeeId: chosen.id } });
    console.log('Deleted salary structures:', del.count);

    const after = await prisma.salaryStructure.count({ where: { employeeId: chosen.id } });
    console.log('Salary structures after:', after);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

