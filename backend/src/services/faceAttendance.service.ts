import fs from 'fs';
import path from 'path';
import { UserRole } from '@prisma/client';
import { config } from '../config/env';

const MOBILE_UA =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i;

const EXEMPT_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'HR'];

/** ERP login accounts excluded from employee attendance lists (manual entry, face check-in). */
export const ATTENDANCE_EXEMPT_ROLES: UserRole[] = EXEMPT_ROLES;

export function isMobileUserAgent(userAgent: string | undefined | null): boolean {
  if (!userAgent) return false;
  return MOBILE_UA.test(userAgent);
}

export function isFacialAttendanceExempt(role: UserRole | undefined): boolean {
  if (!role) return false;
  return EXEMPT_ROLES.includes(role);
}

export function facialAttendanceGloballyEnabled(): boolean {
  return process.env.ATTENDANCE_REQUIRE_FACIAL === 'true';
}

export function companyRequiresFacial(company: {
  requireFacialAttendance?: boolean | null;
} | null): boolean {
  if (facialAttendanceGloballyEnabled()) return true;
  return !!company?.requireFacialAttendance;
}

export function resolveFacialMinScore(company: { facialMatchMinScore?: number | null } | null): number {
  const raw = company?.facialMatchMinScore;
  if (typeof raw === 'number' && raw > 0 && raw <= 1) return raw;
  return 0.55;
}

export interface FacialAttendanceInput {
  faceImage?: string;
  faceMatchScore?: number;
}

export type FacialValidationResult =
  | {
      ok: true;
      facePhotoPath: string | null;
      faceMatchScore: number | null;
      faceVerified: boolean;
    }
  | {
      ok: false;
      status: number;
      code?: string;
      message: string;
    };

function ensureAttendanceFacesDir(): string {
  const dir = path.join(config.upload.dir, 'attendance-faces');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Save base64 JPEG/PNG selfie; returns relative path under uploads */
export function saveAttendanceFacePhoto(
  userId: string,
  attendanceType: 'CHECK_IN' | 'CHECK_OUT',
  faceImage: string,
): string {
  const match = faceImage.match(/^data:image\/(jpeg|jpg|png);base64,(.+)$/i);
  const ext = match?.[1]?.toLowerCase() === 'png' ? 'png' : 'jpg';
  const b64 = match?.[2] ?? faceImage.replace(/^data:image\/\w+;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 1000) {
    throw new Error('Face image too small');
  }
  if (buf.length > 5 * 1024 * 1024) {
    throw new Error('Face image too large');
  }
  const dir = ensureAttendanceFacesDir();
  const filename = `${userId}-${attendanceType}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buf);
  return `/uploads/attendance-faces/${filename}`;
}

export function applyFacialAttendance(
  userId: string,
  userAgent: string | undefined,
  role: UserRole | undefined,
  company: { requireFacialAttendance?: boolean | null; facialMatchMinScore?: number | null } | null,
  user: { photo?: string | null },
  attendanceType: 'CHECK_IN' | 'CHECK_OUT',
  input: FacialAttendanceInput,
): FacialValidationResult {
  if (isFacialAttendanceExempt(role)) {
    return { ok: true, facePhotoPath: null, faceMatchScore: null, faceVerified: false };
  }

  if (!companyRequiresFacial(company)) {
    return { ok: true, facePhotoPath: null, faceMatchScore: null, faceVerified: false };
  }

  // Desktop: ordinary check-in/out (no face). Mobile: require facial verification.
  if (!isMobileUserAgent(userAgent)) {
    return { ok: true, facePhotoPath: null, faceMatchScore: null, faceVerified: false };
  }

  if (!user.photo) {
    return {
      ok: false,
      status: 400,
      code: 'FACE_PROFILE_REQUIRED',
      message:
        'Your profile photo is required for facial attendance. Please ask HR to upload your employee photo first.',
    };
  }

  const { faceImage, faceMatchScore } = input;
  if (!faceImage || typeof faceImage !== 'string') {
    return {
      ok: false,
      status: 400,
      code: 'FACE_IMAGE_REQUIRED',
      message: 'A live face photo is required to mark attendance.',
    };
  }

  const score = typeof faceMatchScore === 'number' ? faceMatchScore : Number(faceMatchScore);
  if (!Number.isFinite(score)) {
    return {
      ok: false,
      status: 400,
      code: 'FACE_MATCH_REQUIRED',
      message: 'Face verification score is missing. Please try again with the camera.',
    };
  }

  const minScore = resolveFacialMinScore(company);
  if (score < minScore) {
    return {
      ok: false,
      status: 403,
      code: 'FACE_MISMATCH',
      message: `Face verification failed. Please look at the camera in good lighting and try again. (Score ${(score * 100).toFixed(0)}%, required ${(minScore * 100).toFixed(0)}%)`,
    };
  }

  try {
    const facePhotoPath = saveAttendanceFacePhoto(userId, attendanceType, faceImage);
    return {
      ok: true,
      facePhotoPath,
      faceMatchScore: score,
      faceVerified: true,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not save face photo';
    return { ok: false, status: 400, code: 'FACE_IMAGE_INVALID', message: msg };
  }
}

export function buildProfilePhotoUrl(
  apiPublicUrl: string,
  photo: string | null | undefined,
): string | null {
  if (!photo) return null;
  if (photo.startsWith('http://') || photo.startsWith('https://') || photo.startsWith('data:')) {
    return photo;
  }
  const base = apiPublicUrl.replace(/\/$/, '');
  if (photo.startsWith('/uploads/')) return `${base}${photo}`;
  return `${base}/uploads/photos/${photo}`;
}

export function detectDeviceInfo(userAgent: string | undefined | null): string {
  if (!userAgent) return 'unknown';
  if (isMobileUserAgent(userAgent)) return 'mobile';
  return 'desktop';
}
