const { PrismaClient } = require("@prisma/client");

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email) {
    console.error("Usage: node scripts/get-user-by-email.js <email>");
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    const u = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        employeeId: true,
        isActive: true,
        userAccount: true,
        department: true,
        position: true,
        jobTitle: true,
        phone: true,
        company: true,
        companyLocation: true,
        attendanceProgram: true,
        joiningDate: true,
        exitDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    console.log(JSON.stringify(u, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

