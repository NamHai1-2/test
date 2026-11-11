import { DEMO_PASSWORD } from './mock-accounts';
import { handleMerchant } from './mocks-merchant';
import { MESSAGES } from './messages';
import {
  CODE_ALPHABET,
  DATE_PATTERN,
  TX_STATUSES,
  TX_TYPES,
  businessDate,
  empty,
  fail,
  ok,
  paginate,
  text,
  type MockUser,
} from './mock-http';
import { homeFor } from './navigation';
import { isValidPassword } from './password-policy';
import type {
  AdminDashboard,
  AdminLedgerItem,
  AdminMerchantItem,
  MeResponse,
  MerchantStatus,
  TxStatus,
  TxType,
} from './api-types';

// In-memory stand-in for the backend, used when NEXT_PUBLIC_USE_MOCKS=true (docs/config-and-deploy.md).
// It sits BEHIND the real api-client (same URLs, same headers, same CR-06 error bodies), so the screens,
// the CSRF header and the MSG35 redirect behave exactly as against the real API. Data lives in memory:
// reload the page and approvals/suspensions are reset (the login survives in sessionStorage).
// Only the endpoints of tasks T13a (auth, admin) and T13b (merchant screens, see mocks-merchant.ts) exist here;
// anything else answers like an unknown route.

const API_PREFIX = '/api/v1';
const LATENCY_MS = process.env.NODE_ENV === 'test' ? 0 : 250; // no delay inside automated tests
const SESSION_KEY = 'octapoint.mock.session';
// ---- fixtures ----
function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

const users: MockUser[] = [
  { id: uuid(901), full_name: 'Platform Admin', email: 'admin@octapoint.test', role: 'ADMIN', password: DEMO_PASSWORD, merchantCode: null, active: true, created_at: '2026-09-01T00:00:00.000Z' },
  { id: uuid(902), full_name: 'Linh Tran', email: 'owner@octapoint.test', role: 'MERCHANT_OWNER', password: DEMO_PASSWORD, merchantCode: 'MCH-4F7K2Q', active: true, created_at: '2026-09-02T03:20:00.000Z' },
  { id: uuid(903), full_name: 'Minh Pham', email: 'staff@octapoint.test', role: 'MERCHANT_STAFF', password: DEMO_PASSWORD, merchantCode: 'MCH-4F7K2Q', active: true, created_at: '2026-09-02T03:20:00.000Z' },
  { id: uuid(904), full_name: 'Hoa Nguyen', email: 'pending@octapoint.test', role: 'MERCHANT_OWNER', password: DEMO_PASSWORD, merchantCode: 'MCH-9P3M8D', active: true, created_at: '2026-09-02T03:20:00.000Z' },
];

const merchants: AdminMerchantItem[] = [
  { id: uuid(1), code: 'MCH-4F7K2Q', name: 'Highland Coffee', owner_email: 'owner@octapoint.test', status: 'ACTIVE', created_at: '2026-09-02T03:14:00.000Z' },
  { id: uuid(2), code: 'MCH-9P3M8D', name: 'Sunrise Bakery', owner_email: 'pending@octapoint.test', status: 'PENDING', created_at: '2026-11-05T08:40:00.000Z' },
  { id: uuid(3), code: 'MCH-7H2N5R', name: 'Saigon Books', owner_email: 'hello@saigonbooks.test', status: 'ACTIVE', created_at: '2026-09-11T02:05:00.000Z' },
  { id: uuid(4), code: 'MCH-2K8W4T', name: 'Lotus Spa', owner_email: 'contact@lotusspa.test', status: 'SUSPENDED', created_at: '2026-09-19T09:30:00.000Z' },
  { id: uuid(5), code: 'MCH-6B9X3C', name: 'Green Garden', owner_email: 'owner@greengarden.test', status: 'ACTIVE', created_at: '2026-09-24T04:20:00.000Z' },
  { id: uuid(6), code: 'MCH-3D5V7J', name: 'Pho Corner', owner_email: 'admin@phocorner.test', status: 'PENDING', created_at: '2026-11-06T10:10:00.000Z' },
  { id: uuid(7), code: 'MCH-8Q4Z6L', name: 'Urban Fitness', owner_email: 'team@urbanfitness.test', status: 'ACTIVE', created_at: '2026-10-01T01:45:00.000Z' },
  { id: uuid(8), code: 'MCH-5M1Y9F', name: 'Blue Wave Tea', owner_email: 'hi@bluewave.test', status: 'SUSPENDED', created_at: '2026-10-03T06:00:00.000Z' },
  { id: uuid(9), code: 'MCH-1R6T2G', name: 'Pixel Games', owner_email: 'shop@pixelgames.test', status: 'ACTIVE', created_at: '2026-10-08T07:25:00.000Z' },
];

