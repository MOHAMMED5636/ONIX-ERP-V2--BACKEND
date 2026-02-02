// Script to show all data in the database
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function showDatabase() {
  try {
    console.log('📊 ONIX ERP Database Contents\n');
    console.log('=' .repeat(60));
    
    // Users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        employeeId: true,
        createdAt: true
      }
    });
    console.log(`\n👤 USERS (${users.length}):`);
    if (users.length === 0) {
      console.log('   No users found');
    } else {
      users.forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.firstName} ${user.lastName} (${user.email}) - Role: ${user.role}, Active: ${user.isActive}`);
      });
    }
    
    // Companies
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        tag: true,
        status: true,
        industry: true,
        employees: true,
        createdAt: true
      }
    });
    console.log(`\n🏢 COMPANIES (${companies.length}):`);
    if (companies.length === 0) {
      console.log('   No companies found');
    } else {
      companies.forEach((company, i) => {
        console.log(`   ${i + 1}. ${company.name} (${company.tag || 'N/A'}) - Status: ${company.status}, Industry: ${company.industry || 'N/A'}, Employees: ${company.employees}`);
      });
    }
    
    // Clients
    const clients = await prisma.client.findMany({
      select: {
        id: true,
        name: true,
        referenceNumber: true,
        isCorporate: true,
        email: true,
        phone: true,
        createdAt: true
      }
    });
    console.log(`\n👥 CLIENTS (${clients.length}):`);
    if (clients.length === 0) {
      console.log('   No clients found');
    } else {
      clients.forEach((client, i) => {
        console.log(`   ${i + 1}. ${client.name} (${client.referenceNumber}) - Type: ${client.isCorporate}, Email: ${client.email || 'N/A'}`);
      });
    }
    
    // Projects
    const projects = await prisma.project.findMany({
      select: {
        id: true,
        name: true,
        referenceNumber: true,
        status: true,
        clientId: true,
        createdAt: true
      }
    });
    console.log(`\n📁 PROJECTS (${projects.length}):`);
    if (projects.length === 0) {
      console.log('   No projects found');
    } else {
      projects.forEach((project, i) => {
        console.log(`   ${i + 1}. ${project.name} (${project.referenceNumber}) - Status: ${project.status}`);
      });
    }
    
    // Tasks
    const tasks = await prisma.task.findMany({
      select: {
        id: true,
        title: true,
        status: true,
        projectId: true,
        createdAt: true
      }
    });
    console.log(`\n✅ TASKS (${tasks.length}):`);
    if (tasks.length === 0) {
      console.log('   No tasks found');
    } else {
      tasks.forEach((task, i) => {
        console.log(`   ${i + 1}. ${task.title} - Status: ${task.status}`);
      });
    }
    
    // Tenders
    const tenders = await prisma.tender.findMany({
      select: {
        id: true,
        name: true,
        referenceNumber: true,
        status: true,
        projectId: true,
        createdAt: true
      }
    });
    console.log(`\n📋 TENDERS (${tenders.length}):`);
    if (tenders.length === 0) {
      console.log('   No tenders found');
    } else {
      tenders.forEach((tender, i) => {
        console.log(`   ${i + 1}. ${tender.name} (${tender.referenceNumber}) - Status: ${tender.status}`);
      });
    }
    
    // Documents
    const documents = await prisma.document.findMany({
      select: {
        id: true,
        fileName: true,
        referenceCode: true,
        module: true,
        documentType: true,
        projectId: true,
        uploadedAt: true
      }
    });
    console.log(`\n📄 DOCUMENTS (${documents.length}):`);
    if (documents.length === 0) {
      console.log('   No documents found');
    } else {
      documents.forEach((doc, i) => {
        console.log(`   ${i + 1}. ${doc.fileName} (${doc.referenceCode}) - Module: ${doc.module}, Type: ${doc.documentType}`);
      });
    }
    
    // Project Assignments
    const projectAssignments = await prisma.projectAssignment.findMany({
      select: {
        id: true,
        projectId: true,
        employeeId: true,
        assignedAt: true
      }
    });
    console.log(`\n🔗 PROJECT ASSIGNMENTS (${projectAssignments.length}):`);
    if (projectAssignments.length === 0) {
      console.log('   No project assignments found');
    } else {
      projectAssignments.forEach((assignment, i) => {
        console.log(`   ${i + 1}. Project: ${assignment.projectId}, Employee: ${assignment.employeeId}`);
      });
    }
    
    // Task Assignments
    const taskAssignments = await prisma.taskAssignment.findMany({
      select: {
        id: true,
        taskId: true,
        employeeId: true,
        status: true,
        assignedAt: true
      }
    });
    console.log(`\n📌 TASK ASSIGNMENTS (${taskAssignments.length}):`);
    if (taskAssignments.length === 0) {
      console.log('   No task assignments found');
    } else {
      taskAssignments.forEach((assignment, i) => {
        console.log(`   ${i + 1}. Task: ${assignment.taskId}, Employee: ${assignment.employeeId}, Status: ${assignment.status}`);
      });
    }
    
    // Departments
    const departments = await prisma.department.findMany({
      include: {
        company: {
          select: { name: true, tag: true }
        },
        manager: {
          select: { firstName: true, lastName: true, email: true }
        },
        subDepartments: {
          select: { id: true, name: true, status: true }
        }
      }
    });
    console.log(`\n🏢 DEPARTMENTS (${departments.length}):`);
    if (departments.length === 0) {
      console.log('   No departments found');
    } else {
      departments.forEach((dept, i) => {
        const managerName = dept.manager 
          ? `${dept.manager.firstName} ${dept.manager.lastName}` 
          : 'No Manager';
        const subDeptCount = dept.subDepartments?.length || 0;
        console.log(`   ${i + 1}. ${dept.name} (Company: ${dept.company.name}) - Manager: ${managerName}, Status: ${dept.status}, Sub-Departments: ${subDeptCount}`);
        if (dept.description) {
          console.log(`      Description: ${dept.description.substring(0, 50)}${dept.description.length > 50 ? '...' : ''}`);
        }
      });
    }
    
    // Sub-Departments
    const subDepartments = await prisma.subDepartment.findMany({
      include: {
        department: {
          include: {
            company: {
              select: { name: true }
            }
          }
        },
        manager: {
          select: { firstName: true, lastName: true, email: true }
        },
        positions: {
          select: { id: true, name: true, status: true }
        }
      }
    });
    console.log(`\n📂 SUB-DEPARTMENTS (${subDepartments.length}):`);
    if (subDepartments.length === 0) {
      console.log('   No sub-departments found');
    } else {
      subDepartments.forEach((subDept, i) => {
        const managerName = subDept.manager 
          ? `${subDept.manager.firstName} ${subDept.manager.lastName}` 
          : 'No Manager';
        const positionCount = subDept.positions?.length || 0;
        console.log(`   ${i + 1}. ${subDept.name} (Dept: ${subDept.department.name}, Company: ${subDept.department.company.name}) - Manager: ${managerName}, Status: ${subDept.status}, Positions: ${positionCount}`);
        if (subDept.description) {
          console.log(`      Description: ${subDept.description.substring(0, 50)}${subDept.description.length > 50 ? '...' : ''}`);
        }
      });
    }
    
    // Positions
    const positions = await prisma.position.findMany({
      include: {
        subDepartment: {
          include: {
            department: {
              include: {
                company: {
                  select: { name: true }
                }
              }
            }
          }
        }
      }
    });
    console.log(`\n💼 POSITIONS (${positions.length}):`);
    if (positions.length === 0) {
      console.log('   No positions found');
    } else {
      positions.forEach((position, i) => {
        console.log(`   ${i + 1}. ${position.name} (Sub-Dept: ${position.subDepartment.name}, Dept: ${position.subDepartment.department.name}, Company: ${position.subDepartment.department.company.name}) - Status: ${position.status}`);
        if (position.description) {
          console.log(`      Description: ${position.description.substring(0, 50)}${position.description.length > 50 ? '...' : ''}`);
        }
      });
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('\n📈 DATABASE SUMMARY:');
    console.log(`   Users: ${users.length}`);
    console.log(`   Companies: ${companies.length}`);
    console.log(`   Departments: ${departments.length}`);
    console.log(`   Sub-Departments: ${subDepartments.length}`);
    console.log(`   Positions: ${positions.length}`);
    console.log(`   Clients: ${clients.length}`);
    console.log(`   Projects: ${projects.length}`);
    console.log(`   Tasks: ${tasks.length}`);
    console.log(`   Tenders: ${tenders.length}`);
    console.log(`   Documents: ${documents.length}`);
    console.log(`   Project Assignments: ${projectAssignments.length}`);
    console.log(`   Task Assignments: ${taskAssignments.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

showDatabase();

