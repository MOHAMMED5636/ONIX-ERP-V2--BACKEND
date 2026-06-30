import { UserRole } from '@prisma/client';

const MANAGER_ROLES: UserRole[] = ['ADMIN', 'SUPER_ADMIN', 'HR'];

export function isAssetManager(role?: string | null): boolean {
  return MANAGER_ROLES.includes((role || '') as UserRole);
}

export type QrScanContext = {
  mode: 'PUBLIC' | 'EMPLOYEE' | 'MANAGER';
  asset?: {
    id: string;
    assetTag: string;
    serialNumber: string | null;
    status: string;
    assetName: string;
    qrToken: string;
    assignedToId: string | null;
    depreciation?: unknown;
  };
  message?: string;
};

export function resolveQrScanAccess(input: {
  asset: any;
  user?: { id: string; role?: string } | null;
}): QrScanContext {
  if (!input.user?.id) {
    return {
      mode: 'PUBLIC',
      message: 'This device is property of the company. Please contact administration if found.',
    };
  }

  const shaped = {
    id: input.asset.id,
    assetTag: input.asset.assetTag,
    serialNumber: input.asset.serialNumber,
    status: input.asset.status,
    assetName: input.asset.assetName || input.asset.category?.name,
    qrToken: input.asset.qrToken,
    assignedToId: input.asset.assignedToId,
    depreciation: input.asset.depreciation,
  };

  if (isAssetManager(input.user.role)) {
    return { mode: 'MANAGER', asset: shaped };
  }

  if (input.asset.assignedToId === input.user.id) {
    return { mode: 'EMPLOYEE', asset: shaped };
  }

  return {
    mode: 'PUBLIC',
    message: 'This device is property of the company. Please contact administration if found.',
  };
}
