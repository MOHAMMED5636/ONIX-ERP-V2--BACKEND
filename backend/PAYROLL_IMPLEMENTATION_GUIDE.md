# Payroll Implementation Guide - Step by Step

## ✅ YES, This is 100% Possible!

Your existing system has all the required data:
- ✅ Employees with salary data (`User` + `LabourDetails`)
- ✅ Attendance records (`Attendance` model)
- ✅ Leave records (`Leave` model)
- ✅ All linked by `userId` and `date`

---

## 🎯 Quick Answer: How to Do This

### 1. **Add Database Tables** (Day 1-2)
   - Copy models from `schema_payroll_addition.prisma` into your `schema.prisma`
   - Run migration: `npx prisma migrate dev --name add_payroll_tables`
   - Generate Prisma client: `npx prisma generate`

### 2. **Create Settings Service** (Day 2)
   - File: `backend/src/services/payrollSettings.service.ts`
   - Functions: `getPayrollSettings()`, `updatePayrollSettings()`
   - Allows admin to configure deduction rules

### 3. **Create Calculation Service** (Day 3-4)
   - File: `backend/src/services/payrollCalculation.service.ts`
   - Functions:
     - `getActiveEmployees()` - Reads from `User` + `LabourDetails`
     - `calculateAttendanceSummary()` - Reads from `Attendance` table
     - `calculateLeaveSummary()` - Reads from `Leave` table
     - `calculateDeductions()` - Applies rules from settings
     - `generatePayrollDraft()` - Creates payroll run with all lines

### 4. **Create Controller** (Day 4-5)
   - File: `backend/src/controllers/payroll.controller.ts`
   - Endpoints:
     - `GET /api/payroll/settings` - Get settings
     - `PUT /api/payroll/settings` - Update settings
     - `POST /api/payroll/runs` - Create payroll run
     - `GET /api/payroll/runs` - List payroll runs
     - `GET /api/payroll/runs/:id` - Get payroll run details
     - `GET /api/payroll/runs/:id/lines` - Get payroll lines
     - `PUT /api/payroll/runs/:id/lines/:lineId` - Manual adjustments
     - `POST /api/payroll/runs/:id/approve/hr` - HR approval
     - `POST /api/payroll/runs/:id/approve/finance` - Finance approval
     - `POST /api/payroll/runs/:id/approve/final` - Final approval
     - `POST /api/payroll/runs/:id/lock` - Lock payroll
     - `GET /api/payroll/runs/:id/payslip/:employeeId` - Generate payslip PDF
     - `GET /api/payroll/runs/:id/register` - Generate register report

### 5. **Add Routes** (Day 5)
   - File: `backend/src/routes/payroll.routes.ts`
   - Register in `app.ts`: `app.use('/api/payroll', payrollRoutes)`

### 6. **Build Frontend** (Day 6-9)
   - Settings page (admin only)
   - Payroll run creation page
   - Payroll review/approval page
   - Payslip viewer/download

### 7. **PDF Generation** (Day 9-10)
   - Use library like `pdfkit` or `puppeteer`
   - Generate payslip PDF per employee
   - Generate payroll register report

---

## 📊 Data Flow Diagram

```
┌─────────────────┐
│   User Table    │ ← employeeId, joiningDate, status, department
│ LabourDetails   │ ← basicSalary, allowance1, allowance2
└────────┬────────┘
         │
         │ Read at payroll generation time
         │
         ▼
┌─────────────────────────────────────┐
│   Payroll Calculation Engine        │
│  ┌───────────────────────────────┐  │
│  │ 1. Get active employees       │  │
│  │ 2. Read salary from           │  │
│  │    LabourDetails              │  │
│  │ 3. Read attendance records    │  │
│  │    from Attendance table      │  │
│  │ 4. Read leave records         │  │
│  │    from Leave table           │  │
│  │ 5. Calculate summaries        │  │
│  │ 6. Apply deduction rules      │  │
│  │ 7. Calculate net salary       │  │
│  └───────────────────────────────┘  │
└──────────────┬──────────────────────┘
               │
               │ Store snapshots
               │
               ▼
┌─────────────────────────────────────┐
│      PayrollRun + PayrollLines       │
│  (Snapshots prevent future changes) │
└──────────────┬───────────────────────┘
               │
               │ Approval workflow
               │
               ▼
┌─────────────────────────────────────┐
│  Draft → HR → Finance → Final → Lock │
└──────────────┬───────────────────────┘
               │
               │ Generate outputs
               │
               ▼
┌─────────────────────────────────────┐
│   Payslips + Payroll Register PDF    │
└──────────────────────────────────────┘
```

---

## 🔗 How Data Links Together

### Employee → Salary
```typescript
User.id → LabourDetails.userId
User.employeeId → Display ID (e.g., "EMP001")
LabourDetails.basicSalary → Used in calculation
LabourDetails.allowance1 + allowance2 → Added to gross
```

### Employee → Attendance
```typescript
User.id → Attendance.userId
Attendance.date → Filter by payroll period
Attendance.status → Count ABSENT, LATE
Attendance.checkInTime → Calculate late minutes
```

