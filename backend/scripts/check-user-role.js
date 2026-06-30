const { PrismaClient } = require('@prisma/client');

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: node scripts/check-user-role.js <email>');
    process.exit(2);
  }

  const p = new PrismaClient();
  try {
    const user = await p.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, isActive: true },
    });
    console.log(user || null);
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

