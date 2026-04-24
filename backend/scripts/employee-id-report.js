const { PrismaClient } = require("@prisma/client");

function isDigits(s) {
  return /^\d+$/.test(s);
}

function sortEmployeeIds(a, b) {
  const ad = isDigits(a);
  const bd = isDigits(b);
  if (ad && bd) {
    const an = BigInt(a);
    const bn = BigInt(b);
    return an < bn ? -1 : an > bn ? 1 : 0;
  }
  return a.localeCompare(b);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.user.findMany({
      where: { employeeId: { not: null } },
      select: {
        id: true,
        employeeId: true,
        isActive: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    const employees = rows
      .map((r) => ({
        ...r,
        employeeId: String(r.employeeId || "").trim(),
        name: `${r.firstName || ""} ${r.lastName || ""}`.trim(),
      }))
      .filter((r) => r.employeeId);

    employees.sort((a, b) => sortEmployeeIds(a.employeeId, b.employeeId));

    const allNumeric = employees.length > 0 && employees.every((e) => isDigits(e.employeeId));

    const inactive = employees.filter((e) => !e.isActive).map((e) => e.employeeId);

    let missing = [];
    if (allNumeric) {
      const nums = employees.map((e) => BigInt(e.employeeId));
      const set = new Set(nums.map((n) => n.toString()));
      const min = nums[0];
      const max = nums[nums.length - 1];
      for (let n = min; n <= max; n = n + 1n) {
        if (!set.has(n.toString())) missing.push(n.toString());
        if (missing.length > 5000) {
          missing.push("...");
          break;
        }
      }
    }

    const out = {
      totalEmployees: employees.length,
      allNumericEmployeeIds: allNumeric,
      inactiveCount: inactive.length,
      inactiveEmployeeIds: inactive,
      missingCount: missing.length,
      missingEmployeeIds: missing,
      employeeIds: employees.map((e) => ({
        employeeId: e.employeeId,
        isActive: e.isActive,
        userId: e.id,
        name: e.name,
        email: e.email || "",
      })),
    };

    console.log(JSON.stringify(out, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

