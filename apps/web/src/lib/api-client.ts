import { ApiError } from './api-error';
import type {
  AdminDashboard,
  AdminLedgerItem,
  AdminLedgerQuery,
  AdminMerchantItem,
  AdminMerchantsQuery,
  ApiKeyItem,
  ChangePasswordRequest,
  CreateCustomerRequest,
  CreateStaffRequest,
  CreatedApiKey,
  CustomerItem,
  ErrorBody,
  LedgerFilters,
  LedgerItem,
  LoginRequest,
  LoginResponse,
  LoyaltyRules,
  MeResponse,
  MerchantDashboard,
  Page,
  RegisterRequest,
  ReverseResponse,
  StaffItem,
  TransactionObject,
  UpdateCustomerRequest,
} from './api-types';

export { ApiError } from './api-error';

// Typed client for the Portal API (api-spec section B). The browser only calls relative URLs; the proxy in
// next.config.mjs forwards /api/* to the backend, so the HttpOnly session cookie is first-party (B.1).
// No token is ever kept in JavaScript: the cookie does the work, and there is nothing in localStorage.

const API_PREFIX = '/api/v1';
const CSRF_HEADER = 'X-Requested-With';
const CSRF_VALUE = 'octapoint-portal';
const IDEMPOTENCY_HEADER = 'X-Idempotency-Key';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// ---- session expiry (MSG35) ----
function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === '/login') return;
  window.location.assign('/login');
}

let sessionExpiredHandler: () => void = redirectToLogin;

/** Replaces the "go to /login" behaviour (used by tests). Pass null to restore the default. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler ?? redirectToLogin;
}

// ---- mock mode ----
/** True when the portal runs against the in-memory mock API (NEXT_PUBLIC_USE_MOCKS=true). */
export function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
}

async function transport(url: string, init: RequestInit): Promise<Response> {
  if (isMockMode()) {
    // Loaded on demand so the fixtures never end up in a normal bundle.
    const { mockFetch } = await import('./mocks');
    return mockFetch(url, init);
  }
  return fetch(url, init);
}

// ---- plumbing ----
function parseErrorBody(text: string): Partial<ErrorBody> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Partial<ErrorBody>) : null;
  } catch {
    return null;
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = parseErrorBody(await response.text().catch(() => ''));
  if (body && typeof body.code === 'string') {
    return new ApiError(
      body.code,
      response.status,
      typeof body.message === 'string' ? body.message : undefined,
      typeof body.server_time === 'number' ? body.server_time : undefined,
    );
  }
  // Not a CR-06 body (proxy error page, gateway timeout ...): show the generic message.
  return new ApiError('MSG23', response.status);
}

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  extraHeaders?: Readonly<Record<string, string>>,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...extraHeaders };
  if (method !== 'GET') headers[CSRF_HEADER] = CSRF_VALUE; // cheap CSRF guard (api-spec B.1)
  let payload: string | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await transport(`${API_PREFIX}${path}`, {
      method,
      headers,
      body: payload,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('MSG23', 0); // network failure: the server never answered
  }

  if (!response.ok) {
    const error = await toApiError(response);
    if (error.status === 401 && error.code === 'MSG35') sessionExpiredHandler();
    throw error;
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError('MSG23', response.status);
  }
}

