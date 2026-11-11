import type {
  AdminLedgerItem,
  ApiKeyItem,
  CustomerItem,
  LedgerItem,
  LoyaltyRules,
  StaffItem,
  TransactionObject,
} from './api-types';
import {
  CODE_ALPHABET,
  DATE_PATTERN,
  TX_STATUSES,
  TX_TYPES,
  businessDate,
  fail,
  ok,
  paginate,
  text,
  type MockUser,
} from './mock-http';
import { isValidPassword } from './password-policy';

// Mock of the merchant endpoints (api-spec B.4) for NEXT_PUBLIC_USE_MOCKS=true. Every rule the portal relies on
// is implemented the way the real API specifies it: merchant isolation (BR-01), roles (MSG04), the check order
// of issue and redeem, idempotency (BR-10), the limits (CR-02) and the reversal rules (BR-21). Data lives in memory.

export interface MerchantContext {
  user: MockUser;
  merchantCode: string;
  method: string;
  /** Path below /merchant, for example "/customers/CUS001/issue". */
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: Record<string, unknown>;
  users: MockUser[];
  /** All ledger rows of all merchants, newest first. New rows are added at the front. */
  transactions: AdminLedgerItem[];
}

const DEMO_MERCHANT = 'MCH-4F7K2Q';
const POINTS_MAX = 1_000_000;
const BALANCE_MAX = 1_000_000_000;
const AMOUNT_MAX = 1_000_000_000;
const MAX_KEYS = 5;
const ANCHOR_DELAY_MS = 6000;
const CODE_PATTERN = /^[A-Z0-9]{1,32}$/;
const PHONE_PATTERN = /^0[0-9]{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DIGEST_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// ---- per-merchant data ----
interface MerchantStore {
  customers: CustomerItem[];
  rules: LoyaltyRules | null;
  /** Newest first. */
  keys: ApiKeyItem[];
}

const NAMES = [
  'Nguyen Van An', 'Tran Thi Binh', 'Le Hoang Cuong', 'Pham Minh Duc', 'Vo Thi Em',
  'Dang Quoc Phong', 'Bui Thi Giang', 'Do Van Hai', 'Ngo Thi Huong', 'Duong Minh Khoa',
  'Ly Thi Lan', 'Huynh Van Minh', 'Phan Thi Nga', 'Truong Quang Nhat', 'Vu Thi Oanh',
  'Dinh Van Phuc', 'Hoang Thi Quyen', 'Mai Van Son', 'Cao Thi Thao', 'Luu Minh Tuan',
  'Ta Thi Uyen', 'Lam Van Vinh', 'Trinh Thi Xuan', 'Ha Van Yen', 'Kieu Thi Anh',
  'Doan Van Bao', 'Chu Thi Chi', 'Quach Van Dung', 'Tong Thi Hien', 'Nghiem Van Khanh',
];

function seedStore(code: string): MerchantStore {
  if (code !== DEMO_MERCHANT) return { customers: [], rules: null, keys: [] };
  const randomBalance = (i: number): number => 120 + ((i * 7919) % 4300);
  return {
    customers: NAMES.map((name, i) => ({
      id: `00000000-0000-4000-8000-${String(5000 + i).padStart(12, '0')}`,
      customer_code: `CUS${String(i + 1).padStart(3, '0')}`,
      name,
      phone: i % 6 === 5 ? null : `0912${String(300000 + i * 137).padStart(6, '0')}`,
      // CUS003 has a tiny balance: reversing one of its ISSUE rows shows MSG25.
      balance: i === 2 ? 10 : randomBalance(i),
      is_active: i !== 11 && i !== 24,
    })),
    rules: { earn_ratio: 10000, min_redemption_threshold: 50 },
    keys: [
      { id: '00000000-0000-4000-8000-000000007003', masked_key_id: 'oct_9c1e...41ba', status: 'REVOKED', created_at: '2026-09-20T04:00:00.000Z' },
      { id: '00000000-0000-4000-8000-000000007002', masked_key_id: 'oct_3f9a...c01d', status: 'ACTIVE', created_at: '2026-09-12T08:30:00.000Z' },
      { id: '00000000-0000-4000-8000-000000007001', masked_key_id: 'oct_77d0...a95e', status: 'ACTIVE', created_at: '2026-09-03T02:10:00.000Z' },
    ],
  };
}

const stores = new Map<string, MerchantStore>();

function storeFor(code: string): MerchantStore {
  let store = stores.get(code);
  if (!store) {
    store = seedStore(code);
    stores.set(code, store);
  }
  return store;
}

// ---- small helpers ----
function randomChars(alphabet: string, length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function randomHex(bytes: number): string {
  const data = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(data);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomBase64Url(bytes: number): string {
  const data = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(data);
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `00000000-0000-4000-8000-${String(9000 + idCounter).padStart(12, '0')}`;
}

function isPositiveInt(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max;
}

function ownerOnly(ctx: MerchantContext, run: () => Response): Response {
  return ctx.user.role === 'MERCHANT_OWNER' ? run() : fail('MSG04');
}

function toTransactionObject(row: AdminLedgerItem): TransactionObject {
  return {
    transaction_id: row.transaction_id,
    type: row.type,
    customer_code: row.customer_code,
    points: row.points,
    balance_after: row.balance_after,
    status: row.status,
    sui_digest: row.sui_digest,
    explorer_url: row.explorer_url,
    reverses_transaction_id: row.reverses_transaction_id,
    created_at: row.created_at,
  };
}

function toLedgerItem(row: AdminLedgerItem, reversible: boolean): LedgerItem {
  return {
    ...toTransactionObject(row),
    bill_amount: row.bill_amount,
    performed_by: row.performed_by,
    reversible,
  };
}

/** After a few seconds a new row becomes ANCHORED, so the status label can be seen changing. */
function scheduleAnchoring(row: AdminLedgerItem): void {
  if (process.env.NODE_ENV === 'test') return;
  setTimeout(() => {
    if (row.status !== 'PENDING_ANCHOR') return;
    const digest = randomChars(DIGEST_ALPHABET, 44);
    row.status = 'ANCHORED';
    row.sui_digest = digest;
    row.explorer_url = `https://suiscan.xyz/testnet/tx/${digest}`;
  }, ANCHOR_DELAY_MS);
}

function recordTransaction(
  ctx: MerchantContext,
  customer: CustomerItem,
  type: AdminLedgerItem['type'],
  points: number,
  billAmount: number | null,
  reverses: string | null,
): AdminLedgerItem {
  const createdAt = new Date().toISOString();
  const day = createdAt.slice(0, 10).replace(/-/g, '');
  let transactionId = '';
  do {
    transactionId = `TXN-${day}-${randomChars(CODE_ALPHABET, 8)}`;
  } while (ctx.transactions.some((row) => row.transaction_id === transactionId));

  const row: AdminLedgerItem = {
    transaction_id: transactionId,
    type,
    customer_code: customer.customer_code,
    points,
    balance_after: customer.balance,
    status: 'PENDING_ANCHOR',
    sui_digest: null,
    explorer_url: null,
    reverses_transaction_id: reverses,
    created_at: createdAt,
    bill_amount: billAmount,
    performed_by: { kind: 'USER', label: ctx.user.full_name },
    merchant_code: ctx.merchantCode,
  };
  ctx.transactions.unshift(row);
  scheduleAnchoring(row);
  return row;
}

// ---- idempotency (BR-10) ----
interface SavedAnswer {
  fingerprint: string;
  body: TransactionObject;
}
const saved = new Map<string, SavedAnswer>();

/** One user, one key: a repeated key with the same request returns the saved answer; with another request it is MSG34. */
function withIdempotency(
  ctx: MerchantContext,
  fingerprint: string,
  run: () => TransactionObject | Response,
): Response {
  const key = ctx.headers.get('X-Idempotency-Key');
  if (!key) return fail('MSG33'); // the header is required on issue and redeem
  const slot = `${ctx.user.id}:${key}`;
  const previous = saved.get(slot);
  if (previous) return previous.fingerprint === fingerprint ? ok(previous.body, 201) : fail('MSG34');
  const result = run();
  if (result instanceof Response) return result; // errors are not saved: the user can fix the input and retry
  saved.set(slot, { fingerprint, body: result });
  return ok(result, 201);
}

// ---- customers ----
function findCustomer(store: MerchantStore, code: string): CustomerItem | undefined {
  return store.customers.find((customer) => customer.customer_code === code);
}

function listCustomers(ctx: MerchantContext, store: MerchantStore): Response {
  const q = (ctx.query.get('q') ?? '').trim();
  if (q.length > 100) return fail('MSG33');
  const needle = q.toLowerCase();
  const filtered = store.customers
    .filter(
      (customer) =>
        needle === '' ||
        customer.customer_code.toLowerCase().includes(needle) ||
        customer.name.toLowerCase().includes(needle) ||
        (customer.phone ?? '').includes(needle),
    )
    .sort((a, b) => a.customer_code.localeCompare(b.customer_code));
  const page = paginate(filtered, ctx.query.get('page'));
  return page ? ok(page) : fail('MSG33');
}

/** Returns an error answer, or the cleaned phone (`null` = no phone). */
function cleanPhone(value: unknown): string | null | Response {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return fail('MSG33');
  const phone = value.trim();
  if (phone === '') return null;
  return PHONE_PATTERN.test(phone) ? phone : fail('MSG33');
}

function createCustomer(ctx: MerchantContext, store: MerchantStore): Response {
  const code = text(ctx.body.customer_code);
  const name = text(ctx.body.name);
  if (!code || !name) return fail('MSG01');
  if (!CODE_PATTERN.test(code) || name.length > 200) return fail('MSG33');
  const phone = cleanPhone(ctx.body.phone);
  if (phone instanceof Response) return phone;
  if (findCustomer(store, code)) return fail('MSG27');
  if (phone !== null && store.customers.some((customer) => customer.phone === phone)) return fail('MSG38');

  const customer: CustomerItem = { id: nextId(), customer_code: code, name, phone, balance: 0, is_active: true };
  store.customers.push(customer);
  return ok(customer, 201);
}

function updateCustomer(ctx: MerchantContext, store: MerchantStore, code: string): Response {
  const hasName = 'name' in ctx.body;
  const hasPhone = 'phone' in ctx.body;
  if (!hasName && !hasPhone) return fail('MSG33');
  const customer = findCustomer(store, code);
  if (!customer) return fail('MSG22');

  let name = customer.name;
  if (hasName) {
    name = text(ctx.body.name);
    if (name === '' || name.length > 200) return fail('MSG33');
  }
  let phone = customer.phone;
  if (hasPhone) {
    const cleaned = cleanPhone(ctx.body.phone);
    if (cleaned instanceof Response) return cleaned;
    if (cleaned !== null && store.customers.some((other) => other !== customer && other.phone === cleaned)) {
      return fail('MSG38');
    }
    phone = cleaned;
  }
  customer.name = name;
  customer.phone = phone;
  return ok(customer);
}

function setActive(store: MerchantStore, code: string, active: boolean): Response {
  const customer = findCustomer(store, code);
  if (!customer) return fail('MSG22');
  customer.is_active = active;
  return ok(customer);
}

function issuePoints(ctx: MerchantContext, store: MerchantStore, code: string): Response {
  return withIdempotency(ctx, `issue:${code}:${JSON.stringify(ctx.body)}`, () => {
    const amount = ctx.body.amount;
    if (!isPositiveInt(amount, AMOUNT_MAX)) return fail('MSG33');
    const customer = findCustomer(store, code);
    if (!customer) return fail('MSG22');
    if (!customer.is_active) return fail('MSG39');
    if (!store.rules) return fail('MSG32');
    const points = Math.floor(amount / store.rules.earn_ratio); // BR-17: the remainder is lost
    if (points < 1) return fail('MSG24');
    if (points > POINTS_MAX || customer.balance + points > BALANCE_MAX) return fail('MSG33');

    customer.balance += points;
    return toTransactionObject(recordTransaction(ctx, customer, 'ISSUE', points, amount, null));
  });
}

function redeemPoints(ctx: MerchantContext, store: MerchantStore, code: string): Response {
  return withIdempotency(ctx, `redeem:${code}:${JSON.stringify(ctx.body)}`, () => {
    const points = ctx.body.points;
    if (!isPositiveInt(points, POINTS_MAX)) return fail('MSG33');
    const customer = findCustomer(store, code);
    if (!customer) return fail('MSG22');
    if (!customer.is_active) return fail('MSG39');
    if (!store.rules) return fail('MSG32');
    if (points < store.rules.min_redemption_threshold) {
      return fail('MSG09', undefined, { min_points: store.rules.min_redemption_threshold }); // checked before the balance
    }
    if (customer.balance < points) return fail('MSG08');

    customer.balance -= points;
    return toTransactionObject(recordTransaction(ctx, customer, 'REDEEM', points, null, null));
  });
}

// ---- rules ----
function saveRules(ctx: MerchantContext, store: MerchantStore): Response {
  const { earn_ratio: earn, min_redemption_threshold: min } = ctx.body;
  if (!isPositiveInt(earn, POINTS_MAX) || !isPositiveInt(min, POINTS_MAX)) return fail('MSG33'); // real JSON integers only
  store.rules = { earn_ratio: earn, min_redemption_threshold: min };
  return ok(store.rules); // applies to later transactions only (BR-22)
}

// ---- API keys ----
function createApiKey(store: MerchantStore): Response {
  const open = store.keys.filter((key) => key.status !== 'REVOKED').length;
  if (open >= MAX_KEYS) return fail('MSG40');
  const keyId = `oct_${randomHex(16)}`;
  const id = nextId();
  store.keys.unshift({
    id,
    masked_key_id: `${keyId.slice(0, 8)}...${keyId.slice(-4)}`,
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
  });
  return ok({ id, key_id: keyId, secret: randomBase64Url(32) }, 201); // the only time the secret is sent
}

function revokeApiKey(store: MerchantStore, id: string): Response {
  const key = store.keys.find((candidate) => candidate.id === id);
  if (!key) return fail('MSG33');
  key.status = 'REVOKED';
  return ok(key);
}

// ---- staff ----
function staffOf(ctx: MerchantContext): MockUser[] {
  return ctx.users
    .filter((candidate) => candidate.role === 'MERCHANT_STAFF' && candidate.merchantCode === ctx.merchantCode)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function toStaffItem(user: MockUser): StaffItem {
  return { id: user.id, full_name: user.full_name, email: user.email, is_active: user.active, created_at: user.created_at };
}

function createStaff(ctx: MerchantContext): Response {
  const fullName = text(ctx.body.full_name);
  const email = text(ctx.body.email).toLowerCase();
  const password = typeof ctx.body.initial_password === 'string' ? ctx.body.initial_password : '';
  if (!fullName || !email || !password) return fail('MSG01');
  if (fullName.length > 200 || email.length > 254 || !EMAIL_PATTERN.test(email)) return fail('MSG33');
  if (ctx.users.some((candidate) => candidate.email === email)) return fail('MSG31');
  if (!isValidPassword(password, email)) return fail('MSG37');

  const user: MockUser = {
    id: nextId(),
    full_name: fullName,
    email,
    role: 'MERCHANT_STAFF',
    password,
    merchantCode: ctx.merchantCode,
    active: true,
    created_at: new Date().toISOString(),
  };
  ctx.users.push(user);
  return ok(toStaffItem(user), 201);
}

function deactivateStaff(ctx: MerchantContext, id: string): Response {
  const user = staffOf(ctx).find((candidate) => candidate.id === id);
  if (!user) return fail('MSG33');
  user.active = false; // cannot sign in any more; there is no reactivation
  return ok(toStaffItem(user));
}

// ---- dashboard and ledger ----
function dashboard(ctx: MerchantContext, store: MerchantStore): Response {
  const today = businessDate(new Date().toISOString());
  return ok({
    total_customers: store.customers.length,
    circulating_points: store.customers.reduce((sum, customer) => sum + customer.balance, 0),
    today_transactions: ctx.transactions.filter(
      (row) => row.merchant_code === ctx.merchantCode && businessDate(row.created_at) === today,
    ).length,
  });
}

function reversedIds(ctx: MerchantContext): Set<string> {
  const ids = new Set<string>();
  for (const row of ctx.transactions) {
    if (row.merchant_code === ctx.merchantCode && row.reverses_transaction_id) ids.add(row.reverses_transaction_id);
  }
  return ids;
}

function listLedger(ctx: MerchantContext): Response {
  const type = ctx.query.get('type');
  const status = ctx.query.get('status');
  const dateFrom = ctx.query.get('date_from');
  const dateTo = ctx.query.get('date_to');
  const customer = ctx.query.get('customer_code');
  if (type && !TX_TYPES.includes(type)) return fail('MSG33');
  if (status && !TX_STATUSES.includes(status)) return fail('MSG33');
  if (dateFrom && !DATE_PATTERN.test(dateFrom)) return fail('MSG33');
  if (dateTo && !DATE_PATTERN.test(dateTo)) return fail('MSG33');

  const owner = ctx.user.role === 'MERCHANT_OWNER';
  const reversed = reversedIds(ctx);
  const filtered = ctx.transactions.filter(
    (row) =>
      row.merchant_code === ctx.merchantCode && // BR-01: only the own merchant, taken from the session
      (!type || row.type === type) &&
      (!status || row.status === status) &&
      (!customer || row.customer_code === customer) &&
      (!dateFrom || businessDate(row.created_at) >= dateFrom) &&
      (!dateTo || businessDate(row.created_at) <= dateTo),
  );
  const page = paginate(filtered, ctx.query.get('page'));
  if (!page) return fail('MSG33');
  return ok({
    ...page,
    items: page.items.map((row) =>
      toLedgerItem(row, owner && row.type !== 'REVERSAL' && !reversed.has(row.transaction_id)),
    ),
  });
}

function reverseTransaction(ctx: MerchantContext, store: MerchantStore, transactionId: string): Response {
  const original = ctx.transactions.find(
    (row) => row.transaction_id === transactionId && row.merchant_code === ctx.merchantCode,
  );
  if (!original) return fail('MSG22');
  if (original.type === 'REVERSAL' || reversedIds(ctx).has(original.transaction_id)) return fail('MSG26');
  const customer = findCustomer(store, original.customer_code);
  if (!customer) return fail('MSG22');

  // An inactive customer does not block a reversal.
  if (original.type === 'ISSUE') {
    if (customer.balance - original.points < 0) return fail('MSG25');
    customer.balance -= original.points;
  } else {
    if (customer.balance + original.points > BALANCE_MAX) return fail('MSG41');
    customer.balance += original.points;
  }
  const row = recordTransaction(ctx, customer, 'REVERSAL', original.points, null, original.transaction_id);
  return ok({ reversal: toTransactionObject(row) }, 201);
}

// ---- router ----
export function handleMerchant(ctx: MerchantContext): Response {
  const { method, path } = ctx;
  const store = storeFor(ctx.merchantCode);

  if (method === 'GET' && path === '/dashboard') return ownerOnly(ctx, () => dashboard(ctx, store));

  if (method === 'GET' && path === '/rules') return ownerOnly(ctx, () => ok(store.rules ?? {}));
  if (method === 'PUT' && path === '/rules') return ownerOnly(ctx, () => saveRules(ctx, store));

  if (method === 'GET' && path === '/api-keys') {
    return ownerOnly(ctx, () => {
      const page = paginate(store.keys, ctx.query.get('page'));
      return page ? ok(page) : fail('MSG33');
    });
  }
  if (method === 'POST' && path === '/api-keys') return ownerOnly(ctx, () => createApiKey(store));
  const revoke = /^\/api-keys\/([^/]+)\/revoke$/.exec(path);
  if (method === 'POST' && revoke) {
    return ownerOnly(ctx, () => revokeApiKey(store, decodeURIComponent(revoke[1] ?? '')));
  }

  if (method === 'GET' && path === '/staff') {
    return ownerOnly(ctx, () => {
      const page = paginate(staffOf(ctx).map(toStaffItem), ctx.query.get('page'));
      return page ? ok(page) : fail('MSG33');
    });
  }
  if (method === 'POST' && path === '/staff') return ownerOnly(ctx, () => createStaff(ctx));
  const deactivate = /^\/staff\/([^/]+)\/deactivate$/.exec(path);
  if (method === 'POST' && deactivate) {
    return ownerOnly(ctx, () => deactivateStaff(ctx, decodeURIComponent(deactivate[1] ?? '')));
  }

  if (method === 'GET' && path === '/customers') return listCustomers(ctx, store);
  if (method === 'POST' && path === '/customers') return createCustomer(ctx, store);
  const customer = /^\/customers\/([^/]+)(?:\/(issue|redeem|deactivate|reactivate))?$/.exec(path);
  if (customer) {
    const code = decodeURIComponent(customer[1] ?? '');
    const action = customer[2];
    if (method === 'PATCH' && action === undefined) return updateCustomer(ctx, store, code);
    if (method === 'POST' && action === 'issue') return issuePoints(ctx, store, code);
    if (method === 'POST' && action === 'redeem') return redeemPoints(ctx, store, code);
    if (method === 'POST' && action === 'deactivate') return ownerOnly(ctx, () => setActive(store, code, false));
    if (method === 'POST' && action === 'reactivate') return ownerOnly(ctx, () => setActive(store, code, true));
  }

  if (method === 'GET' && path === '/ledger') return listLedger(ctx);
  const reverse = /^\/ledger\/([^/]+)\/reverse$/.exec(path);
  if (method === 'POST' && reverse) {
    return ownerOnly(ctx, () => reverseTransaction(ctx, store, decodeURIComponent(reverse[1] ?? '')));
  }

  return fail('MSG33', 404); // unknown route (api-spec section 0)
}
