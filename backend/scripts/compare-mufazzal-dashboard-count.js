const { PrismaClient, ProjectStatus } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const user = await p.user.findFirst({
    where: { email: { contains: 'mufazzal', mode: 'insensitive' } },
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
  });
  if (!user) {
    console.log('no user');
    return;
  }
  console.log('User:', user.email, user.role);
  const fn = (user.firstName || '').trim().toLowerCase();
  const ln = (user.lastName || '').trim().toLowerCase();
  const full = `${fn} ${ln}`.trim();
  const names = [full, fn, ln, fn && ln ? `${fn} ${ln.charAt(0)}` : ''].filter(Boolean);
  const active = [
    ProjectStatus.OPEN,
    ProjectStatus.IN_PROGRESS,
    ProjectStatus.SUBMITTED_IN_PROGRESS,
  ];
  const oldOr = [
    { createdBy: user.id },
    { assignedEmployees: { some: { employeeId: user.id } } },
    {
      tasks: {
        some: {
          OR: [
            { createdBy: user.id },
            { assignedEmployeeId: user.id },
            { assignments: { some: { employeeId: user.id } } },
          ],
        },
      },
    },
    { contracts: { some: { assignedManagerId: user.id } } },
    { contracts: { some: { assignedManagerEmail: user.email } } },
    { OR: names.map((n) => ({ projectManager: { contains: n, mode: 'insensitive' } })) },
  ];
  const strictOr = [
    { contracts: { some: { assignedManagerId: user.id } } },
    { contracts: { some: { assignedManagerEmail: user.email } } },
    {
      AND: [
        {
          NOT: {
            contracts: {
              some: {
                OR: [
                  { assignedManagerId: { not: null } },
                  { assignedManagerEmail: { not: null } },
                ],
              },
            },
          },
        },
        {
          OR: [full, fn && ln ? `${fn} ${ln.charAt(0)}` : '']
            .filter(Boolean)
            .map((n) => ({ projectManager: { contains: n, mode: 'insensitive' } })),
        },
      ],
    },
  ];
  const oldProjects = await p.project.findMany({
    where: {
      deletedAt: null,
      status: { in: [ProjectStatus.OPEN, ProjectStatus.IN_PROGRESS] },
      OR: oldOr,
    },
    select: { referenceNumber: true, status: true, projectManager: true, createdBy: true },
  });
  const newProjects = await p.project.findMany({
    where: { deletedAt: null, status: { in: active }, OR: strictOr },
    select: { referenceNumber: true, status: true, projectManager: true },
  });
  const strictAll = await p.project.findMany({
    where: { deletedAt: null, OR: strictOr },
    select: { referenceNumber: true, status: true },
  });
  const onlyOld = oldProjects.filter(
    (op) => !newProjects.some((np) => np.referenceNumber === op.referenceNumber),
  );
  console.log(
    'Old dashboard (loose):',
    oldProjects.length,
    oldProjects.map((x) => `${x.referenceNumber} ${x.status}`),
  );
  console.log(
    'New dashboard (strict PM):',
    newProjects.length,
    newProjects.map((x) => `${x.referenceNumber} ${x.status}`),
  );
  console.log('Strict PM all statuses:', strictAll.map((x) => `${x.referenceNumber} ${x.status}`));
  console.log('Extra in old dashboard only:', onlyOld);
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
