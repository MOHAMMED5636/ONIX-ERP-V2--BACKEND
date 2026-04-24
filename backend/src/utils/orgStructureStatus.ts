import {
  DepartmentStatus,
  PositionStatus,
  SubDepartmentStatus,
} from '@prisma/client';

/** Accepts ACTIVE / INACTIVE or common UI labels (Active, Inactive). */
export function parseSubDepartmentStatus(input: unknown): SubDepartmentStatus | undefined {
  const s = String(input ?? '')
    .trim()
    .toUpperCase();
  if (s === 'ACTIVE') return SubDepartmentStatus.ACTIVE;
  if (s === 'INACTIVE') return SubDepartmentStatus.INACTIVE;
  return undefined;
}

export function parsePositionStatus(input: unknown): PositionStatus | undefined {
  const s = String(input ?? '')
    .trim()
    .toUpperCase();
  if (s === 'ACTIVE') return PositionStatus.ACTIVE;
  if (s === 'INACTIVE') return PositionStatus.INACTIVE;
  return undefined;
}

export function parseDepartmentStatus(input: unknown): DepartmentStatus | undefined {
  const s = String(input ?? '')
    .trim()
    .toUpperCase();
  if (s === 'ACTIVE') return DepartmentStatus.ACTIVE;
  if (s === 'INACTIVE') return DepartmentStatus.INACTIVE;
  return undefined;
}
