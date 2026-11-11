import { MESSAGES, formatMessage, type MsgCode } from './messages';
import type { Page, Role } from './api-types';

// Small helpers shared by the mock API files (mocks.ts for auth/admin, mocks-merchant.ts for merchant screens).

export const PAGE_SIZE = 20;

// HTTP status per message code (api-spec section 0).
export const STATUS: Partial<Record<MsgCode, number>> = {
  MSG01: 400,
  MSG33: 400,
  MSG37: 400,
  MSG02: 401,
  MSG35: 401,
  MSG04: 403,
  MSG15: 403,
  MSG22: 404,
  MSG25: 409,
  MSG26: 409,
  MSG27: 409,
  MSG31: 409,
  MSG34: 409,
  MSG38: 409,
  MSG40: 409,
  MSG41: 409,
  MSG08: 422,
  MSG09: 422,
  MSG24: 422,
  MSG32: 422,
  MSG36: 422,
  MSG39: 422,
  MSG23: 500,
};

export interface MockUser {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  password: string;
  merchantCode: string | null;
  /** False for a deactivated staff user: login answers MSG02 like a wrong password. */
  active: boolean;
  created_at: string;
}

export function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function ok(body: unknown, status = 200): Response {
  return respond(status, body);
}

export function empty(): Response {
  return new Response(null, { status: 204 });
}

/** CR-06 error answer. `params` fill {placeholders} of the message (for example {min_points} of MSG09). */
export function fail(
  code: MsgCode,
  status?: number,
  params?: Readonly<Record<string, string | number>>,
): Response {
  const message = params ? formatMessage(code, params) : MESSAGES[code];
  return respond(status ?? STATUS[code] ?? 400, { code, message });
}

export function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Page of 20 (api-spec section 0). Returns null when `page` is not an integer >= 1 (-> MSG33). */
export function paginate<T>(items: readonly T[], pageParam: string | null): Page<T> | null {
  const page = pageParam === null ? 1 : Number(pageParam);
  if (!Number.isInteger(page) || page < 1) return null;
  const from = (page - 1) * PAGE_SIZE;
  return { items: items.slice(from, from + PAGE_SIZE), page, page_size: PAGE_SIZE, total: items.length };
}

export const TX_TYPES: readonly string[] = ['ISSUE', 'REDEEM', 'REVERSAL'];
export const TX_STATUSES: readonly string[] = ['PENDING_ANCHOR', 'ANCHORED', 'FAILED'];
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** UTC timestamp -> calendar date in UTC+7 (date filters are interpreted in business time, CR-02). */
export function businessDate(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
