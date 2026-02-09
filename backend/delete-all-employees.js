/**
 * Delete All Employees Script
 * 
 * This script deletes all employees from the database EXCEPT:
 * - ADMIN users (needed for system access)
 * - TENDER_ENGINEER users (needed for tender management)
 * 
 * WARNING: This will permanently delete all employee records!
 * Make sure you have a backup before running this script.
 * 
 * Usage: node delete-all-employees.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteAllEmployees() {
  try {
    console.log('🔍 Finding all employees to delete...');
    
    // Find all employees (excluding ADMIN and TENDER_ENGINEER roles)
    const employees = await prisma.user.findMany({
      where: {
        role: {
          notIn: ['ADMIN', 'TENDER_ENGINEER']
        }
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        employeeId: true
      }
    });

    console.log(`📊 Found ${employees.length} employees to delete:`);
    employees.forEach((emp, index) => {
      console.log(`   ${index + 1}. ${emp.firstName} ${emp.lastName} (${emp.email}) - Role: ${emp.role}`);
    });

    if (employees.length === 0) {
      console.log('✅ No employees found to delete.');
      return;
    }

    // Confirm deletion
    console.log('\n⚠️  WARNING: This will permanently delete all employees!');
    console.log('⚠️  ADMIN and TENDER_ENGINEER users will be preserved.');
    console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to proceed...');
    
    // Wait 5 seconds for user to cancel
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('\n🗑️  Starting deletion...');

    // Delete employees one by one to handle cascading relationships properly
    let deletedCount = 0;
    let errorCount = 0;

    for (const employee of employees) {
      try {
        // Delete related records first (if any)
        // Note: Prisma will handle cascading deletes based on schema relationships
        
        // Delete the employee
        await prisma.user.delete({
          where: { id: employee.id }
        });

        deletedCount++;
        console.log(`   ✅ Deleted: ${employee.firstName} ${employee.lastName} (${employee.email})`);
      } catch (error) {
        errorCount++;
        console.error(`   ❌ Error deleting ${employee.email}:`, error.message);
      }
    }

    console.log('\n📊 Deletion Summary:');
    console.log(`   ✅ Successfully deleted: ${deletedCount} employees`);
    if (errorCount > 0) {
      console.log(`   ❌ Errors: ${errorCount} employees`);
    }

    // Verify deletion
    const remainingEmployees = await prisma.user.count({
      where: {
        role: {
          notIn: ['ADMIN', 'TENDER_ENGINEER']
        }
      }
    });

    console.log(`\n🔍 Verification: ${remainingEmployees} employees remaining in database.`);
    
    if (remainingEmployees === 0) {
      console.log('✅ All employees successfully deleted!');
    } else {
      console.log(`⚠️  Warning: ${remainingEmployees} employees still exist. They may have relationships preventing deletion.`);
    }

  } catch (error) {
    console.error('❌ Error during deletion:', error);
    throw error;
  }
}

async function main() {
  try {
    await deleteAllEmployees();
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main();
