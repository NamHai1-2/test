/**
 * Password policy CR-08, same rule as apps/api/src/lib/password-policy.ts: 8-64 characters, at least one
 * letter and one digit, not equal to the email. The server decides; this only avoids a useless request.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

export function isValidPassword(password: string, email?: string): boolean {
  const length = [...password].length; // count characters, not UTF-16 units
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) return false;
  if (!/\p{L}/u.test(password) || !/\p{Nd}/u.test(password)) return false;
  if (email !== undefined && password.toLowerCase() === email.trim().toLowerCase()) return false;
  return true;
}
