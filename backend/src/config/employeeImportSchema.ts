export type EmployeeImportFieldType = 'text' | 'email' | 'phone' | 'date' | 'select' | 'boolean' | 'number';

export type EmployeeImportField = {
  /** Field key must match the backend create/update payload key (employee.controller.ts expects these). */
  key: string;
  label: string;
  required?: boolean;
  type: EmployeeImportFieldType;
  options?: string[];
  sample?: string;
  note?: string;
};

/**
 * Single Source of Truth for Employee Excel:
 * Mirrors the Create Employee form in `ERP-FRONTEND/src/modules/Employees.js` (EmployeeForm).
 *
 * Used for:
 * - Excel Template generation (columns + order + required marking + dropdowns)
 * - Import validation + mapping
 * - Export format
 */
export const EMPLOYEE_IMPORT_SCHEMA: EmployeeImportField[] = [
  // Step 0 — Personal Info
  { key: 'employeeType', label: 'Employee Type', required: true, type: 'text', sample: 'Full-time' },
  { key: 'firstName', label: 'First Name', required: true, type: 'text', sample: 'Mohammed' },
  { key: 'lastName', label: 'Last Name', required: true, type: 'text', sample: 'Ali' },
  { key: 'employeeId', label: 'Employee ID', required: true, type: 'text', sample: 'O-26-001' },
  { key: 'status', label: 'Status', required: true, type: 'select', options: ['Active', 'Inactive'], sample: 'Active' },
  { key: 'role', label: 'Role / Access Level', required: true, type: 'select', options: ['EMPLOYEE', 'PROJECT_MANAGER', 'TENDER_ENGINEER', 'HR', 'ADMIN'], sample: 'EMPLOYEE' },

  // Step 1 — Personal Details
  { key: 'gender', label: 'Gender', required: true, type: 'select', options: ['Male', 'Female', 'Other'], sample: 'Male' },
  { key: 'maritalStatus', label: 'Marital Status', required: true, type: 'select', options: ['Single', 'Married', 'Divorced', 'Widowed'], sample: 'Single' },
  { key: 'nationality', label: 'Nationality', required: true, type: 'text', sample: 'Emirati' },
  { key: 'currentAddress', label: 'Current Address', required: true, type: 'text', sample: 'Dubai, UAE' },
  { key: 'childrenCount', label: 'Children Count', required: false, type: 'number', sample: '0', note: 'Required when marital status is not Single.' },
  { key: 'birthday', label: 'Date of Birth', required: false, type: 'date', sample: '1990-01-15', note: 'Use YYYY-MM-DD. Must be >= 18 years old.' },

  // Step 2 — Contact Info
  { key: 'phone', label: 'Primary Phone', required: true, type: 'phone', sample: '+971501234567', note: 'International format.' },
  { key: 'phoneNumbers', label: 'Additional Phones (comma-separated)', required: false, type: 'text', sample: '+971501234567,+971551234567', note: 'Optional. Stored as phoneNumbers JSON.' },
  { key: 'workEmail', label: 'Primary Email', required: true, type: 'email', sample: 'employee@onixgroup.ae' },
  { key: 'emailAddresses', label: 'Additional Emails (comma-separated)', required: false, type: 'text', sample: 'alt1@onixgroup.ae,alt2@onixgroup.ae' },

  // Step 3 — Company Info
  { key: 'company', label: 'Company', required: true, type: 'text', sample: 'ONIX Engineering Consultancy' },
  { key: 'department', label: 'Department', required: true, type: 'text', sample: 'IT' },
  { key: 'position', label: 'Position', required: false, type: 'text', sample: 'IT Support' },
  { key: 'jobTitle', label: 'Job Title / Designation', required: true, type: 'text', sample: 'IT Support Engineer' },
  { key: 'attendanceProgram', label: 'Attendance Program', required: true, type: 'text', sample: 'Default' },
  { key: 'joiningDate', label: 'Joining Date', required: true, type: 'date', sample: '2026-01-01', note: 'YYYY-MM-DD' },
  { key: 'exitDate', label: 'Exit Date', required: false, type: 'date', sample: '', note: 'YYYY-MM-DD' },
  { key: 'companyLocation', label: 'Company Location', required: true, type: 'text', sample: 'Dubai HQ' },
  { key: 'managerId', label: 'Manager ID', required: false, type: 'text', sample: '' },
  { key: 'isLineManager', label: 'Is Line Manager', required: false, type: 'boolean', sample: 'false', note: 'true/false' },

  // Step 4 — Legal Info (Passport required)
  { key: 'passportNumber', label: 'Passport Number', required: true, type: 'text', sample: 'N1234567' },
  { key: 'passportIssueDate', label: 'Passport Issue Date', required: true, type: 'date', sample: '2022-01-01' },
  { key: 'passportExpiryDate', label: 'Passport Expiry Date', required: true, type: 'date', sample: '2030-01-01', note: 'Must be >= 6 months from today.' },
  { key: 'visaNumber', label: 'Visa Number', required: false, type: 'text', sample: '' },
  { key: 'nationalIdNumber', label: 'National ID Number', required: false, type: 'text', sample: '' },
  { key: 'nationalIdExpiryDate', label: 'National ID Expiry Date', required: false, type: 'date', sample: '' },
  { key: 'residencyNumber', label: 'Residency Number', required: false, type: 'text', sample: '' },
  { key: 'residencyExpiryDate', label: 'Residency Expiry Date', required: false, type: 'date', sample: '' },
  { key: 'insuranceNumber', label: 'Insurance Number', required: false, type: 'text', sample: '' },
  { key: 'insuranceExpiryDate', label: 'Insurance Expiry Date', required: false, type: 'date', sample: '' },
  { key: 'drivingLicenseNumber', label: 'Driving License Number', required: false, type: 'text', sample: '' },
  { key: 'drivingLicenseExpiryDate', label: 'Driving License Expiry Date', required: false, type: 'date', sample: '' },
  { key: 'labourIdNumber', label: 'Labour ID Number', required: false, type: 'text', sample: '' },
  { key: 'labourIdExpiryDate', label: 'Labour ID Expiry Date', required: false, type: 'date', sample: '' },
  { key: 'remarks', label: 'Remarks', required: false, type: 'text', sample: '' },

  // ERP Access toggle (optional)
  { key: 'userAccount', label: 'Enable ERP Access', required: false, type: 'boolean', sample: 'false' },
  { key: 'password', label: 'ERP Password (optional)', required: false, type: 'text', sample: '', note: 'If empty and ERP access enabled, system generates a temporary password.' },
];