// More merchants so the list has a second page.
const EXTRA_NAMES = [
  'Orchid Florist', 'Night Market Grill', 'Riverside Hotel', 'Zen Yoga Studio', 'Coco Smoothies',
  'Tech Haven', 'Paper Crane Stationery', 'Little Italy Pizza', 'Sky Bar 88', 'Mekong Seafood',
  'Handmade Soap Co', 'City Cinema', 'Banh Mi 24', 'Velvet Salon', 'Old Town Pharmacy',
  'Kids Planet', 'Moonlight Karaoke', 'Fresh Mart',
];
const STATUS_CYCLE: readonly MerchantStatus[] = ['ACTIVE', 'ACTIVE', 'PENDING', 'ACTIVE', 'SUSPENDED'];

EXTRA_NAMES.forEach((name, index) => {
  const code = `MCH-${[0, 1, 2, 3, 4, 5]
    .map((i) => CODE_ALPHABET[(index * 7 + i * 5 + 3) % CODE_ALPHABET.length])
    .join('')}`;
  const day = String((index % 27) + 1).padStart(2, '0');
  merchants.push({
    id: uuid(100 + index),
    code,
    name,
    owner_email: `owner${index + 1}@example.test`,
    status: STATUS_CYCLE[index % STATUS_CYCLE.length] ?? 'ACTIVE',
    created_at: `2026-10-${day}T05:00:00.000Z`,
  });
});

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function buildTransactions(): AdminLedgerItem[] {
  const random = createRandom(20261108);
  const randomInt = (max: number): number => Math.floor(random() * max);
  const randomText = (alphabet: string, length: number): string =>
    Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join('');
  const DIGEST_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  const merchantCodes = ['MCH-4F7K2Q', 'MCH-7H2N5R', 'MCH-6B9X3C', 'MCH-8Q4Z6L', 'MCH-1R6T2G'];
  const userNames = ['Linh Tran', 'Minh Pham', 'Hoa Nguyen'];
  const COUNT = 60;
  const start = Date.parse('2026-11-08T07:30:00.000Z') - COUNT * 41 * 60 * 1000;

  const rows: AdminLedgerItem[] = [];
  const usedIds = new Set<string>();
  const reversible: AdminLedgerItem[] = []; // ISSUE / REDEEM rows that have no reversal yet

  for (let k = 0; k < COUNT; k += 1) {
    const createdMs = start + k * 41 * 60 * 1000 + randomInt(20) * 60 * 1000;
    const createdAt = new Date(createdMs).toISOString();
    const day = createdAt.slice(0, 10).replace(/-/g, '');
    let transactionId = '';
    do {
      transactionId = `TXN-${day}-${randomText(CODE_ALPHABET, 8)}`;
    } while (usedIds.has(transactionId));
    usedIds.add(transactionId);

    const roll = random();
    let type: TxType = roll < 0.62 ? 'ISSUE' : 'REDEEM';
    let original: AdminLedgerItem | undefined;
    if (roll > 0.9 && reversible.length > 0) {
      type = 'REVERSAL';
      original = reversible.splice(randomInt(reversible.length), 1)[0];
    }

    const merchantCode = original?.merchant_code ?? merchantCodes[randomInt(merchantCodes.length)] ?? 'MCH-4F7K2Q';
    const customerCode = original?.customer_code ?? `CUS${String(1 + randomInt(30)).padStart(3, '0')}`;
    const billAmount = type === 'ISSUE' ? (20 + randomInt(480)) * 1000 : null;
    const points =
      type === 'ISSUE'
        ? Math.max(1, Math.floor((billAmount ?? 0) / 10000))
        : type === 'REDEEM'
          ? 50 + randomInt(45) * 10
          : (original?.points ?? 50);

    let status: TxStatus = 'ANCHORED';
    if (k >= COUNT - 3) status = 'PENDING_ANCHOR';
    else if (k % 23 === 7) status = 'FAILED';
    const digest = status === 'ANCHORED' ? randomText(DIGEST_ALPHABET, 44) : null;

    const row: AdminLedgerItem = {
      transaction_id: transactionId,
      type,
      customer_code: customerCode,
      points,
      balance_after: 100 + randomInt(4000),
      status,
      sui_digest: digest,
      explorer_url: digest ? `https://suiscan.xyz/testnet/tx/${digest}` : null,
      reverses_transaction_id: original?.transaction_id ?? null,
      created_at: createdAt,
      bill_amount: billAmount,
      performed_by:
        random() < 0.6
          ? { kind: 'USER', label: userNames[randomInt(userNames.length)] ?? 'Linh Tran' }
          : {
              kind: 'API_KEY',
              label: `oct_${randomText(CODE_ALPHABET, 4).toLowerCase()}…${randomText(CODE_ALPHABET, 4).toLowerCase()}`,
            },
      merchant_code: merchantCode,
    };
    rows.push(row);
    if (type !== 'REVERSAL') reversible.push(row);
  }
  return rows.reverse(); // newest first, like the API
}

