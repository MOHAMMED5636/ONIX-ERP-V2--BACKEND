import 'dotenv/config';
import prisma from '../src/config/database';
import { shapeEmployeeForClient } from '../src/utils/employee-response';
import { normalizeEmployeeDirectoryBody } from '../src/utils/employee-directory-body';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function simulateFormDataAppend(employeeData: Record<string, unknown>) {
  const fileFields = new Set([
    'photo',
    'personalImage',
    'passportAttachment',
    'nationalIdAttachment',
    'residencyAttachment',
    'insuranceAttachment',
    'drivingLicenseAttachment',
    'labourIdAttachment',
    'curriculumVitaeAttachment',
  ]);
  const skipTopLevelKeys = new Set([
    'name',
    'legal',
    'legalDocuments',
    'userAccount',
    'documents',
    'assignedProjects',
    'changeReason',
    'updateReason',
  ]);
  const body: Record<string, unknown> = {};
  for (const key of Object.keys(employeeData)) {
    if (fileFields.has(key) || skipTopLevelKeys.has(key)) continue;
    const val = employeeData[key];
    if (key === 'manager' && val !== null && typeof val === 'object') continue;
    if (val !== null && val !== undefined && val !== '') {
      if (typeof val === 'object' && !(val instanceof File)) continue;
      body[key] = val;
    }
  }
  if (Object.prototype.hasOwnProperty.call(employeeData, 'managerId') && employeeData.managerId === null) {
    body.managerId = '';
  }
  if (employeeData.changeReason) body.changeReason = employeeData.changeReason;
  return body;
}

async function main() {
  const employee = await prisma.user.findUnique({
    where: { id: 'd6dab32a-eeda-473b-999f-b39234a973f4' },
    include: {
      manager: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  if (!employee) return;

  const shaped = shapeEmployeeForClient(employee as unknown as Record<string, unknown>);
  const editState = {
    ...shaped,
    manager: shaped.manager
      ? `${(shaped.manager as any).firstName || ''} ${(shaped.manager as any).lastName || ''}`.trim()
      : 'N/A',
    drivingLicenseNumber: '1',
    changeReason: 'vdcfv',
  };
  const formBody = simulateFormDataAppend(editState);
  console.log('Form body managerId:', formBody.managerId);
  console.log('Form body keys with manager:', Object.keys(formBody).filter((k) => k.toLowerCase().includes('manager')));

  const normalized = normalizeEmployeeDirectoryBody(formBody);
  console.log('Normalized managerId:', normalized.managerId);
  console.log('Is UUID:', UUID.test(String(normalized.managerId ?? '')));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
