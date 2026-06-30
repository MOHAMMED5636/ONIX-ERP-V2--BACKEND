"use strict";
/**
 * Labels and formatting for employee directory audit (HR/Admin updates).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMPLOYEE_CHANGE_FIELD_LABELS = void 0;
exports.formatEmployeeFieldForLog = formatEmployeeFieldForLog;
exports.valuesEqualForLog = valuesEqualForLog;
exports.buildEmployeeUpdateChangeRows = buildEmployeeUpdateChangeRows;
const SKIP_CHANGE_LOG_KEYS = new Set(['forcePasswordChange', 'updatedAt']);
exports.EMPLOYEE_CHANGE_FIELD_LABELS = {
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
    secondLineManagerId: 'Second line manager',
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
    educationalQualification: 'Educational qualification',
    curriculumVitaeAttachment: 'Curriculum vitae',
    remarks: 'Remarks',
    password: 'Password',
    projectAssignments: 'Project assignments',
};
function isDateLike(v) {
    return v instanceof Date && !Number.isNaN(v.getTime());
}
/** Stable string for comparing / displaying stored values. */
function formatEmployeeFieldForLog(fieldKey, value) {
    if (value === null || value === undefined)
        return '';
    if (fieldKey === 'password')
        return '(hidden)';
    if (isDateLike(value))
        return value.toISOString().slice(0, 10);
    if (typeof value === 'boolean')
        return value ? 'Yes' : 'No';
    if (typeof value === 'number')
        return String(value);
    if (typeof value === 'string')
        return value;
    return JSON.stringify(value);
}
function valuesEqualForLog(fieldKey, a, b) {
    return formatEmployeeFieldForLog(fieldKey, a) === formatEmployeeFieldForLog(fieldKey, b);
}
function buildEmployeeUpdateChangeRows(params) {
    const { before, updateData, employeeId, changedById, changedByRole, reason } = params;
    const rows = [];
    for (const key of Object.keys(updateData)) {
        if (SKIP_CHANGE_LOG_KEYS.has(key))
            continue;
        const oldRaw = before[key];
        const newRaw = updateData[key];
        if (key === 'password') {
            rows.push({
                employeeId,
                changedById,
                changedByRole,
                fieldKey: 'password',
                fieldLabel: exports.EMPLOYEE_CHANGE_FIELD_LABELS.password,
                oldValue: '(not shown)',
                newValue: '(updated)',
                reason,
            });
            continue;
        }
        if (valuesEqualForLog(key, oldRaw, newRaw))
            continue;
        const fieldLabel = exports.EMPLOYEE_CHANGE_FIELD_LABELS[key] || key;
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
//# sourceMappingURL=employee-change-log.js.map