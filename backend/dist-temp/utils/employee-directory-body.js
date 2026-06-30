"use strict";
/**
 * Normalize employee create/update payloads from multipart or JSON clients
 * that use alternate field names (snake_case, labour card synonyms, etc.).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLabourIdNumberForDb = resolveLabourIdNumberForDb;
exports.resolveDrivingLicenseNumberForDb = resolveDrivingLicenseNumberForDb;
exports.parseFormDataArray = parseFormDataArray;
exports.parseEmployeeDate = parseEmployeeDate;
exports.resolvePhoneNumbersJson = resolvePhoneNumbersJson;
exports.resolveEmailAddressesJson = resolveEmailAddressesJson;
exports.normalizeEmployeeDirectoryBody = normalizeEmployeeDirectoryBody;
exports.liftNestedFormSectionsOntoRoot = liftNestedFormSectionsOntoRoot;
exports.shouldPatchPhoneNumbers = shouldPatchPhoneNumbers;
exports.shouldPatchEmailAddresses = shouldPatchEmailAddresses;
exports.resolveManagerIdInput = resolveManagerIdInput;
/** Many frontends send legal fields inside `documents`, `legal`, or `employee` instead of top-level. */
const PAYLOAD_NEST_KEYS = [
    'documents',
    'legalDocuments',
    'legal_documents',
    'legalInfo',
    'legal_info',
    'legal',
    'employee',
    'employeeData',
    'data',
    'payload',
    'formValues',
    'values',
    'personal',
    'personalInfo',
    'personal_info',
    'personalDetails',
    'directory',
    'profile',
];
function mergeWrappedPayload(raw) {
    const fromNested = {};
    for (const k of PAYLOAD_NEST_KEYS) {
        const v = raw[k];
        if (v != null && typeof v === 'object' && !Array.isArray(v)) {
            Object.assign(fromNested, v);
        }
    }
    // Start from raw multipart fields, then fill from nested (legal/personal/employee) when top-level is empty.
    // Otherwise `drivingLicenseNumber: ""` from the form wipes a value only sent under `legal`.
    const out = { ...raw };
    for (const [k, v] of Object.entries(fromNested)) {
        if (isEmpty(v))
            continue;
        if (isEmpty(out[k])) {
            out[k] = v;
        }
    }
    return out;
}
/** Some clients send `employee: '{"drivingLicenseNumber":"..."}'` as a string — flatten into the root. */
function expandJsonStringFields(raw) {
    const out = { ...raw };
    for (const [k, v] of Object.entries(raw)) {
        if (typeof v !== 'string')
            continue;
        const s = v.trim();
        if (!s.startsWith('{'))
            continue;
        try {
            const parsed = JSON.parse(s);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                Object.assign(out, parsed);
            }
        }
        catch {
            /* ignore */
        }
    }
    return out;
}
function normFieldKey(k) {
    return k.replace(/[_\s-]/g, '').toLowerCase();
}
const NORM_TO_CANONICAL = {
    passportnumber: 'passportNumber',
    passportissuedate: 'passportIssueDate',
    passportexpirydate: 'passportExpiryDate',
    passportexpiry: 'passportExpiryDate',
    nationalidnumber: 'nationalIdNumber',
    nationalidexpirydate: 'nationalIdExpiryDate',
    nationalidexpiry: 'nationalIdExpiryDate',
    emiratesid: 'nationalIdNumber',
    eidnumber: 'nationalIdNumber',
    residencynumber: 'residencyNumber',
    residencyexpirydate: 'residencyExpiryDate',
    residencyexpiry: 'residencyExpiryDate',
    visanumber: 'visaNumber',
    uidnumber: 'visaNumber',
    emiratesuid: 'visaNumber',
    insurancenumber: 'insuranceNumber',
    insuranceexpirydate: 'insuranceExpiryDate',
    insuranceexpiry: 'insuranceExpiryDate',
    drivinglicensenumber: 'drivingLicenseNumber',
    drivinglicencenumber: 'drivingLicenseNumber',
    dlnumber: 'drivingLicenseNumber',
    drivinglicenseexpirydate: 'drivingLicenseExpiryDate',
    drivinglicenceexpirydate: 'drivingLicenseExpiryDate',
    labourcardnumber: 'labourIdNumber',
    laborcardnumber: 'labourIdNumber',
    labouridnumber: 'labourIdNumber',
    labourcardexpirydate: 'labourIdExpiryDate',
    labourcardexpiry: 'labourIdExpiryDate',
    labouridexpirydate: 'labourIdExpiryDate',
    workpermitnumber: 'labourIdNumber',
    labournumber: 'labourIdNumber',
    labourno: 'labourIdNumber',
    birthday: 'birthday',
    birthdate: 'birthday',
    dateofbirth: 'birthday',
    dob: 'birthday',
    gender: 'gender',
    sex: 'gender',
    maritalstatus: 'maritalStatus',
    joiningdate: 'joiningDate',
    dateofjoining: 'joiningDate',
    joindate: 'joiningDate',
    startdate: 'joiningDate',
    exitdate: 'exitDate',
    departmentname: 'department',
    deptname: 'department',
};
function deepCollectScalars(input, out, depth) {
    if (depth > 14 || input == null)
        return;
    if (typeof input !== 'object')
        return;
    if (Array.isArray(input)) {
        for (const el of input)
            deepCollectScalars(el, out, depth + 1);
        return;
    }
    const o = input;
    for (const [k, v] of Object.entries(o)) {
        if (v != null && typeof v === 'object' && !Array.isArray(v)) {
            deepCollectScalars(v, out, depth + 1);
        }
        if (typeof v !== 'string' && typeof v !== 'number')
            continue;
        if (typeof v === 'string' && v.trim() === '')
            continue;
        const canon = NORM_TO_CANONICAL[normFieldKey(k)];
        if (!canon)
            continue;
        if (out[canon] !== undefined)
            continue;
        out[canon] = typeof v === 'string' ? v.trim() : v;
    }
}
const DRIVING_KEY_NORMS = new Set([
    'drivinglicensenumber',
    'drivinglicencenumber',
    'drivinglicense',
    'drivinglicence',
    'dlnumber',
    'driverslicense',
    'driverslicensenumber',
]);
const LABOUR_KEY_NORMS = new Set([
    'labouridnumber',
    'labourcardnumber',
    'laborcardnumber',
    'labourcardno',
    'labourcard',
    'labourid',
    'laborid',
    'labournumber',
    'labourno',
    'workpermitnumber',
    'workpermitno',
]);
/**
 * Match any request key whose normalized form equals a known alias (handles PascalCase, kebab-case).
 */
