const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const companies = await prisma.company.findMany({
      where: { name: { contains: 'ONIX', mode: 'insensitive' } },
      select: {
        id: true,
        name: true,
        logo: true,
        header: true,
        attachments: {
          select: { category: true, label: true, filePath: true, fileName: true },
          take: 20,
        },
      },
    });
    console.log(JSON.stringify(companies, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
