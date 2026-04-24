import type { Request } from 'express';
import { parseEmployeeDate } from './employee-directory-body';

/** Date-only fields used by Employee Directory forms (`<input type="date">` expects YYYY-MM-DD). */
export const EMPLOYEE_DIRECTORY_DATE_KEYS = [
  'birthday',
  'joiningDate',
  'exitDate',
  'passportIssueDate',
  'passportExpiryDate',
  'nationalIdExpiryDate',
  'residencyExpiryDate',
  'insuranceExpiryDate',
  'drivingLicenseExpiryDate',
  'labourIdExpiryDate',
] as const;

function toDateOnlyString(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const parsed = parseEmployeeDate(value as string | number | Date | null | undefined);
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  }
  return null;
}

/**
 * DB sometimes has `[\"{\\\"type\\\":\\\"phone\\\"...}\"]` — array of JSON strings instead of objects.
 * Flatten to a proper JSON array string for the client.
 */
function repairContactsJsonArrayString(text: string): string {
  try {
    const p = JSON.parse(text) as unknown;
    if (!Array.isArray(p)) return text;
    const next = p.map((item) => {
      if (typeof item !== 'string') return item;
      const t = item.trim();
      if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('{') && t.includes('"type"'))) {
        try {
          return JSON.parse(t) as unknown;
        } catch {
          return item;
        }
      }
      return item;
    });
    return JSON.stringify(next);
  } catch {
    return text;
  }
}

function attachParsedJsonArray(out: Record<string, unknown>, key: string, listKey: string): void {
  const raw = out[key];
  if (typeof raw !== 'string' || !raw.trim()) {
    out[listKey] = null;
    return;
  }
  try {
    out[listKey] = JSON.parse(raw) as unknown;
  } catch {
    out[listKey] = null;
  }
}

function camelToSnake(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/** `1991-09-12` → `12/09/1991` (UAE / common text date inputs with dd/mm/yyyy placeholder) */
function yyyyMmDdToDdMmYyyy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Extra shapes many frontends expect: Formatted (dd/mm/yyyy), noon UTC ISO, short keys (passportExpiry, etc.).
 */
const DATE_SHORT_ALIAS: Partial<Record<(typeof EMPLOYEE_DIRECTORY_DATE_KEYS)[number], string>> = {
  birthday: 'birthDate',
  joiningDate: 'joinDate',
  exitDate: 'exitDate',
  passportIssueDate: 'passportIssue',
  passportExpiryDate: 'passportExpiry',
  nationalIdExpiryDate: 'nationalIdExpiry',
  residencyExpiryDate: 'residencyExpiry',
  insuranceExpiryDate: 'insuranceExpiry',
  drivingLicenseExpiryDate: 'drivingLicenseExpiry',
  labourIdExpiryDate: 'labourCardExpiry',
};

function addDateDisplayVariants(out: Record<string, unknown>): void {
  for (const key of EMPLOYEE_DIRECTORY_DATE_KEYS) {
    const v = out[key];
    if (v === null || v === undefined || v === '') {
      out[`${key}Formatted`] = null;
      out[`${key}_dd_mm_yyyy`] = null;
      out[`${key}Iso`] = null;
      const short = DATE_SHORT_ALIAS[key];
      if (short) {
        out[short] = null;
        out[`${short}Formatted`] = null;
      }
      continue;
    }
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) continue;
    const ddmm = yyyyMmDdToDdMmYyyy(t);
    out[`${key}Formatted`] = ddmm;
    out[`${key}_dd_mm_yyyy`] = ddmm;
    out[`${key}Iso`] = `${t}T12:00:00.000Z`;
    const short = DATE_SHORT_ALIAS[key];
    if (short) {
      out[short] = t;
      out[`${short}Formatted`] = ddmm;
    }
  }
}

/**
 * Build an absolute URL for uploaded files so a SPA on another origin can link/download them.
 * Relative stored values are under /uploads/photos or /uploads/documents.
 */
export function publicUploadFileUrl(
  req: Request | undefined,
  folder: 'photos' | 'documents',
  filename: string | null | undefined
): string | null {
  if (filename == null) return null;
  const f = String(filename).trim();
  if (!f) return null;
  if (f.startsWith('http://') || f.startsWith('https://')) return f;
  const pathPart = f.startsWith('/uploads/') ? f : `/uploads/${folder}/${f}`;
  if (!req) return pathPart;
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  if (!host) return pathPart;
  return `${proto}://${host}${pathPart}`;
}

/**
 * Nested legal block + spelling aliases — many UIs bind `form.legal.*` or `legalDocuments.*`
 * instead of top-level camelCase.
 */