const transactions = buildTransactions();

// ---- session (a mock flag only, never a token) ----
let memorySession: string | null = null;

function readSession(): string | null {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage.getItem(SESSION_KEY);
  } catch {
    // storage blocked: fall back to memory
  }
  return memorySession;
}

function writeSession(email: string | null): void {
  memorySession = email;
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (email === null) sessionStorage.removeItem(SESSION_KEY);
    else sessionStorage.setItem(SESSION_KEY, email);
  } catch {
    // storage blocked: memory only
  }
}

function currentUser(): MockUser | undefined {
  const email = readSession();
  return email === null ? undefined : users.find((user) => user.email === email);
}

function merchantOf(user: MockUser): AdminMerchantItem | undefined {
  return merchants.find((merchant) => merchant.code === user.merchantCode);
}

// ---- endpoints ----
function login(body: Record<string, unknown>): Response {
  const email = text(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return fail('MSG01');
  const user = users.find((candidate) => candidate.email === email && candidate.password === password);
  if (!user || !user.active) return fail('MSG02'); // a deactivated user gets the same answer as a wrong password
  const merchant = merchantOf(user);
  if (merchant && merchant.status !== 'ACTIVE') return fail('MSG15');
  writeSession(user.email);
  return ok({
    user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role },
    redirect: homeFor(user.role),
  });
}

function register(body: Record<string, unknown>): Response {
  const businessName = text(body.business_name);
  const ownerName = text(body.owner_name);
  const email = text(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!businessName || !ownerName || !email || !password) return fail('MSG01');
  if (!isValidPassword(password, email)) return fail('MSG37');
  if (users.some((user) => user.email === email)) return fail('MSG31');

  const code = `MCH-${Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')}`;
  merchants.unshift({
    id: uuid(1000 + merchants.length),
    code,
    name: businessName,
    owner_email: email,
    status: 'PENDING',
    created_at: new Date().toISOString(),
  });
  users.push({
    id: uuid(2000 + users.length),
    full_name: ownerName,
    email,
    role: 'MERCHANT_OWNER',
    password,
    merchantCode: code,
    active: true,
    created_at: new Date().toISOString(),
  });
  return ok({}, 201);
}

function me(user: MockUser): MeResponse {
  const merchant = merchantOf(user);
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    merchant: merchant ? { code: merchant.code, name: merchant.name, status: merchant.status } : null,
  };
}

function changePassword(user: MockUser, body: Record<string, unknown>): Response {
  const current = typeof body.current_password === 'string' ? body.current_password : '';
  const next = typeof body.new_password === 'string' ? body.new_password : '';
  if (!current || !next) return fail('MSG01');
  if (current !== user.password) return fail('MSG36');
  if (next === current || !isValidPassword(next, user.email)) return fail('MSG37');
  user.password = next;
  return ok({});
}

function dashboard(): AdminDashboard {
  const byId = new Map(transactions.map((row) => [row.transaction_id, row]));
  let issued = 184_250; // earlier history, so the numbers look like a running platform
  let redeemed = 96_400;
  for (const row of transactions) {
    if (row.type === 'ISSUE') issued += row.points;
    else if (row.type === 'REDEEM') redeemed += row.points;
    else {
      const original = row.reverses_transaction_id ? byId.get(row.reverses_transaction_id) : undefined;
      if (original?.type === 'ISSUE') issued -= row.points;
      else if (original?.type === 'REDEEM') redeemed -= row.points;
    }
  }
  const count = (status: MerchantStatus): number =>
    merchants.filter((merchant) => merchant.status === status).length;
  return {
    merchants: {
      total: merchants.length,
      pending: count('PENDING'),
      active: count('ACTIVE'),
      suspended: count('SUSPENDED'),
    },
    total_customers: 1284,
    points_issued: issued,
    points_redeemed: redeemed,
  };
}

const MERCHANT_STATUSES: readonly string[] = ['PENDING', 'ACTIVE', 'SUSPENDED'];
function listMerchants(query: URLSearchParams): Response {
  const status = query.get('status');
  if (status !== null && status !== '' && !MERCHANT_STATUSES.includes(status)) return fail('MSG33');
  const filtered = merchants
    .filter((merchant) => !status || merchant.status === status)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const page = paginate(filtered, query.get('page'));
  return page ? ok(page) : fail('MSG33');
}

