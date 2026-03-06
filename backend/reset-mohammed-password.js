const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function resetPassword() {
  try {
    const email = 'mohammed@onixgroup.ae';
    const newPassword = 'mohammed123'; // Set your desired password here
    
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    if (!user) {
      console.log(`❌ User ${email} not found in database.`);
      console.log('💡 The user might not exist or the email might be different.');
      console.log('💡 Check the Employee Directory in the admin panel to find the correct email.');
      return;
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        forcePasswordChange: false,
      },
    });

    console.log('✅ Password reset successfully!');
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 New Password: ${newPassword}`);
    console.log(`👤 Name: ${user.firstName} ${user.lastName}`);
    console.log(`🎭 Role: ${user.role}`);
    console.log('\n⚠️  Please change this password after first login for security.');
  } catch (error) {
    console.error('❌ Error resetting password:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();