function attachDirectoryAliases(out: Record<string, unknown>): void {
  const legal: Record<string, unknown> = {
    passportNumber: out.passportNumber ?? null,
    passportIssueDate: out.passportIssueDate ?? null,
    passportExpiryDate: out.passportExpiryDate ?? null,
    passportAttachment: out.passportAttachment ?? null,
    passportAttachmentUrl: out.passportAttachmentUrl ?? null,
    nationalIdNumber: out.nationalIdNumber ?? null,
    nationalIdExpiryDate: out.nationalIdExpiryDate ?? null,
    nationalIdAttachment: out.nationalIdAttachment ?? null,
    nationalIdAttachmentUrl: out.nationalIdAttachmentUrl ?? null,
    residencyNumber: out.residencyNumber ?? null,
    residencyExpiryDate: out.residencyExpiryDate ?? null,
    residencyAttachment: out.residencyAttachment ?? null,
    residencyAttachmentUrl: out.residencyAttachmentUrl ?? null,
    visaNumber: out.visaNumber ?? null,
    insuranceNumber: out.insuranceNumber ?? null,
    insuranceExpiryDate: out.insuranceExpiryDate ?? null,
    insuranceAttachment: out.insuranceAttachment ?? null,
    insuranceAttachmentUrl: out.insuranceAttachmentUrl ?? null,
    drivingLicenseNumber: out.drivingLicenseNumber ?? null,
    drivingLicenseExpiryDate: out.drivingLicenseExpiryDate ?? null,
    drivingLicenseAttachment: out.drivingLicenseAttachment ?? null,
    drivingLicenseAttachmentUrl: out.drivingLicenseAttachmentUrl ?? null,
    labourIdNumber: out.labourIdNumber ?? null,
    labourIdExpiryDate: out.labourIdExpiryDate ?? null,
    labourIdAttachment: out.labourIdAttachment ?? null,
    labourIdAttachmentUrl: out.labourIdAttachmentUrl ?? null,
    labourCardNumber: out.labourIdNumber ?? null,
    laborCardNumber: out.labourIdNumber ?? null,
    drivingLicenceNumber: out.drivingLicenseNumber ?? null,
    drivingLicenceExpiryDate: out.drivingLicenseExpiryDate ?? null,
  };

  for (const key of EMPLOYEE_DIRECTORY_DATE_KEYS) {
    legal[key] = out[key] ?? null;
    legal[`${key}Formatted`] = out[`${key}Formatted`] ?? null;
    legal[`${key}_dd_mm_yyyy`] = out[`${key}_dd_mm_yyyy`] ?? null;
    legal[`${key}Iso`] = out[`${key}Iso`] ?? null;
    const short = DATE_SHORT_ALIAS[key];
    if (short) {
      legal[short] = out[short] ?? null;
      legal[`${short}Formatted`] = out[`${short}Formatted`] ?? null;
    }
  }

  out.legalDocuments = legal;
  out.legal = legal;

  out.dateOfBirth = out.birthday ?? null;
  out.dateOfBirthFormatted = (out.birthdayFormatted ?? out.birthDateFormatted) as string | null;
  out.labourCardNumber = out.labourIdNumber ?? null;
  out.laborCardNumber = out.labourIdNumber ?? null;
  out.drivingLicenceNumber = out.drivingLicenseNumber ?? null;

  for (const key of EMPLOYEE_DIRECTORY_DATE_KEYS) {
    const snake = camelToSnake(key);
    if (snake !== key) {
      out[snake] = out[key] ?? null;
      const fmt = out[`${key}Formatted`];
      if (fmt !== undefined) {
        out[`${snake}_formatted`] = fmt;
      }
    }
  }
}

/**
 * Normalize employee records for API consumers (edit forms, directory UI):
 * - Directory dates as YYYY-MM-DD strings (read from Prisma row, always emit each key)
 * - Downloadable URLs for photo and legal document filenames
 * - Nested `legal` / `legalDocuments`, snake_case dates, common spelling aliases
 */
export function shapeEmployeeForClient(
  employee: Record<string, unknown>,
  req?: Request
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...employee };

  if (typeof out.phoneNumbers === 'string' && out.phoneNumbers.trim()) {
    out.phoneNumbers = repairContactsJsonArrayString(out.phoneNumbers);
  }
  if (typeof out.emailAddresses === 'string' && out.emailAddresses.trim()) {
    out.emailAddresses = repairContactsJsonArrayString(out.emailAddresses);
  }
  attachParsedJsonArray(out, 'phoneNumbers', 'phoneNumbersList');
  attachParsedJsonArray(out, 'emailAddresses', 'emailAddressesList');

  for (const key of EMPLOYEE_DIRECTORY_DATE_KEYS) {
    const raw = Object.prototype.hasOwnProperty.call(employee, key) ? employee[key] : undefined;
    if (raw == null || raw === '') {
      out[key] = null;
      continue;
    }
    const formatted = toDateOnlyString(raw);
    if (formatted != null) {
      out[key] = formatted;
    } else if (typeof raw === 'string' && raw.trim() !== '') {
      out[key] = raw.trim();
    } else {
      out[key] = null;
    }
  }

  out.photoUrl = publicUploadFileUrl(req, 'photos', out.photo as string | null | undefined);
  out.passportAttachmentUrl = publicUploadFileUrl(req, 'documents', out.passportAttachment as string | null | undefined);
  out.nationalIdAttachmentUrl = publicUploadFileUrl(req, 'documents', out.nationalIdAttachment as string | null | undefined);
  out.residencyAttachmentUrl = publicUploadFileUrl(req, 'documents', out.residencyAttachment as string | null | undefined);
  out.insuranceAttachmentUrl = publicUploadFileUrl(req, 'documents', out.insuranceAttachment as string | null | undefined);
  out.drivingLicenseAttachmentUrl = publicUploadFileUrl(req, 'documents', out.drivingLicenseAttachment as string | null | undefined);
  out.labourIdAttachmentUrl = publicUploadFileUrl(req, 'documents', out.labourIdAttachment as string | null | undefined);

  addDateDisplayVariants(out);
  attachDirectoryAliases(out);

  const pas = out.positionAssignments;
  delete out.positionAssignments;
  if (Array.isArray(pas)) {
    out.additionalPositionIds = pas
      .map((x) => (x && typeof x === 'object' && 'positionId' in x ? (x as { positionId?: string }).positionId : null))
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  } else {
    out.additionalPositionIds = [];
  }

  return out;
}