function changeMerchantStatus(id: string, action: 'approve' | 'suspend'): Response {
  const merchant = merchants.find((candidate) => candidate.id === id);
  if (!merchant) return fail('MSG33', 404);
  if (action === 'approve') {
    if (merchant.status === 'ACTIVE') return fail('MSG33'); // allowed from PENDING or SUSPENDED only
    merchant.status = 'ACTIVE';
    return ok({ code: 'MSG13', message: MESSAGES.MSG13 });
  }
  if (merchant.status !== 'ACTIVE') return fail('MSG33'); // allowed from ACTIVE only
  merchant.status = 'SUSPENDED';
  return ok({ code: 'MSG14', message: MESSAGES.MSG14 });
}

function listLedger(query: URLSearchParams): Response {
  const type = query.get('type');
  const status = query.get('status');
  const dateFrom = query.get('date_from');
  const dateTo = query.get('date_to');
  const customer = query.get('customer_code');
  const merchant = query.get('merchant_code');
  if (type && !TX_TYPES.includes(type)) return fail('MSG33');
  if (status && !TX_STATUSES.includes(status)) return fail('MSG33');
  if (dateFrom && !DATE_PATTERN.test(dateFrom)) return fail('MSG33');
  if (dateTo && !DATE_PATTERN.test(dateTo)) return fail('MSG33');

  const filtered = transactions.filter(
    (row) =>
      (!type || row.type === type) &&
      (!status || row.status === status) &&
      (!customer || row.customer_code === customer) &&
      (!merchant || row.merchant_code === merchant) &&
      (!dateFrom || businessDate(row.created_at) >= dateFrom) &&
      (!dateTo || businessDate(row.created_at) <= dateTo),
  );
  const page = paginate(filtered, query.get('page'));
  return page ? ok(page) : fail('MSG33');
}

function admin(method: string, path: string, query: URLSearchParams): Response {
  if (method === 'GET' && path === '/admin/dashboard') return ok(dashboard());
  if (method === 'GET' && path === '/admin/merchants') return listMerchants(query);
  if (method === 'GET' && path === '/admin/ledger') return listLedger(query);
  const change = /^\/admin\/merchants\/([^/]+)\/(approve|suspend)$/.exec(path);
  if (method === 'POST' && change) {
    return changeMerchantStatus(decodeURIComponent(change[1] ?? ''), change[2] === 'approve' ? 'approve' : 'suspend');
  }
  return fail('MSG33', 404);
}

function handle(url: string, init: RequestInit): Response {
  const method = (init.method ?? 'GET').toUpperCase();
  const target = new URL(url, 'http://mock.local');
  const path = target.pathname.startsWith(API_PREFIX)
    ? target.pathname.slice(API_PREFIX.length)
    : target.pathname;

  // Same guard as the real API (api-spec B.1): state-changing calls need the CSRF header.
  const headers = new Headers(init.headers);
  if (method !== 'GET' && headers.get('X-Requested-With') !== 'octapoint-portal') return fail('MSG04');

  let body: Record<string, unknown> = {};
  if (typeof init.body === 'string' && init.body !== '') {
    try {
      const parsed: unknown = JSON.parse(init.body);
      if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>;
    } catch {
      return fail('MSG33');
    }
  }

  if (method === 'POST' && path === '/auth/login') return login(body);
  if (method === 'POST' && path === '/auth/register') return register(body);

  const user = currentUser();
  if (!user) return fail('MSG35');

  if (method === 'POST' && path === '/auth/logout') {
    writeSession(null);
    return empty();
  }
  if (method === 'GET' && path === '/auth/me') return ok(me(user));
  if (method === 'POST' && path === '/auth/change-password') return changePassword(user, body);

  if (path.startsWith('/admin/')) {
    if (user.role !== 'ADMIN') return fail('MSG04');
    return admin(method, path, target.searchParams);
  }
  if (path.startsWith('/merchant/')) {
    if (user.role === 'ADMIN' || user.merchantCode === null) return fail('MSG04');
    return handleMerchant({
      user,
      merchantCode: user.merchantCode,
      method,
      path: path.slice('/merchant'.length),
      query: target.searchParams,
      headers,
      body,
      users,
      transactions,
    });
  }
  return fail('MSG33', 404); // unknown route (api-spec section 0)
}

/** Same signature as fetch(url, init). Answers after a short delay so loading states are visible. */
export async function mockFetch(url: string, init: RequestInit = {}): Promise<Response> {
  await new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS));
  try {
    return handle(url, init);
  } catch {
    return fail('MSG23');
  }
}
