/** Hours a deleted project/task can be restored (Word-style recycle bin). */
export const DELETION_RECOVERY_HOURS = 24;

export function deletionRecoveryCutoffDate(now = new Date()): Date {
  return new Date(now.getTime() - DELETION_RECOVERY_HOURS * 60 * 60 * 1000);
}

export function isWithinDeletionRecoveryWindow(
  deletedAt: Date | string | null | undefined,
  now = new Date(),
): boolean {
  if (!deletedAt) return false;
  const at = deletedAt instanceof Date ? deletedAt : new Date(deletedAt);
  if (Number.isNaN(at.getTime())) return false;
  return at.getTime() >= deletionRecoveryCutoffDate(now).getTime();
}

export function hoursRemainingInRecoveryWindow(
  deletedAt: Date | string | null | undefined,
  now = new Date(),
): number {
  if (!deletedAt) return 0;
  const at = deletedAt instanceof Date ? deletedAt : new Date(deletedAt);
  if (Number.isNaN(at.getTime())) return 0;
  const expiresAt = at.getTime() + DELETION_RECOVERY_HOURS * 60 * 60 * 1000;
  const msLeft = expiresAt - now.getTime();
  return msLeft > 0 ? Math.ceil(msLeft / (60 * 60 * 1000)) : 0;
}
