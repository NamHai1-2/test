// Types that MIRROR docs/api-spec.md (snake_case JSON exactly as the API sends it).
// They are written by hand on purpose: the web app is deployed on its own and must not import from apps/api.
// When api-spec.md changes, change this file in the same pull request.

export type Role = 'ADMIN' | 'MERCHANT_OWNER' | 'MERCHANT_STAFF';
export type MerchantStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
export type TxType = 'ISSUE' | 'REDEEM' | 'REVERSAL';
export type TxStatus = 'PENDING_ANCHOR' | 'ANCHORED' | 'FAILED';

/** Error body of every non-2xx answer (CR-06). `server_time` (Unix seconds) only comes with MSG17. */
export interface ErrorBody {
  code: string;
  message: string;
  server_time?: number;
}

/** Paginated list, fixed page size 20 (api-spec section 0). */
export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

// ---- B.2 authentication and account ----
export interface RegisterRequest {
  business_name: string;
  owner_name: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SessionUser {
  id: string;
  full_name: string;
  email: string;
  role: Role;
}

export interface LoginResponse {
  user: SessionUser;
  /** `/admin` for Admin, `/dashboard` for Owner, `/customers` for Staff. */
  redirect: string;
}

export interface MeResponse {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  merchant: { code: string; name: string; status: MerchantStatus } | null;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

// ---- B.3 admin ----
export interface AdminDashboard {
  merchants: { total: number; pending: number; active: number; suspended: number };
  total_customers: number;
  points_issued: number;
  points_redeemed: number;
}

export interface AdminMerchantItem {
  id: string;
  code: string;
  name: string;
  owner_email: string;
  status: MerchantStatus;
  created_at: string;
}

export interface AdminMerchantsQuery {
  status?: MerchantStatus;
  page?: number;
}

// ---- transactions and ledger ----
/** "Transaction object" of api-spec section 0. */
export interface TransactionObject {
  transaction_id: string;
  type: TxType;
  customer_code: string;
  points: number;
  balance_after: number;
  status: TxStatus;
  sui_digest: string | null;
  /** Only for ANCHORED transactions, built by the server from SUI_EXPLORER_TX_URL. */
  explorer_url: string | null;
  reverses_transaction_id: string | null;
  created_at: string;
}

export interface PerformedBy {
  kind: 'USER' | 'API_KEY';
  label: string;
}

/** Item of GET /merchant/ledger (B.4). `reversible` is computed for the Owner only. */
export interface LedgerItem extends TransactionObject {
  bill_amount: number | null;
  performed_by: PerformedBy;
  reversible: boolean;
}

/** Item of GET /admin/ledger (B.3): the merchant ledger item plus `merchant_code`. */
export interface AdminLedgerItem extends Omit<LedgerItem, 'reversible'> {
  merchant_code: string;
  reversible?: boolean;
}

export interface LedgerFilters {
  type?: TxType;
  status?: TxStatus;
  /** YYYY-MM-DD, UTC+7, inclusive. */
  date_from?: string;
  date_to?: string;
  customer_code?: string;
  page?: number;
}

export interface AdminLedgerQuery extends LedgerFilters {
  merchant_code?: string;
}

// ---- B.4 merchant ----
export interface MerchantDashboard {
  total_customers: number;
  circulating_points: number;
  today_transactions: number;
}

export interface LoyaltyRules {
  earn_ratio: number;
  min_redemption_threshold: number;
}

export interface CustomerItem {
  id: string;
  customer_code: string;
  name: string;
  phone: string | null;
  balance: number;
  is_active: boolean;
}

export interface CreateCustomerRequest {
  customer_code: string;
  name: string;
  phone?: string | null;
}

export interface UpdateCustomerRequest {
  name?: string;
  phone?: string | null;
}

export type ApiKeyStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export interface ApiKeyItem {
  id: string;
  /** First 8 and last 4 characters of the key id ("oct_3f9a...c01d"). */
  masked_key_id: string;
  status: ApiKeyStatus;
  created_at: string;
}

/** Answer of POST /merchant/api-keys. The secret exists only in this answer (CR-07). */
export interface CreatedApiKey {
  id: string;
  key_id: string;
  secret: string;
}

export interface StaffItem {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

export interface CreateStaffRequest {
  full_name: string;
  email: string;
  initial_password: string;
}

export interface ReverseResponse {
  reversal: TransactionObject;
}
