const { PrismaClient } = require('@prisma/client');

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const role = (process.argv[3] || '').trim().toUpperCase();
  if (!email || !role) {
    console.error('Usage: node scripts/set-user-role.js <email> <role>');
    process.exit(2);
  }

  const p = new PrismaClient();
  try {
    const updated = await p.user.update({
      where: { email },
      data: { role },
      select: { id: true, email: true, role: true },
    });
    console.log(updated);
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

