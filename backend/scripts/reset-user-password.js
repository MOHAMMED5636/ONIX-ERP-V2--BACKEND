/**
 * Usage:
 *   node scripts/reset-user-password.js admin@onixgroup.ae "Manu@123"
 *
 * Notes:
 * - This updates the DB directly (admin/dev use only).
 * - Passwords are stored hashed; this sets a NEW password.
 */

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error('Usage: node scripts/reset-user-password.js <email> <newPassword>');
    process.exit(1);
  }

  if (String(newPassword).length < 8) {
    console.error('Error: newPassword must be at least 8 characters.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email: String(email).trim().toLowerCase() },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
    });

    if (!user) {
      console.error(`User not found for email: ${email}`);
      process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(String(newPassword), 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        forcePasswordChange: false,
      },
    });

    console.log(
      JSON.stringify(
        {
          success: true,
          message: 'Password reset successfully.',
          user: {
            id: user.id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`.trim(),
            role: user.role,
            isActive: user.isActive,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

