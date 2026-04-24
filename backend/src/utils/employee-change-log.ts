/**
 * Labels and formatting for employee directory audit (HR/Admin updates).
 */

const SKIP_CHANGE_LOG_KEYS = new Set(['forcePasswordChange', 'updatedAt']);

export const EMPLOYEE_CHANGE_FIELD_LABELS: Record<string, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Work email',
  role: 'System role',
  phone: 'Phone',
  department: 'Department',
  position: 'Position',
  jobTitle: 'Job title',
  photo: 'Profile photo',
  employeeId: 'Employee ID',
  isActive: 'Account active',
  employeeType: 'Employee type',
  status: 'Employment status',
  userAccount: 'ERP access enabled',
  gender: 'Gender',
  maritalStatus: 'Marital status',
  nationality: 'Nationality',
  birthday: 'Date of birth',
  childrenCount: 'Children count',
  currentAddress: 'Current address',
  phoneNumbers: 'Phone numbers (directory)',
  emailAddresses: 'Email addresses (directory)',
  company: 'Company',
  companyLocation: 'Company location',
  managerId: 'Line manager',
  attendanceProgram: 'Attendance program',
  joiningDate: 'Joining date',
  exitDate: 'Exit date',
  isLineManager: 'Is line manager',
  passportNumber: 'Passport number',
  passportIssueDate: 'Passport issue date',
  passportExpiryDate: 'Passport expiry',
  passportAttachment: 'Passport document',
  nationalIdNumber: 'National ID number',
  nationalIdExpiryDate: 'National ID expiry',
  nationalIdAttachment: 'National ID document',
  residencyNumber: 'Residency number',
  residencyExpiryDate: 'Residency expiry',
  residencyAttachment: 'Residency document',
  visaNumber: 'Visa number',
  insuranceNumber: 'Insurance number',
  insuranceExpiryDate: 'Insurance expiry',
  insuranceAttachment: 'Insurance document',
  drivingLicenseNumber: 'Driving licence number',
  drivingLicenseExpiryDate: 'Driving licence expiry',
  drivingLicenseAttachment: 'Driving licence document',
  labourIdNumber: 'Labour ID number',
  labourIdExpiryDate: 'Labour ID expiry',
  labourIdAttachment: 'Labour ID document',
  remarks: 'Remarks',
  password: 'Password',
  projectAssignments: 'Project assignments',
};

function isDateLike(v: unknown): v is Date {
  return v instanceof Date && !Number.isNaN(v.getTime());
}

/** Stable string for comparing / displaying stored values. */
export function formatEmployeeFieldForLog(fieldKey: string, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (fieldKey === 'password') return '(hidden)';
  if (isDateLike(value)) return value.toISOString().slice(0, 10);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function valuesEqualForLog(fieldKey: string, a: unknown, b: unknown): boolean {
  return formatEmployeeFieldForLog(fieldKey, a) === formatEmployeeFieldForLog(fieldKey, b);
}

export type EmployeeChangeRowInput = {
  employeeId: string;
  changedById: string | null;
  changedByRole: string;
  fieldKey: string;
  fieldLabel: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string;
};

export function buildEmployeeUpdateChangeRows(params: {
  before: Record<string, unknown>;
  updateData: Record<string, unknown>;
  employeeId: string;
  changedById: string | null;
  changedByRole: string;
  reason: string;
}): EmployeeChangeRowInput[] {
  const { before, updateData, employeeId, changedById, changedByRole, reason } = params;
  const rows: EmployeeChangeRowInput[] = [];

  for (const key of Object.keys(updateData)) {
    if (SKIP_CHANGE_LOG_KEYS.has(key)) continue;
    const oldRaw = before[key];
    const newRaw = updateData[key];

    if (key === 'password') {
      rows.push({
        employeeId,
        changedById,
        changedByRole,
        fieldKey: 'password',
        fieldLabel: EMPLOYEE_CHANGE_FIELD_LABELS.password,
        oldValue: '(not shown)',
        newValue: '(updated)',
        reason,
      });
      continue;
    }

    if (valuesEqualForLog(key, oldRaw, newRaw)) continue;

    const fieldLabel = EMPLOYEE_CHANGE_FIELD_LABELS[key] || key;
    rows.push({
      employeeId,
      changedById,
      changedByRole,
      fieldKey: key,
      fieldLabel,
      oldValue: formatEmployeeFieldForLog(key, oldRaw) || null,
      newValue: formatEmployeeFieldForLog(key, newRaw) || null,
      reason,
    });
  }

  return rows;
}