### Employee → Leaves
```typescript
User.id → Leave.userId
Leave.startDate, endDate → Overlap with payroll period
Leave.type → UNPAID = deduction, others = paid
Leave.status → Only APPROVED counts
```

---

## 💡 Key Implementation Points

### 1. **Snapshot Principle** (Critical!)
When generating payroll, store ALL data as snapshots:
- Salary values at that moment
- Attendance summary for that period
- Leave summary for that period
- Settings used for calculations

**Why?** If someone changes salary later, past payrolls won't change.

### 2. **Period-Based Queries**
```typescript
// Get attendance for period
const attendances = await prisma.attendance.findMany({
  where: {
    userId: employeeId,
    date: {
      gte: periodStart, // Start of payroll month
      lte: periodEnd,   // End of payroll month
    },
  },
});

// Get leaves overlapping with period
const leaves = await prisma.leave.findMany({
  where: {
    userId: employeeId,
    status: 'APPROVED',
    OR: [
      {
        startDate: { lte: periodEnd },
        endDate: { gte: periodStart },
      },
    ],
  },
});
```

### 3. **Calculation Formula**
```typescript
// Gross = Basic + Allowances
const gross = basicSalary + allowance1 + allowance2;

// Deductions = Absence + Late + Unpaid Leave + Manual
const dailyRate = gross / workingDaysInMonth;
const absenceDeduction = absentDays * dailyRate;
const lateDeduction = lateMinutes * lateDeductionPerMinute;
const unpaidLeaveDeduction = unpaidLeaveDays * dailyRate;
const totalDeductions = absenceDeduction + lateDeduction + unpaidLeaveDeduction + manualAdjustments;

// Net = Gross - Deductions
const net = gross - totalDeductions;
```

### 4. **Approval Workflow**
```typescript
// Status transitions:
DRAFT → HR_PENDING (when submitted)
HR_PENDING → HR_APPROVED (when HR approves)
HR_APPROVED → FINANCE_PENDING (auto)
FINANCE_PENDING → FINANCE_APPROVED (when Finance approves)
FINANCE_APPROVED → FINAL_APPROVED (when Admin approves)
FINAL_APPROVED → LOCKED (when locked)

// After LOCKED, no edits allowed (only adjustments)
```

---

## 🚀 Quick Start Code

### Example: Generate Payroll Draft

```typescript
// In payrollCalculation.service.ts
export const generatePayrollDraft = async (period: PayrollPeriod, createdById: string) => {
  // 1. Get settings
  const settings = await getPayrollSettings();
  
  // 2. Get active employees
  const employees = await prisma.user.findMany({
    where: {
      isActive: true,
      status: 'Active',
    },
    include: { labourDetails: true },
  });
  
  // 3. Create payroll run
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
  
  // 4. Process each employee
  for (const employee of employees) {
    const labourDetails = employee.labourDetails;
    if (!labourDetails) continue;
    
    // Read salary
    const basic = Number(labourDetails.basicSalary || 0);
    const allowances = Number(labourDetails.allowance1 || 0) + Number(labourDetails.allowance2 || 0);
    const gross = basic + allowances;
    
    // Read attendance
    const attendances = await prisma.attendance.findMany({
      where: {
        userId: employee.id,
        date: { gte: period.startDate, lte: period.endDate },
      },
    });
    // Calculate attendance summary...
    
    // Read leaves
    const leaves = await prisma.leave.findMany({
      where: {
        userId: employee.id,
        status: 'APPROVED',
        OR: [{ startDate: { lte: period.endDate }, endDate: { gte: period.startDate } }],
      },
    });
    // Calculate leave summary...
    
    // Calculate deductions
    const deductions = calculateDeductions(gross, attendanceSummary, leaveSummary, settings);
    
    // Create payroll line
    await prisma.payrollLine.create({
      data: {
        payrollRunId: payrollRun.id,
        employeeId: employee.id,
        snapshotEmployeeId: employee.employeeId,
        snapshotBasicSalary: basic,
        snapshotTotalAllowances: allowances,
        grossSalary: gross,
        totalDeductions: deductions.totalDeductions,
        netSalary: gross - deductions.totalDeductions,
        // ... attendance and leave summaries
      },
    });
  }
  
  return payrollRun;
};
```

---

## ✅ Checklist for Developer

- [ ] Add Prisma models to schema.prisma
- [ ] Run migration
- [ ] Create payrollSettings.service.ts
- [ ] Create payrollCalculation.service.ts
- [ ] Create payroll.controller.ts
- [ ] Create payroll.routes.ts
- [ ] Register routes in app.ts
- [ ] Test payroll generation
- [ ] Implement approval workflow
- [ ] Add PDF generation
- [ ] Build frontend UI
- [ ] Test end-to-end

---

## 📝 Notes

1. **Don't modify existing modules** - Only read from them
2. **Always snapshot data** - Store values at generation time
3. **Lock after final approval** - Prevent changes to historical payrolls
4. **Use settings for rules** - Make everything configurable
5. **Log everything** - Use audit log for all actions

---

This plan is complete and ready to implement! 🎉
