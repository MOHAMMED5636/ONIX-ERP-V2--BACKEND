# Payroll Integration Plan - Complete Implementation Guide

## ✅ Feasibility: YES, This is 100% Possible

The existing system has all required data:
- ✅ **Employees**: `User` model with `employeeId`, `joiningDate`, `status`, `department`
- ✅ **Salary**: `LabourDetails` model with `basicSalary`, `allowance1`, `allowance2`, `contractTotalSalary`
- ✅ **Attendance**: `Attendance` model with `userId`, `date`, `checkInTime`, `checkOutTime`, `status` (LATE, ABSENT, etc.)
- ✅ **Leaves**: `Leave` model with `userId`, `startDate`, `endDate`, `type`, `status`, `days`

## 📋 Table of Contents
1. [Database Schema](#database-schema)
2. [Data Linking Strategy](#data-linking-strategy)
3. [Calculation Logic](#calculation-logic)
4. [Implementation Steps](#implementation-steps)
5. [API Endpoints](#api-endpoints)
6. [Code Examples](#code-examples)

---

## 1. Database Schema

### Prisma Schema Addition

Add these models to `schema.prisma`:

```prisma
// Payroll Settings - Configurable deduction rules
model PayrollSettings {
  id                    String   @id @default(uuid())
  gracePeriodMinutes    Int      @default(15) // Minutes before late deduction applies
  lateDeductionPerMinute Decimal @db.Decimal(10, 2) @default(0.5) // AED per minute late
  absenceDeductionType  String   @default("DAILY") // DAILY or PERCENTAGE
  absenceDeductionValue Decimal  @db.Decimal(10, 2) @default(1.0) // Daily rate or percentage
  unpaidLeaveDeductionType String @default("DAILY") // DAILY or PERCENTAGE
  unpaidLeaveDeductionValue Decimal @db.Decimal(10, 2) @default(1.0)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  updatedBy             String? // User ID who last updated

  @@map("payroll_settings")
}

// Payroll Run - Represents one payroll processing period
model PayrollRun {
  id              String          @id @default(uuid())
  periodStart     DateTime        @db.Date // Start date of payroll period
  periodEnd        DateTime        @db.Date // End date of payroll period
  periodMonth     Int             // 1-12
  periodYear      Int             // e.g., 2024
  status          PayrollStatus   @default(DRAFT)
  totalEmployees  Int             @default(0)
  totalGross      Decimal         @db.Decimal(12, 2) @default(0)
  totalDeductions Decimal         @db.Decimal(12, 2) @default(0)
  totalNet        Decimal         @db.Decimal(12, 2) @default(0)
  
  // Approval workflow
  hrApprovedById   String?
  hrApprovedAt     DateTime?
  financeApprovedById String?
  financeApprovedAt   DateTime?
  finalApprovedById   String?
  finalApprovedAt     DateTime?
  lockedAt         DateTime? // When payroll is locked (final approval)
  
  // Snapshot of settings used (prevent future changes from affecting past payrolls)
  settingsSnapshot Json? // Store PayrollSettings as JSON at time of run
  
  createdById     String? // User ID who created this payroll run
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  lines           PayrollLine[]
  approvals       PayrollApproval[]
  auditLogs       PayrollAuditLog[]

  @@unique([periodMonth, periodYear]) // One payroll per month/year
  @@index([status])
  @@index([periodYear, periodMonth])
  @@map("payroll_runs")
}

enum PayrollStatus {
  DRAFT
  HR_PENDING
  HR_APPROVED
  FINANCE_PENDING
  FINANCE_APPROVED
  FINAL_APPROVED
  LOCKED
}

// Payroll Line - One record per employee per payroll run
model PayrollLine {
  id              String   @id @default(uuid())
  payrollRunId    String
  payrollRun      PayrollRun @relation(fields: [payrollRunId], references: [id], onDelete: Cascade)
  employeeId      String   // User.id (not employeeId string)
  employee        User     @relation("PayrollEmployee", fields: [employeeId], references: [id])
  
  // Snapshot of employee data at time of payroll (prevent future edits from changing past payrolls)
  snapshotEmployeeId    String? // employeeId string (e.g., "EMP001")
  snapshotBasicSalary   Decimal @db.Decimal(12, 2)
  snapshotAllowance1    Decimal @db.Decimal(12, 2) @default(0)
  snapshotAllowance2    Decimal @db.Decimal(12, 2) @default(0)
  snapshotTotalAllowances Decimal @db.Decimal(12, 2) @default(0)
  snapshotDepartment    String?
  
  // Calculated values
  grossSalary     Decimal @db.Decimal(12, 2) // Basic + Allowances
  totalDeductions Decimal @db.Decimal(12, 2) @default(0)
  netSalary       Decimal @db.Decimal(12, 2) // Gross - Deductions
  
  // Attendance summary (snapshot)
  totalWorkingDays    Int @default(0)
  totalAbsentDays     Int @default(0)
  totalLateInstances  Int @default(0)
  totalLateMinutes    Int @default(0)
  totalEarlyLeaveMinutes Int @default(0)
  
  // Leave summary (snapshot)
  paidLeaveDays       Int @default(0)
  unpaidLeaveDays     Int @default(0)
  
  // Deduction breakdown
  absenceDeduction     Decimal @db.Decimal(12, 2) @default(0)
  lateDeduction        Decimal @db.Decimal(12, 2) @default(0)
  unpaidLeaveDeduction Decimal @db.Decimal(12, 2) @default(0)
  manualAdjustments    Decimal @db.Decimal(12, 2) @default(0)
  adjustmentNotes      String? @db.Text
  
  // Payslip generation
  payslipGenerated     Boolean @default(false)
  payslipGeneratedAt   DateTime?
  payslipPath          String? // PDF file path
  
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  @@unique([payrollRunId, employeeId]) // One line per employee per run
  @@index([employeeId])
  @@index([payrollRunId])
  @@map("payroll_lines")
}

// Payroll Approval - Tracks approval workflow
model PayrollApproval {
  id            String          @id @default(uuid())
  payrollRunId  String
  payrollRun    PayrollRun      @relation(fields: [payrollRunId], references: [id], onDelete: Cascade)
  stage         PayrollApprovalStage
  approvedById  String? // User ID
  approvedBy    User?   @relation("PayrollApprover", fields: [approvedById], references: [id])
  approvedAt    DateTime?
  comments      String? @db.Text
  rejected      Boolean @default(false)
  rejectionReason String? @db.Text
  
  createdAt     DateTime @default(now())

  @@index([payrollRunId])
  @@index([stage])
  @@map("payroll_approvals")
}

enum PayrollApprovalStage {
  HR_REVIEW
  FINANCE_REVIEW
  FINAL_APPROVAL
}

// Payroll Audit Log - Tracks all changes to payroll runs
model PayrollAuditLog {
  id            String   @id @default(uuid())
  payrollRunId  String
  payrollRun    PayrollRun @relation(fields: [payrollRunId], references: [id], onDelete: Cascade)
  action        String   // CREATE, UPDATE, APPROVE, REJECT, LOCK, ADJUSTMENT
  performedById String? // User ID
  performedBy   User?    @relation("PayrollAuditor", fields: [performedById], references: [id])
  details       Json?    // Additional details about the action
  createdAt     DateTime @default(now())

  @@index([payrollRunId])
  @@index([action])
  @@map("payroll_audit_logs")
}
```

### Add Relations to Existing Models

Add to `User` model:
```prisma
  // Payroll Relations
  payrollLines    PayrollLine[] @relation("PayrollEmployee")
  payrollApprovals PayrollApproval[] @relation("PayrollApprover")
  payrollAuditLogs PayrollAuditLog[] @relation("PayrollAuditor")
```

---

## 2. Data Linking Strategy

### Key Identifiers

All modules use these shared identifiers:
- **Employee ID**: `User.id` (UUID) - Primary key for linking
- **Employee Number**: `User.employeeId` (String) - Display/Reference ID
- **Date**: `DateTime` or `Date` - For period-based queries

### Data Mapping

```typescript
// Employee Data Mapping
User.id → PayrollLine.employeeId
User.employeeId → PayrollLine.snapshotEmployeeId
User.joiningDate → Used to calculate prorated salary
User.status → Filter active employees (status === 'Active' && isActive === true)
User.department → PayrollLine.snapshotDepartment

// Salary Data Mapping
LabourDetails.userId → Links to User.id
LabourDetails.basicSalary → PayrollLine.snapshotBasicSalary
LabourDetails.allowance1 → PayrollLine.snapshotAllowance1
LabourDetails.allowance2 → PayrollLine.snapshotAllowance2
(allowance1 + allowance2) → PayrollLine.snapshotTotalAllowances

// Attendance Data Mapping
Attendance.userId → Links to User.id
Attendance.date → Filter by period (periodStart <= date <= periodEnd)
Attendance.status → Count ABSENT, LATE
Attendance.checkInTime → Calculate late minutes (if after grace period)
Attendance.checkOutTime → Calculate early leave minutes

// Leave Data Mapping
Leave.userId → Links to User.id
Leave.startDate, Leave.endDate → Overlap with payroll period
Leave.type → UNPAID → unpaidLeaveDays, others → paidLeaveDays
Leave.status → Only APPROVED leaves count
Leave.days → Count days
```

---

## 3. Calculation Logic

### Formula (MVP Version)

```typescript
// Step 1: Calculate Gross Salary
grossSalary = basicSalary + allowance1 + allowance2

// Step 2: Calculate Deductions
absenceDeduction = (absenceDays × dailyRate) OR (absenceDays × grossSalary × absencePercentage)
lateDeduction = totalLateMinutes × lateDeductionPerMinute
unpaidLeaveDeduction = (unpaidLeaveDays × dailyRate) OR (unpaidLeaveDays × grossSalary × unpaidLeavePercentage)
totalDeductions = absenceDeduction + lateDeduction + unpaidLeaveDeduction + manualAdjustments

// Step 3: Calculate Net Salary
netSalary = grossSalary - totalDeductions
```

### Daily Rate Calculation

```typescript
// For daily-based deductions
const workingDaysInMonth = getWorkingDaysInMonth(periodYear, periodMonth);
const dailyRate = grossSalary / workingDaysInMonth;
```

### Late Minutes Calculation

```typescript
// For each attendance record with status = LATE
const expectedCheckInTime = getExpectedCheckInTime(date); // e.g., 9:00 AM
const actualCheckInTime = attendance.checkInTime;
const lateMinutes = Math.max(0, differenceInMinutes(actualCheckInTime, expectedCheckInTime) - gracePeriodMinutes);
```

### Leave Days Calculation

```typescript
// For each approved leave that overlaps with payroll period
const leaveStart = max(leave.startDate, periodStart);
const leaveEnd = min(leave.endDate, periodEnd);
const leaveDaysInPeriod = countWorkingDays(leaveStart, leaveEnd);

if (leave.type === 'UNPAID') {
  unpaidLeaveDays += leaveDaysInPeriod;
} else {
  paidLeaveDays += leaveDaysInPeriod;
}
```

---

## 4. Implementation Steps

### Step 1: Database Migration

```bash
cd backend
npx prisma migrate dev --name add_payroll_tables
npx prisma generate
```

### Step 2: Create Payroll Settings Service

File: `backend/src/services/payrollSettings.service.ts`

```typescript
import prisma from '../config/database';

export const getPayrollSettings = async () => {
  let settings = await prisma.payrollSettings.findFirst();
  if (!settings) {
    // Create default settings
    settings = await prisma.payrollSettings.create({
      data: {
        gracePeriodMinutes: 15,
        lateDeductionPerMinute: 0.5,
        absenceDeductionType: 'DAILY',
        absenceDeductionValue: 1.0,
        unpaidLeaveDeductionType: 'DAILY',
        unpaidLeaveDeductionValue: 1.0,
      },
    });
  }
  return settings;
};

export const updatePayrollSettings = async (data: any, updatedBy: string) => {
  const existing = await prisma.payrollSettings.findFirst();
  if (existing) {
    return await prisma.payrollSettings.update({
      where: { id: existing.id },
      data: { ...data, updatedBy },
    });
  }
  return await prisma.payrollSettings.create({
    data: { ...data, updatedBy },
  });
};
```

### Step 3: Create Payroll Calculation Service

File: `backend/src/services/payrollCalculation.service.ts`

```typescript
import prisma from '../config/database';
import { getPayrollSettings } from './payrollSettings.service';

interface PayrollPeriod {
  startDate: Date;
  endDate: Date;
  month: number;
  year: number;
}

interface AttendanceSummary {
  totalWorkingDays: number;
  totalAbsentDays: number;
  totalLateInstances: number;
  totalLateMinutes: number;
  totalEarlyLeaveMinutes: number;
}

interface LeaveSummary {
  paidLeaveDays: number;
  unpaidLeaveDays: number;
}

/**
 * Fetch active employees for payroll period
 */
export const getActiveEmployees = async () => {
  return await prisma.user.findMany({
    where: {
      isActive: true,
      status: 'Active', // or whatever your active status is
      role: { in: ['EMPLOYEE', 'MANAGER'] }, // Exclude ADMIN, etc.
    },
    include: {
      labourDetails: true, // Salary information
    },
  });
};

/**
 * Calculate attendance summary for an employee in a period
 */
export const calculateAttendanceSummary = async (
  employeeId: string,
  period: PayrollPeriod
): Promise<AttendanceSummary> => {
  const attendances = await prisma.attendance.findMany({
    where: {
      userId: employeeId,
      date: {
        gte: period.startDate,
        lte: period.endDate,
      },
    },
  });

  const summary: AttendanceSummary = {
    totalWorkingDays: 0,
    totalAbsentDays: 0,
    totalLateInstances: 0,
    totalLateMinutes: 0,
    totalEarlyLeaveMinutes: 0,
  };

  // Group by date
  const attendanceByDate = new Map<string, typeof attendances>();
  attendances.forEach(att => {
    const dateKey = att.date.toISOString().split('T')[0];
    if (!attendanceByDate.has(dateKey)) {
      attendanceByDate.set(dateKey, []);
    }
    attendanceByDate.get(dateKey)!.push(att);
  });

  // Process each day
  attendanceByDate.forEach((dayAttendances, dateKey) => {
    const checkIn = dayAttendances.find(a => a.type === 'CHECK_IN');
    const checkOut = dayAttendances.find(a => a.type === 'CHECK_OUT');
    
    if (checkIn) {
      summary.totalWorkingDays++;
      
      // Check for late
      if (checkIn.status === 'LATE' && checkIn.checkInTime) {
        summary.totalLateInstances++;
        // Calculate late minutes (simplified - you'll need actual expected time)
        const expectedTime = new Date(checkIn.date);
        expectedTime.setHours(9, 0, 0, 0); // 9 AM
        const actualTime = checkIn.checkInTime;
        const lateMinutes = Math.max(0, Math.floor((actualTime.getTime() - expectedTime.getTime()) / 60000));
        summary.totalLateMinutes += lateMinutes;
      }
      
      // Check for early leave
      if (checkOut && checkOut.checkOutTime) {
        const expectedEndTime = new Date(checkOut.date);
        expectedEndTime.setHours(17, 0, 0, 0); // 5 PM
        const actualEndTime = checkOut.checkOutTime;
        if (actualEndTime < expectedEndTime) {
          const earlyMinutes = Math.floor((expectedEndTime.getTime() - actualEndTime.getTime()) / 60000);
          summary.totalEarlyLeaveMinutes += earlyMinutes;
        }
      }
    } else {
      // No check-in = absent (unless on leave)
      summary.totalAbsentDays++;
    }
  });

  return summary;
};

/**
 * Calculate leave summary for an employee in a period
 */
export const calculateLeaveSummary = async (
  employeeId: string,
  period: PayrollPeriod
): Promise<LeaveSummary> => {
  const leaves = await prisma.leave.findMany({
    where: {
      userId: employeeId,
      status: 'APPROVED', // Only approved leaves
      OR: [
        {
          startDate: { lte: period.endDate },
          endDate: { gte: period.startDate },
        },
      ],
    },
  });

  const summary: LeaveSummary = {
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
  };

  leaves.forEach(leave => {
    // Calculate overlap with payroll period
    const leaveStart = leave.startDate > period.startDate ? leave.startDate : period.startDate;
    const leaveEnd = leave.endDate < period.endDate ? leave.endDate : period.endDate;
    
    // Count working days in overlap (simplified - you may need to exclude weekends)
    const daysInPeriod = Math.ceil((leaveEnd.getTime() - leaveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    if (leave.type === 'UNPAID') {
      summary.unpaidLeaveDays += daysInPeriod;
    } else {
      summary.paidLeaveDays += daysInPeriod;
    }
  });

  return summary;
};

/**
 * Calculate deductions based on attendance and leave
 */
export const calculateDeductions = async (
  grossSalary: number,
  attendanceSummary: AttendanceSummary,
  leaveSummary: LeaveSummary,
  settings: any
): Promise<{
  absenceDeduction: number;
  lateDeduction: number;
  unpaidLeaveDeduction: number;
  totalDeductions: number;
}> => {
  const workingDaysInMonth = getWorkingDaysInMonth(attendanceSummary.totalWorkingDays + attendanceSummary.totalAbsentDays + leaveSummary.paidLeaveDays + leaveSummary.unpaidLeaveDays);
  const dailyRate = grossSalary / workingDaysInMonth;

  // Absence deduction
  let absenceDeduction = 0;
  if (settings.absenceDeductionType === 'DAILY') {
    absenceDeduction = attendanceSummary.totalAbsentDays * dailyRate * Number(settings.absenceDeductionValue);
  } else {
    absenceDeduction = grossSalary * (attendanceSummary.totalAbsentDays / workingDaysInMonth) * (Number(settings.absenceDeductionValue) / 100);
  }

  // Late deduction
  const lateMinutesAfterGrace = Math.max(0, attendanceSummary.totalLateMinutes - (settings.gracePeriodMinutes * attendanceSummary.totalLateInstances));
  const lateDeduction = lateMinutesAfterGrace * Number(settings.lateDeductionPerMinute);

  // Unpaid leave deduction
  let unpaidLeaveDeduction = 0;
  if (settings.unpaidLeaveDeductionType === 'DAILY') {
    unpaidLeaveDeduction = leaveSummary.unpaidLeaveDays * dailyRate * Number(settings.unpaidLeaveDeductionValue);
  } else {
    unpaidLeaveDeduction = grossSalary * (leaveSummary.unpaidLeaveDays / workingDaysInMonth) * (Number(settings.unpaidLeaveDeductionValue) / 100);
  }

  return {
    absenceDeduction,
    lateDeduction,
    unpaidLeaveDeduction,
    totalDeductions: absenceDeduction + lateDeduction + unpaidLeaveDeduction,
  };
};

/**
 * Generate payroll run draft
 */
export const generatePayrollDraft = async (
  period: PayrollPeriod,
  createdById: string
) => {
  const settings = await getPayrollSettings();
  
  // Create payroll run
  const payrollRun = await prisma.payrollRun.create({
    data: {
      periodStart: period.startDate,
      periodEnd: period.endDate,
      periodMonth: period.month,
      periodYear: period.year,
      status: 'DRAFT',
      settingsSnapshot: settings as any,
      createdById,
    },
  });

  const employees = await getActiveEmployees();
  const payrollLines = [];

  for (const employee of employees) {
    // Get salary data
    const labourDetails = employee.labourDetails;
    if (!labourDetails) continue; // Skip employees without salary data

    const basicSalary = Number(labourDetails.basicSalary || 0);
    const allowance1 = Number(labourDetails.allowance1 || 0);
    const allowance2 = Number(labourDetails.allowance2 || 0);
    const totalAllowances = allowance1 + allowance2;
    const grossSalary = basicSalary + totalAllowances;

    // Calculate summaries
    const attendanceSummary = await calculateAttendanceSummary(employee.id, period);
    const leaveSummary = await calculateLeaveSummary(employee.id, period);

    // Calculate deductions
    const deductions = await calculateDeductions(
      grossSalary,
      attendanceSummary,
      leaveSummary,
      settings
    );

    const netSalary = grossSalary - deductions.totalDeductions;

    // Create payroll line
    const payrollLine = await prisma.payrollLine.create({
      data: {
        payrollRunId: payrollRun.id,
        employeeId: employee.id,
        snapshotEmployeeId: employee.employeeId || null,
        snapshotBasicSalary: basicSalary,
        snapshotAllowance1: allowance1,
        snapshotAllowance2: allowance2,
        snapshotTotalAllowances: totalAllowances,
        snapshotDepartment: employee.department || null,
        grossSalary,
        totalDeductions: deductions.totalDeductions,
        netSalary,
        totalWorkingDays: attendanceSummary.totalWorkingDays,
        totalAbsentDays: attendanceSummary.totalAbsentDays,
        totalLateInstances: attendanceSummary.totalLateInstances,
        totalLateMinutes: attendanceSummary.totalLateMinutes,
        totalEarlyLeaveMinutes: attendanceSummary.totalEarlyLeaveMinutes,
        paidLeaveDays: leaveSummary.paidLeaveDays,
        unpaidLeaveDays: leaveSummary.unpaidLeaveDays,
        absenceDeduction: deductions.absenceDeduction,
        lateDeduction: deductions.lateDeduction,
        unpaidLeaveDeduction: deductions.unpaidLeaveDeduction,
      },
    });

    payrollLines.push(payrollLine);
  }

  // Update payroll run totals
  const totals = payrollLines.reduce(
    (acc, line) => ({
      totalGross: acc.totalGross + Number(line.grossSalary),
      totalDeductions: acc.totalDeductions + Number(line.totalDeductions),
      totalNet: acc.totalNet + Number(line.netSalary),
    }),
    { totalGross: 0, totalDeductions: 0, totalNet: 0 }
  );

  await prisma.payrollRun.update({
    where: { id: payrollRun.id },
    data: {
      totalEmployees: payrollLines.length,
      totalGross: totals.totalGross,
      totalDeductions: totals.totalDeductions,
      totalNet: totals.totalNet,
    },
  });

  return { payrollRun, payrollLines };
};

// Helper function
function getWorkingDaysInMonth(totalDays: number): number {
  // Simplified - you may need to exclude weekends/holidays
  return totalDays;
}
```

---

## 5. API Endpoints

### Routes File: `backend/src/routes/payroll.routes.ts`

```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import * as payrollController from '../controllers/payroll.controller';

const router = Router();
router.use(authenticate);

// Settings (Admin only)
router.get('/settings', requireRole('ADMIN', 'HR'), payrollController.getSettings);
router.put('/settings', requireRole('ADMIN', 'HR'), payrollController.updateSettings);

// Payroll Runs
router.post('/runs', requireRole('ADMIN', 'HR'), payrollController.createPayrollRun);
router.get('/runs', payrollController.getPayrollRuns);
router.get('/runs/:id', payrollController.getPayrollRunById);
router.get('/runs/:id/lines', payrollController.getPayrollLines);
router.put('/runs/:id/lines/:lineId', requireRole('ADMIN', 'HR'), payrollController.updatePayrollLine);

// Approval Workflow
router.post('/runs/:id/approve/hr', requireRole('HR'), payrollController.approveHR);
router.post('/runs/:id/approve/finance', requireRole('ADMIN', 'FINANCE'), payrollController.approveFinance);
router.post('/runs/:id/approve/final', requireRole('ADMIN'), payrollController.approveFinal);
router.post('/runs/:id/lock', requireRole('ADMIN'), payrollController.lockPayroll);

// Reports
router.get('/runs/:id/payslip/:employeeId', payrollController.generatePayslip);
router.get('/runs/:id/register', payrollController.generateRegister);

export default router;
```

---

## 6. Next Steps

1. **Run Migration**: Create the database tables
2. **Implement Services**: Create calculation and settings services
3. **Create Controllers**: Build API endpoints
4. **Build Frontend**: Create payroll management UI
5. **Add PDF Generation**: Implement payslip and register PDFs
6. **Testing**: Test with real data

---

## Key Principles

1. ✅ **Snapshot Data**: Always store snapshots to prevent future edits from changing past payrolls
2. ✅ **Read-Only After Lock**: Once locked, payroll cannot be edited (only adjustments)
3. ✅ **Configurable Rules**: All deduction rules must be editable via settings
4. ✅ **Audit Trail**: Every action is logged in audit log
5. ✅ **Approval Workflow**: Must pass through HR → Finance → Final approval

---

## Questions?

This plan provides a complete foundation. The developer can follow it step-by-step to build the payroll system without modifying existing HR/Attendance/Leave modules.
