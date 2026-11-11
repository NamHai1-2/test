// Message texts shown by the portal (SRS 5.3). Mirror of apps/api/src/lib/messages.ts, codes and texts only:
// the web app is deployed on its own and must not import from apps/api. When a text changes in the API file,
// change it here in the same pull request (test/messages.test.ts is the reminder when both files are present).
// {placeholders} are filled in by formatMessage(). Error responses already carry the filled-in text in
// their "message" field, so these texts are used for success toasts and for client-side validation.

export const MESSAGES = {
  MSG01: 'This field is required and cannot be left blank.',
  MSG02: 'Incorrect email or password. Please try again.',
  MSG03: 'Login successful. Welcome to OctaPoint!',
  MSG04: 'Access denied. You do not have permission to perform this action.',
  MSG05: 'Loyalty rules have been updated successfully.',
  MSG06: 'Successfully issued {points} points to customer {customer_code}.',
  MSG07: 'Successfully redeemed {points} points. New balance: {new_balance}.',
  MSG08: 'Insufficient point balance for this redemption.',
  MSG09: 'Redemption amount must be at least {min_points} points.',
  MSG10: 'API Key and Secret generated successfully.',
  MSG11: 'Please copy your API Secret now. It will not be shown again!',
  MSG12: 'API Key has been revoked successfully.',
  MSG13: 'Merchant has been approved and activated.',
  MSG14: 'Merchant has been suspended.',
  MSG15: 'Your merchant account is suspended or pending approval.',
  MSG16: 'Invalid HMAC-SHA256 signature.',
  MSG17: 'Request timestamp is expired or outside the valid window.',
  MSG18: 'API Key is invalid, suspended or revoked.',
  MSG19: 'Reversal transaction {reversal_id} executed successfully.',
  MSG20: 'Transaction saved. Awaiting Sui Testnet proof anchoring.',
  MSG21: 'Transaction proof anchored on Sui Testnet.',
  MSG22: 'Customer code not found.',
  MSG23: 'An unexpected error occurred. Please try again later.',
  MSG24: 'The spend amount is too low to earn any point.',
  MSG25: 'Reversal rejected: the customer\'s balance would become negative.',
  MSG26: 'This transaction has already been reversed or cannot be reversed.',
  MSG27: 'This customer code already exists.',
  MSG28: 'Add new {entity_name} successfully.',
  MSG29: 'Update {entity_name} successfully.',
  MSG30: 'Registration submitted. Your account is pending approval.',
  MSG31: 'This email is already registered.',
  MSG32: 'Loyalty rules are not set yet.',
  MSG33: 'Request data is invalid.',
  MSG34: 'This Idempotency-Key was already used with a different request.',
  MSG35: 'Your session has ended. Please log in again.',
  MSG36: 'The current password is incorrect.',
  MSG37: 'Password must be 8–64 characters and include at least one letter and one digit.',
  MSG38: 'This phone number already exists.',
  MSG39: 'This customer is inactive.',
  MSG40: 'The maximum number of active API keys has been reached. Revoke one first.',
  MSG41: 'Reversal rejected: the customer\'s balance would exceed the maximum.',
} as const;

export type MsgCode = keyof typeof MESSAGES;

export function isMsgCode(value: string): value is MsgCode {
  return Object.prototype.hasOwnProperty.call(MESSAGES, value);
}

/** Replaces {name} placeholders. Unknown placeholders are left untouched. */
export function formatMessage(
  code: MsgCode,
  params: Readonly<Record<string, string | number>> = {},
): string {
  return MESSAGES[code].replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}