function pickScalarByNormalizedKeySet(flat, normalizedKeySet) {
    for (const [k, v] of Object.entries(flat)) {
        if (v === undefined || v === null)
            continue;
        if (typeof v !== 'string' && typeof v !== 'number')
            continue;
        const s = String(v).trim();
        if (!s)
            continue;
        if (normalizedKeySet.has(normFieldKey(k)))
            return s;
    }
    return undefined;
}
/** First non-empty string among known keys (after normalize). */
function resolveLabourIdNumberForDb(b) {
    const keys = [
        'labourIdNumber',
        'labourCardNumber',
        'laborCardNumber',
        'labourNumber',
        'labour_no',
        'labour_card_number',
        'labourCardNo',
        'labour_card_no',
        'workPermitNumber',
        'work_permit_number',
        'labourId',
        'laborId',
    ];
    for (const k of keys) {
        const v = b[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
            return String(v).trim();
        }
    }
    return pickScalarByNormalizedKeySet(b, LABOUR_KEY_NORMS);
}
function resolveDrivingLicenseNumberForDb(b) {
    const keys = [
        'drivingLicenseNumber',
        'drivingLicenceNumber',
        'driving_license_number',
        'driving_licence_number',
        'licenseNumber',
        'licenceNumber',
        'dlNumber',
        'dl_number',
    ];
    for (const k of keys) {
        const v = b[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
            return String(v).trim();
        }
    }
    return pickScalarByNormalizedKeySet(b, DRIVING_KEY_NORMS);
}
function parseFormDataArray(value) {
    if (value == null || value === '')
        return null;
    if (Array.isArray(value))
        return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : null;
        }
        catch {
            return null;
        }
    }
    if (typeof value === 'object') {
        const obj = value;
        const keys = Object.keys(obj).sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
            const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
            return numA - numB;
        });
        if (keys.length > 0) {
            return keys.map((key) => obj[key]).filter((v) => v != null);
        }
    }
    return null;
}
/** Parse dates from ISO strings and common DD/MM/YYYY (UAE) style sent via FormData. */
function parseEmployeeDate(input) {
    if (input == null)
        return null;
    if (input instanceof Date && !Number.isNaN(input.getTime()))
        return input;
    if (typeof input === 'number' && Number.isFinite(input)) {
        const d = new Date(input);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const s = String(input).trim();
    if (!s)
        return null;
    const direct = new Date(s);
    if (!Number.isNaN(direct.getTime()))
        return direct;
    const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    if (m) {
        const day = parseInt(m[1], 10);
        const month = parseInt(m[2], 10) - 1;
        const year = parseInt(m[3], 10);
        const dt = new Date(year, month, day);
        if (!Number.isNaN(dt.getTime()))
            return dt;
    }
    return null;
}
function isEmpty(v) {
    return v == null || v === '';
}
/** Copy first non-empty source[key] into target[destKey] if target[destKey] is empty. */
function copyField(target, source, destKey, sourceKeys) {
    if (!isEmpty(target[destKey]))
        return;
    for (const sk of sourceKeys) {
        const v = source[sk];
        if (!isEmpty(v)) {
            target[destKey] = v;
            return;
        }
    }
}
const NESTED_LEGAL_ROOTS = [
    'legal',
    'legalInfo',
    'legal_information',
    'legalDocuments',
    'documents',
    'documentsInfo',
    'documentInfo',
    'employeeDocuments',
    'step5',
    'documentsAndInfo',
];
/**
 * Wizards often POST grouped fields as legal[residencyExpiryDate] or legal.residency.expiryDate.
 * Hoist into flat keys the employee controller expects.
 */
function hoistLegalNestedFields(body, b) {
    const extractSubGroups = (block) => {
        const subResidency = ['residency', 'residencyInfo', 'residency_info', 'residencyDetails'].map((x) => block[x]);
        for (const sub of subResidency) {
            if (!sub || typeof sub !== 'object' || Array.isArray(sub))
                continue;
            const io = sub;
            copyField(b, io, 'residencyNumber', ['residencyNumber', 'number', 'id']);
            copyField(b, io, 'residencyExpiryDate', [
                'residencyExpiryDate',
                'expiryDate',
                'expiry',
                'residency_expiry_date',
                'residencyExpiry',
            ]);
            copyField(b, io, 'visaNumber', ['visaNumber', 'visa_number', 'uidNumber', 'uid_number', 'uid', 'emiratesUid']);
        }
        const subLabour = ['labour', 'labourInfo', 'labour_id', 'labourId', 'labourID', 'labourCard'].map((x) => block[x]);
        for (const sub of subLabour) {
            if (!sub || typeof sub !== 'object' || Array.isArray(sub))
                continue;
            const io = sub;
            copyField(b, io, 'labourIdNumber', [
                'labourIdNumber',
                'labourCardNumber',
                'laborCardNumber',
                'labourNumber',
                'number',
                'id',
                'labour_card_number',
            ]);
            copyField(b, io, 'labourIdExpiryDate', [
                'labourIdExpiryDate',
                'labourCardExpiryDate',
                'expiryDate',
                'expiry',
                'labour_card_expiry_date',
            ]);
        }
        const subPassport = block.passport ?? block.passportInfo;
        if (subPassport && typeof subPassport === 'object' && !Array.isArray(subPassport)) {
            const io = subPassport;
            copyField(b, io, 'passportNumber', ['passportNumber', 'number']);
            copyField(b, io, 'passportIssueDate', ['passportIssueDate', 'issueDate']);
            copyField(b, io, 'passportExpiryDate', ['passportExpiryDate', 'expiryDate', 'expiry']);
        }
        const subNational = block.nationalId ?? block.nationalID ?? block.national_id;
        if (subNational && typeof subNational === 'object' && !Array.isArray(subNational)) {
            const io = subNational;
            copyField(b, io, 'nationalIdNumber', ['nationalIdNumber', 'number', 'eid']);
            copyField(b, io, 'nationalIdExpiryDate', ['nationalIdExpiryDate', 'expiryDate', 'expiry']);
        }
        const subInsurance = block.insurance;
        if (subInsurance && typeof subInsurance === 'object' && !Array.isArray(subInsurance)) {
            const io = subInsurance;
            copyField(b, io, 'insuranceNumber', ['insuranceNumber', 'number']);
            copyField(b, io, 'insuranceExpiryDate', ['insuranceExpiryDate', 'expiryDate', 'expiry']);
        }
        const subDriving = block.drivingLicense ??
            block.drivingLicence ??
            block.driving_license ??
            block.driving ??
            block.dl;
        if (subDriving && typeof subDriving === 'object' && !Array.isArray(subDriving)) {
            const io = subDriving;
            copyField(b, io, 'drivingLicenseNumber', [
                'drivingLicenseNumber',
                'drivingLicenceNumber',
                'driving_license_number',
                'driving_licence_number',
                'licenseNumber',
                'licenceNumber',
                'number',
                'dlNumber',
            ]);
            copyField(b, io, 'drivingLicenseExpiryDate', [
                'drivingLicenseExpiryDate',
                'drivingLicenceExpiryDate',
                'expiryDate',
                'expiry',
                'driving_license_expiry_date',
            ]);
        }
    };
    const mergeFlatFromBlock = (block) => {
        for (const [k, v] of Object.entries(block)) {
            if (isEmpty(v))
                continue;
            if (typeof v === 'object' && !Array.isArray(v) && v !== null)
                continue;
            if (isEmpty(b[k])) {
                b[k] = v;
            }
        }
        extractSubGroups(block);
    };
    for (const root of NESTED_LEGAL_ROOTS) {
        const block = body[root];
        if (block && typeof block === 'object' && !Array.isArray(block)) {
            mergeFlatFromBlock(block);
        }
    }
    // Top-level residency: { ... } / labour: { ... } without a legal wrapper
    extractSubGroups(body);
}
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Multer/multipart often yields `contacts[0]`, `emails[1]` as separate keys instead of `contacts: [...]`.
 */
function coalesceBracketIndexedField(body, baseName) {
    const re = new RegExp(`^${escapeRegExp(baseName)}\\[(\\d+)\\]$`);
    const entries = [];
    for (const key of Object.keys(body)) {
        const m = key.match(re);
        if (m)
            entries.push({ idx: parseInt(m[1], 10), val: body[key] });
    }
    if (entries.length === 0)
        return null;
    entries.sort((a, b) => a.idx - b.idx);
    return entries.map((e) => e.val);
}
function parseContactRowsFromBracketValues(values) {
    const out = [];
    for (const item of values) {
        if (item == null)
            continue;
        if (typeof item === 'object' && !Array.isArray(item)) {
            const o = item;
            const v = o.value ?? o.phone ?? o.number ?? o.mobile;
            if (v != null && String(v).trim() !== '') {
                out.push({
                    type: String(o.type || 'phone'),
                    value: String(v).trim(),
                    countryCode: o.countryCode != null ? String(o.countryCode) : '',
                });
            }
            continue;
        }
        if (typeof item === 'string') {
            const s = item.trim();
            if (!s)
                continue;
            if (s.startsWith('{')) {
                try {
                    const o = JSON.parse(s);
                    const v = o.value ?? o.phone ?? o.number ?? o.mobile;
                    if (v != null && String(v).trim() !== '') {
                        out.push({
                            type: String(o.type || 'phone'),
                            value: String(v).trim(),
                            countryCode: o.countryCode != null ? String(o.countryCode) : '',
                        });
                    }
                }
                catch {
                    /* ignore */
                }
            }
        }
    }
    return out.length ? out : null;
}
function parseEmailRowsFromBracketValues(values) {
    const out = [];
    for (const item of values) {
        if (item == null)
            continue;
        if (typeof item === 'string') {
            const s = item.trim();
            if (s)
                out.push({ type: 'personal', value: s });
        }
        else if (typeof item === 'object' && !Array.isArray(item)) {
            const o = item;
            const v = o.value ?? o.email;
            if (v != null && String(v).trim())
                out.push({ type: String(o.type || 'personal'), value: String(v).trim() });
        }
    }
    return out.length ? out : null;
}
function bodyHasBracketIndexedKey(body, baseNames) {
    return baseNames.some((base) => {
        const re = new RegExp(`^${escapeRegExp(base)}\\[\\d+\\]$`);
        return Object.keys(body).some((k) => re.test(k));
    });
}
function collectFlatPhones(body) {
    const out = [];
    const add = (type, v) => {
        if (v == null)
            return;
        const str = String(v).trim();
        if (!str)
            return;
        out.push({ type, value: str, countryCode: '' });
    };
    add('mobile', body.personalPhone ?? body.mobilePhone ?? body.mobile ?? body.phoneNumber ?? body.phone);
    add('emergency', body.emergencyPhone ?? body.emergencyContact ?? body.emergency_contact);
    add('alternative', body.alternativePhone ?? body.alternatePhone ?? body.secondaryPhone ?? body.alternative_phone);
    return out;
}
function collectFlatEmails(body) {
    const out = [];
    const add = (type, v) => {
        if (v == null)
            return;
        const str = String(v).trim();
        if (!str)
            return;
        out.push({ type, value: str });
    };
    add('personal', body.personalEmail ?? body.secondaryEmail ?? body.personal_email);
    return out;
}
/** Persisted as JSON in User.phoneNumbers */
function resolvePhoneNumbersJson(body) {
    let arr = parseFormDataArray(body.contacts) ||
        parseFormDataArray(body.contactPhones) ||
        parseFormDataArray(body.phones);
    if (!arr?.length) {
        const bracket = coalesceBracketIndexedField(body, 'contacts');
        if (bracket?.length) {
            const parsed = parseContactRowsFromBracketValues(bracket);
            if (parsed?.length)
                arr = parsed;
        }
    }
    if (!arr?.length && typeof body.phoneNumbers === 'string' && body.phoneNumbers.trim()) {
        try {
            const p = JSON.parse(body.phoneNumbers);
            if (Array.isArray(p) && p.length)
                arr = p;
        }
        catch {
            /* ignore */
        }
    }
    if (!arr?.length) {
        const flat = collectFlatPhones(body);
        if (flat.length)
            arr = flat;
    }
    if (Array.isArray(arr) && arr.length) {
        const normalized = parseContactRowsFromBracketValues(arr);
        if (normalized?.length)
            arr = normalized;
    }
    return arr?.length ? JSON.stringify(arr) : null;
}
/** Persisted as JSON in User.emailAddresses */
function resolveEmailAddressesJson(body) {
    let arr = parseFormDataArray(body.emails) || parseFormDataArray(body.emailList);
    if (!arr?.length) {
        const bracket = coalesceBracketIndexedField(body, 'emails');
        if (bracket?.length) {
            const parsed = parseEmailRowsFromBracketValues(bracket);
            if (parsed?.length)
                arr = parsed;
        }
    }
    if (!arr?.length && typeof body.emailAddresses === 'string' && body.emailAddresses.trim()) {
        try {
            const p = JSON.parse(body.emailAddresses);
            if (Array.isArray(p) && p.length)
                arr = p;
        }
        catch {
            /* ignore */
        }
    }
    if (!arr?.length) {
        const flat = collectFlatEmails(body);
        if (flat.length)
            arr = flat;
    }
    if (Array.isArray(arr) && arr.length) {
        const normalized = parseEmailRowsFromBracketValues(arr);
        if (normalized?.length)
            arr = normalized;
    }
    return arr?.length ? JSON.stringify(arr) : null;
}
function normalizeEmployeeDirectoryBody(body) {
    const raw0 = body || {};
    const rawExpanded = expandJsonStringFields(raw0);
    const deepFlat = {};
    deepCollectScalars(rawExpanded, deepFlat, 0);
    const combined = { ...deepFlat, ...rawExpanded };
    const merged = mergeWrappedPayload(combined);
    const b = { ...merged };
    hoistLegalNestedFields(merged, b);
    /**
     * Map alternate keys to Prisma field names. Must read from both `merged` and `b`:
     * nested legal blocks are merged onto `b` under their original names (e.g. labourCardNumber)
     * before this runs.
     */
    const fill = (canonical, aliases) => {
        if (!isEmpty(b[canonical]))
            return;
        for (const k of aliases) {
            for (const src of [merged, b]) {
                const v = src[k];
                if (!isEmpty(v)) {
                    b[canonical] = v;
                    return;
                }
            }
        }
    };
    fill('passportNumber', ['passport_number', 'passportNo']);
    fill('passportIssueDate', ['passport_issue_date', 'passportIssue', 'passport_issue']);
    fill('passportExpiryDate', ['passport_expiry_date', 'passportExpiry', 'passport_expiry']);
    fill('nationalIdNumber', ['national_id_number', 'nationalIDNumber', 'eid', 'emiratesId']);
    fill('nationalIdExpiryDate', ['national_id_expiry_date', 'nationalIdExpiry', 'eidExpiry']);
    fill('residencyNumber', ['residency_number', 'residencyNo']);
    fill('residencyExpiryDate', [
        'residency_expiry_date',
        'residencyExpiry',
        'residency_expiry',
        'visaExpiryDate',
        'visa_expiry_date',
    ]);
    fill('labourIdNumber', [
        'labourCardNumber',
        'laborCardNumber',
        'labourNumber',
        'labour_no',
        'labour_card_number',
        'labor_card_number',
        'labourCardNo',
        'labour_card_no',
        'workPermitNumber',
        'work_permit_number',
    ]);
    fill('labourIdExpiryDate', [
        'labourCardExpiryDate',
        'labourCardExpiry',
        'laborCardExpiryDate',
        'labour_card_expiry_date',
        'labour_card_expiry',
    ]);
    fill('drivingLicenseNumber', [
        'drivingLicenceNumber',
        'driving_license_number',
        'driving_licence_number',
        'licenseNumber',
        'licenceNumber',
        'dlNumber',
        'dl_number',
    ]);
    fill('drivingLicenseExpiryDate', [
        'drivingLicenceExpiryDate',
        'driving_license_expiry_date',
        'driving_licence_expiry_date',
        'licenseExpiryDate',
        'licenceExpiryDate',
    ]);
    fill('insuranceNumber', ['insurance_number', 'insuranceNo']);
    fill('insuranceExpiryDate', ['insurance_expiry_date', 'insuranceExpiry']);
    fill('visaNumber', [
        'visa_number',
        'visa_no',
        'visaNo',
        'uidNumber',
        'uid_number',
        'uidNo',
        'emiratesUid',
        'emirates_uid',
    ]);
    fill('contacts', ['contactPhones', 'phoneContacts']);
    fill('emails', ['emailList', 'additionalEmails']);
    fill('gender', ['sex']);
    fill('maritalStatus', ['marital_status', 'marital']);
    fill('birthday', ['dateOfBirth', 'dob', 'birthDate', 'date_of_birth']);
    fill('joiningDate', ['joinDate', 'dateOfJoining', 'joining_date', 'date_of_joining', 'startDate']);
    fill('department', ['departmentName', 'dept', 'deptName', 'department_name']);
    liftNestedFormSectionsOntoRoot(b);
    return b;
}
/** Section roots where wizards nest fields (possibly 2 levels deep under `employee`). */
const NEST_SECTION_KEYS = [
    'legal',
    'legalDocuments',
    'personal',
    'personalInfo',
    'personalDetails',
    'profile',
    'employee',
    'directory',
];
function liftScalarsOntoTarget(target, node) {
    for (const [k, v] of Object.entries(node)) {
        if (v === undefined || v === '')
            continue;
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
            liftScalarsOntoTarget(target, v);
            continue;
        }
        if (isEmpty(target[k])) {
            target[k] = v;
        }
    }
}
/** Copy scalar fields from nested sections onto the root body when the root key is empty. */
function liftNestedFormSectionsOntoRoot(target) {
    for (const sectionKey of NEST_SECTION_KEYS) {
        const nest = target[sectionKey];
        if (nest == null || typeof nest !== 'object' || Array.isArray(nest))
            continue;
        liftScalarsOntoTarget(target, nest);
    }
}
function shouldPatchPhoneNumbers(body) {
    if ([
        'contacts',
        'contactPhones',
        'phones',
        'phoneNumbers',
        'personalPhone',
        'mobilePhone',
        'emergencyPhone',
        'emergencyContact',
        'alternativePhone',
        'alternatePhone',
        'secondaryPhone',
        'emergency_contact',
        'alternative_phone',
    ].some((k) => body[k] !== undefined)) {
        return true;
    }
    return bodyHasBracketIndexedKey(body, ['contacts', 'contactPhones', 'phones']);
}
function shouldPatchEmailAddresses(body) {
    if (['emails', 'emailList', 'emailAddresses', 'personalEmail', 'secondaryEmail', 'personal_email'].some((k) => body[k] !== undefined)) {
        return true;
    }
    return bodyHasBracketIndexedKey(body, ['emails', 'emailList']);
}
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Normalize line-manager id from multipart/JSON (`""` => clear, ignore non-UUID values). */
function resolveManagerIdInput(raw) {
    if (raw === undefined)
        return undefined;
    if (raw === null)
        return null;
    const s = String(raw).trim();
    if (!s)
        return null;
    if (!UUID_LIKE.test(s))
        return null;
    return s;
}
//# sourceMappingURL=employee-directory-body.js.map