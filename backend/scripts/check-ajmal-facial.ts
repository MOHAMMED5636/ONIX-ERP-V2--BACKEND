import prisma from '../src/config/database';
import { config } from '../src/config/env';
import {
  buildProfilePhotoUrl,
  companyRequiresFacial,
  isFacialAttendanceExempt,
  isMobileUserAgent,
  resolveFacialMinScore,
} from '../src/services/faceAttendance.service';

async function main() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: 'ajmal', mode: 'insensitive' } },
        { lastName: { contains: 'moideen', mode: 'insensitive' } },
        { lastName: { contains: 'kutty', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      photo: true,
      company: true,
      department: true,
    },
  });

  console.log('API_PUBLIC_URL:', process.env.API_PUBLIC_URL || '(not set, using LAN fallback)');
  console.log('Resolved apiPublicUrl:', config.apiPublicUrl);
  console.log('');

  for (const user of users) {
    console.log('='.repeat(60));
    console.log('User:', user.firstName, user.lastName);
    console.log('Email:', user.email);
    console.log('Role:', user.role);
    console.log('Company field:', user.company || '(empty)');
    console.log('Photo in DB:', user.photo || '(MISSING)');

    let company = null;
    if (user.company) {
      company = await prisma.company.findFirst({
        where: { name: user.company },
        select: {
          id: true,
          name: true,
          requireFacialAttendance: true,
          facialMatchMinScore: true,
        },
      });
    }
    if (!company) {
      company = await prisma.company.findFirst({
        select: {
          id: true,
          name: true,
          requireFacialAttendance: true,
          facialMatchMinScore: true,
        },
      });
      console.log('Company match: FALLBACK to first company →', company?.name);
    } else {
      console.log('Company match:', company.name);
    }

    const exempt = isFacialAttendanceExempt(user.role);
    const required = !exempt && companyRequiresFacial(company);
    const profilePhotoUrl = buildProfilePhotoUrl(config.apiPublicUrl, user.photo);
    const mobileUa =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

    console.log('');
    console.log('Facial attendance config (as API would return):');
    console.log({
      required,
      exempt,
      hasProfilePhoto: !!user.photo,
      profilePhotoUrl,
      minMatchScore: resolveFacialMinScore(company),
      isMobileClient: isMobileUserAgent(mobileUa),
      requiresFacialOnThisDevice: required && isMobileUserAgent(mobileUa),
      companyRequireFacial: company?.requireFacialAttendance,
    });

    const assigned = await prisma.task.findMany({
      where: {
        assignedEmployeeId: user.id,
        deletedAt: null,
      },
      select: { id: true, title: true, project: { select: { referenceNumber: true } } },
      take: 5,
    });
    console.log('');
    console.log('Active assigned tasks (sample):', assigned.length);
    assigned.forEach((t) =>
      console.log(`  - ${t.project?.referenceNumber}: ${t.title?.slice(0, 40)}`),
    );

    const faceAtt = await prisma.attendance.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        date: true,
        type: true,
        faceVerified: true,
        faceMatchScore: true,
        deviceInfo: true,
        checkInTime: true,
      },
    });
    console.log('');
    console.log('Recent attendance (last 3):');
    if (faceAtt.length === 0) console.log('  (none)');
    faceAtt.forEach((a) =>
      console.log(
        `  - ${a.date} ${a.type} faceVerified=${a.faceVerified} score=${a.faceMatchScore} device=${a.deviceInfo}`,
      ),
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
