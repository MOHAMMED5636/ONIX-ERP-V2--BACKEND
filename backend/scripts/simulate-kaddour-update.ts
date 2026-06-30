import prisma from '../src/config/database';
import { normalizeEmployeeDirectoryBody } from '../src/utils/employee-directory-body';

async function main() {
  const u = await prisma.user.findUnique({
    where: { id: 'd6dab32a-eeda-473b-999f-b39234a973f4' },
    select: { jobTitle: true, managerId: true, isLineManager: true, company: true, employeeId: true },
  });
  console.log('User:', u);

  // Simulate frontend FormData body (manager string N/A + driving license 1)
  const simulated = normalizeEmployeeDirectoryBody({
    firstName: 'KADDOUR AHMED',
    lastName: 'ALKADDOUR',
    drivingLicenseNumber: '1',
    manager: 'N/A',
    managerId: '1',
    changeReason: 'test',
  });
  console.log('Normalized managerId:', simulated.managerId);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