/** Builds "?a=1&b=2" and leaves out empty values. */
export function buildQuery(
  params: Readonly<Record<string, string | number | null | undefined>>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

// ---- B.2 authentication and account ----
/** UC-18. 201, then show MSG30. Errors: MSG01, MSG31, MSG37. */
export async function register(body: RegisterRequest): Promise<void> {
  await request<unknown>('POST', '/auth/register', body);
}

/** UC-01. 200 with the user and the role-based redirect. Errors: MSG02 (also for an inactive user), MSG15. */
export function login(body: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('POST', '/auth/login', body);
}

/** 204. Revokes the session. */
export async function logout(): Promise<void> {
  await request<unknown>('POST', '/auth/logout');
}

export function getMe(): Promise<MeResponse> {
  return request<MeResponse>('GET', '/auth/me');
}

/** UC-02. 200, then show MSG29. Errors: MSG36 (wrong current password), MSG37 (policy). */
export async function changePassword(body: ChangePasswordRequest): Promise<void> {
  await request<unknown>('POST', '/auth/change-password', body);
}

// ---- B.3 admin ----
export function getAdminDashboard(): Promise<AdminDashboard> {
  return request<AdminDashboard>('GET', '/admin/dashboard');
}

export function listAdminMerchants(query: AdminMerchantsQuery = {}): Promise<Page<AdminMerchantItem>> {
  return request<Page<AdminMerchantItem>>(
    'GET',
    `/admin/merchants${buildQuery({ status: query.status, page: query.page })}`,
  );
}

/** UC-04. PENDING or SUSPENDED -> ACTIVE. 200, then show MSG13. */
export async function approveMerchant(id: string): Promise<void> {
  await request<unknown>('POST', `/admin/merchants/${encodeURIComponent(id)}/approve`);
}

/** ACTIVE -> SUSPENDED. 200, then show MSG14. Any other state -> MSG33. */
export async function suspendMerchant(id: string): Promise<void> {
  await request<unknown>('POST', `/admin/merchants/${encodeURIComponent(id)}/suspend`);
}

/** UC-13, read-only, all merchants. */
export function listAdminLedger(query: AdminLedgerQuery = {}): Promise<Page<AdminLedgerItem>> {
  return request<Page<AdminLedgerItem>>(
    'GET',
    `/admin/ledger${buildQuery({
      type: query.type,
      status: query.status,
      date_from: query.date_from,
      date_to: query.date_to,
      customer_code: query.customer_code,
      merchant_code: query.merchant_code,
      page: query.page,
    })}`,
  );
}

// ---- B.4 merchant ----
/** UC-05, Owner only. */
export function getMerchantDashboard(): Promise<MerchantDashboard> {
  return request<MerchantDashboard>('GET', '/merchant/dashboard');
}

/** Owner only. `null` when the rules were never saved (the API answers `{}`). */
export async function getRules(): Promise<LoyaltyRules | null> {
  const rules = await request<Partial<LoyaltyRules>>('GET', '/merchant/rules');
  if (typeof rules.earn_ratio === 'number' && typeof rules.min_redemption_threshold === 'number') {
    return { earn_ratio: rules.earn_ratio, min_redemption_threshold: rules.min_redemption_threshold };
  }
  return null;
}

/** UC-06, Owner only. 200, then show MSG05. Positive integers up to 1,000,000, otherwise MSG33. */
export function saveRules(body: LoyaltyRules): Promise<LoyaltyRules> {
  return request<LoyaltyRules>('PUT', '/merchant/rules', body);
}

export function listCustomers(query: { q?: string; page?: number } = {}): Promise<Page<CustomerItem>> {
  return request<Page<CustomerItem>>(
    'GET',
    `/merchant/customers${buildQuery({ q: query.q?.trim(), page: query.page })}`,
  );
}

/** UC-09. 201, then show MSG28 with entity_name "customer". Errors: MSG27, MSG38, MSG01, MSG33. */
export function createCustomer(body: CreateCustomerRequest): Promise<CustomerItem> {
  return request<CustomerItem>('POST', '/merchant/customers', body);
}

/** 200, then show MSG29. The code never changes. Errors: MSG38, MSG22, MSG33. */
export function updateCustomer(code: string, body: UpdateCustomerRequest): Promise<CustomerItem> {
  return request<CustomerItem>('PATCH', `/merchant/customers/${encodeURIComponent(code)}`, body);
}

/** Owner only. */
export function deactivateCustomer(code: string): Promise<CustomerItem> {
  return request<CustomerItem>('POST', `/merchant/customers/${encodeURIComponent(code)}/deactivate`);
}

/** Owner only. */
export function reactivateCustomer(code: string): Promise<CustomerItem> {
  return request<CustomerItem>('POST', `/merchant/customers/${encodeURIComponent(code)}/reactivate`);
}

/**
 * UC-10. 201, then show MSG06 and MSG20. `idempotencyKey` is REQUIRED (one UUID per submission, the same one
 * when the same submission is retried). Errors: MSG22, MSG39, MSG32, MSG24, MSG33, MSG34.
 */
export function issuePoints(
  customerCode: string,
  amount: number,
  idempotencyKey: string,
): Promise<TransactionObject> {
  return request<TransactionObject>(
    'POST',
    `/merchant/customers/${encodeURIComponent(customerCode)}/issue`,
    { amount },
    { [IDEMPOTENCY_HEADER]: idempotencyKey },
  );
}

/**
 * UC-11. 201, then show MSG07 and MSG20. Same idempotency rule as issuePoints.
 * Errors: MSG22, MSG39, MSG32, MSG09, MSG08, MSG33, MSG34.
 */
export function redeemPoints(
  customerCode: string,
  points: number,
  idempotencyKey: string,
): Promise<TransactionObject> {
  return request<TransactionObject>(
    'POST',
    `/merchant/customers/${encodeURIComponent(customerCode)}/redeem`,
    { points },
    { [IDEMPOTENCY_HEADER]: idempotencyKey },
  );
}

/** Owner only. The key list is paginated like every list. */
export function listApiKeys(page?: number): Promise<Page<ApiKeyItem>> {
  return request<Page<ApiKeyItem>>('GET', `/merchant/api-keys${buildQuery({ page })}`);
}

/**
 * UC-07, Owner only. 201 with the secret: show MSG10 and MSG11 and keep the secret in the modal only.
 * Error MSG40 when 5 keys are already ACTIVE or SUSPENDED.
 */
export function createApiKey(): Promise<CreatedApiKey> {
  return request<CreatedApiKey>('POST', '/merchant/api-keys');
}

/** Owner only. 200, then show MSG12. */
export function revokeApiKey(id: string): Promise<ApiKeyItem> {
  return request<ApiKeyItem>('POST', `/merchant/api-keys/${encodeURIComponent(id)}/revoke`);
}

/** Owner only. The Owner is not part of the list. */
export function listStaff(page?: number): Promise<Page<StaffItem>> {
  return request<Page<StaffItem>>('GET', `/merchant/staff${buildQuery({ page })}`);
}

/** UC-08, Owner only. 201, then show MSG28 with entity_name "staff account". Errors: MSG31, MSG37, MSG33. */
export function createStaff(body: CreateStaffRequest): Promise<StaffItem> {
  return request<StaffItem>('POST', '/merchant/staff', body);
}

/** Owner only. The staff user cannot sign in any more and the sessions end. No reactivation. */
export function deactivateStaff(id: string): Promise<StaffItem> {
  return request<StaffItem>('POST', `/merchant/staff/${encodeURIComponent(id)}/deactivate`);
}

/** UC-13. `reversible` is true for the Owner on ISSUE/REDEEM rows that were not reversed yet. */
export function listMerchantLedger(query: LedgerFilters = {}): Promise<Page<LedgerItem>> {
  return request<Page<LedgerItem>>(
    'GET',
    `/merchant/ledger${buildQuery({
      type: query.type,
      status: query.status,
      date_from: query.date_from,
      date_to: query.date_to,
      customer_code: query.customer_code,
      page: query.page,
    })}`,
  );
}

/** UC-14, Owner only. 201, then show MSG19 with the reversal id. Errors: MSG26, MSG25, MSG41, MSG22. */
export async function reverseTransaction(transactionId: string): Promise<TransactionObject> {
  const result = await request<ReverseResponse>(
    'POST',
    `/merchant/ledger/${encodeURIComponent(transactionId)}/reverse`,
  );
  return result.reversal;
}
