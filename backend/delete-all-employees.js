/**
 * Delete All Employees Script
 * 
 * This script deletes all employees from the database AND their files/photos EXCEPT:
 * - ADMIN users (needed for system access)
 * - TENDER_ENGINEER users (needed for tender management)
 * 
 * WARNING: This will permanently delete all employee records AND their files!
 * Make sure you have a backup before running this script.
 * 
 * Usage: node delete-all-employees.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const prisma = new PrismaClient();

// Get upload directory from environment or use default
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const PHOTOS_DIR = path.join(UPLOAD_DIR, 'photos');

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
        employeeId: true,
        photo: true,
        passportAttachment: true,
        nationalIdAttachment: true,
        residencyAttachment: true,
        insuranceAttachment: true,
        drivingLicenseAttachment: true,
        labourIdAttachment: true
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
    console.log('📁 Upload directory:', path.resolve(UPLOAD_DIR));
    console.log('📸 Photos directory:', path.resolve(PHOTOS_DIR));
    
    // Step 0: Delete related records first (they reference employees with RESTRICT constraints)
    const employeeIds = employees.map(emp => emp.id);
    
    console.log('\n📅 Deleting employee attendance records...');
    try {
      const deletedAttendances = await prisma.attendance.deleteMany({
        where: {
          userId: {
            in: employeeIds
          }
        }
      });
      console.log(`   ✅ Deleted ${deletedAttendances.count} attendance record(s)`);
    } catch (attError) {
      console.error('   ⚠️  Error deleting attendance records:', attError.message);
    }
    
    console.log('\n🏖️  Deleting employee leave records...');
    try {
      const deletedLeaves = await prisma.leave.deleteMany({
        where: {
          userId: {
            in: employeeIds
          }
        }
      });
      console.log(`   ✅ Deleted ${deletedLeaves.count} leave record(s)`);
    } catch (leaveError) {
      console.error('   ⚠️  Error deleting leave records:', leaveError.message);
    }
    
    console.log('\n📋 Deleting employee project assignments...');
    try {
      const deletedAssignments = await prisma.projectAssignment.deleteMany({
        where: {
          employeeId: {
            in: employeeIds
          }
        }
      });
      console.log(`   ✅ Deleted ${deletedAssignments.count} project assignment(s)`);
    } catch (assignError) {
      console.error('   ⚠️  Error deleting project assignments:', assignError.message);
    }
    
    console.log('\n✅ Deleting employee task assignments...');
    try {
      const deletedTaskAssignments = await prisma.taskAssignment.deleteMany({
        where: {
          employeeId: {
            in: employeeIds
          }
        }
      });
      console.log(`   ✅ Deleted ${deletedTaskAssignments.count} task assignment(s)`);
    } catch (taskAssignError) {
      console.error('   ⚠️  Error deleting task assignments:', taskAssignError.message);
    }

    // Delete employees one by one to handle cascading relationships properly
    let deletedCount = 0;
    let errorCount = 0;
    let filesDeleted = 0;
    let filesError = 0;

    for (const employee of employees) {
      try {
        // Step 1: Delete employee files/photos before deleting the record
        const filesToDelete = [];
        
        // Collect all file paths
        if (employee.photo) filesToDelete.push({ path: path.join(PHOTOS_DIR, employee.photo), type: 'photo' });
        if (employee.passportAttachment) filesToDelete.push({ path: employee.passportAttachment, type: 'passport' });
        if (employee.nationalIdAttachment) filesToDelete.push({ path: employee.nationalIdAttachment, type: 'nationalId' });
        if (employee.residencyAttachment) filesToDelete.push({ path: employee.residencyAttachment, type: 'residency' });
        if (employee.insuranceAttachment) filesToDelete.push({ path: employee.insuranceAttachment, type: 'insurance' });
        if (employee.drivingLicenseAttachment) filesToDelete.push({ path: employee.drivingLicenseAttachment, type: 'drivingLicense' });
        if (employee.labourIdAttachment) filesToDelete.push({ path: employee.labourIdAttachment, type: 'labourId' });

        // Delete files
        for (const file of filesToDelete) {
          try {
            const fullPath = path.isAbsolute(file.path) ? file.path : path.join(process.cwd(), file.path);
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
              filesDeleted++;
              console.log(`   📄 Deleted ${file.type} file: ${path.basename(file.path)}`);
            }
          } catch (fileError) {
            filesError++;
            console.error(`   ⚠️  Error deleting ${file.type} file for ${employee.email}:`, fileError.message);
          }
        }

        // Step 2: Delete related records first (if any)
        // Note: Prisma will handle cascading deletes based on schema relationships
        
        // Step 3: Delete the employee from database
        await prisma.user.delete({
          where: { id: employee.id }
        });

        deletedCount++;
        console.log(`   ✅ Deleted employee: ${employee.firstName} ${employee.lastName} (${employee.email})`);
      } catch (error) {
        errorCount++;
        console.error(`   ❌ Error deleting ${employee.email}:`, error.message);
      }
    }

    console.log('\n📊 Deletion Summary:');
    console.log(`   ✅ Successfully deleted: ${deletedCount} employees`);
    console.log(`   📄 Files deleted: ${filesDeleted} files`);
    if (errorCount > 0) {
      console.log(`   ❌ Database errors: ${errorCount} employees`);
    }
    if (filesError > 0) {
      console.log(`   ⚠️  File deletion errors: ${filesError} files`);
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
