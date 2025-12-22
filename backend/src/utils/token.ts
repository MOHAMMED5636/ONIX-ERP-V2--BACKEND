/**
 * Generate a secure invitation token for tender assignments
 */
export const generateInvitationToken = (tenderId: string, engineerId: string): string => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  return `inv_${tenderId}_${engineerId}_${timestamp}_${randomString}`;
};

/**
 * Validate invitation token format
 */
export const isValidInvitationToken = (token: string): boolean => {
  return !!token && token.startsWith('inv_') && token.split('_').length === 5;
};

/**
 * Parse invitation token to extract information
 */
export const parseInvitationToken = (token: string): { tenderId: string; engineerId: string; timestamp: number } | null => {
  if (!isValidInvitationToken(token)) return null;
  const parts = token.split('_');
  return {
    tenderId: parts[1],
    engineerId: parts[2],
    timestamp: parseInt(parts[3]),
  };
};

