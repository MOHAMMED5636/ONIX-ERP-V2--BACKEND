import prisma from '../src/config/database';
import { resolveCompanyAccessScope } from '../src/services/companyAccess.service';

async function main() {
  const pauline = await prisma.user.findFirst({
    where: { email: { equals: 'info@onixgroup.ae', mode: 'insensitive' } },
    select: { id: true, role: true, company: true, companyLocation: true },
  });
  if (!pauline) {
    console.log('Pauline not found');
    return;
  }
  const scope = await resolveCompanyAccessScope(pauline.id, pauline.role);
  console.log('Pauline scope:', JSON.stringify(scope, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
