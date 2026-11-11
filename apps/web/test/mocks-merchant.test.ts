import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createApiKey,
  createCustomer,
  createStaff,
  deactivateCustomer,
  deactivateStaff,
  getMerchantDashboard,
  getRules,
  issuePoints,
  listApiKeys,
  listCustomers,
  listMerchantLedger,
  listStaff,
  login,
  logout,
  redeemPoints,
  reverseTransaction,
  revokeApiKey,
  saveRules,
  updateCustomer,
} from '../src/lib/api-client';
import { DEMO_PASSWORD } from '../src/lib/mock-accounts';

// Merchant endpoints of the mock API (api-spec B.4), exercised through the real api-client.

async function loginAs(email: string): Promise<void> {
  await login({ email, password: DEMO_PASSWORD });
}

let counter = 0;
function key(): string {
  counter += 1;
  return `test-key-${counter}-${Math.random().toString(36).slice(2)}`;
}

describe('mock merchant API', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_USE_MOCKS = 'true';
  });

  afterEach(async () => {
    await logout().catch(() => undefined);
    delete process.env.NEXT_PUBLIC_USE_MOCKS;
  });

  it('refuses Admin and Staff where the spec says MSG04', async () => {
    await loginAs('admin@octapoint.test');
    await expect(getMerchantDashboard()).rejects.toMatchObject({ code: 'MSG04', status: 403 });
    await logout();

    await loginAs('staff@octapoint.test');
    await expect(getMerchantDashboard()).rejects.toMatchObject({ code: 'MSG04' });
    await expect(getRules()).rejects.toMatchObject({ code: 'MSG04' });
    await expect(deactivateCustomer('CUS001')).rejects.toMatchObject({ code: 'MSG04' });
    await expect(reverseTransaction('TXN-20260101-AAAAAAAA')).rejects.toMatchObject({ code: 'MSG04' });
    const page = await listCustomers();
    expect(page.items.length).toBeGreaterThan(0);
  });

  it('lists customers with search and 20 per page', async () => {
    await loginAs('owner@octapoint.test');
    const first = await listCustomers();
    expect(first.page_size).toBe(20);
    expect(first.items).toHaveLength(20);
    expect(first.total).toBeGreaterThanOrEqual(30);
    const found = await listCustomers({ q: 'cus007' });
    expect(found.items.map((c) => c.customer_code)).toEqual(['CUS007']);
  });

  it('creates and edits customers with the documented errors', async () => {
    await loginAs('owner@octapoint.test');
    const created = await createCustomer({ customer_code: 'NEW1', name: 'New Person', phone: '0900000001' });
    expect(created).toMatchObject({ customer_code: 'NEW1', balance: 0, is_active: true });
    await expect(createCustomer({ customer_code: 'NEW1', name: 'X' })).rejects.toMatchObject({ code: 'MSG27' });
    await expect(
      createCustomer({ customer_code: 'NEW2', name: 'X', phone: '0900000001' }),
    ).rejects.toMatchObject({ code: 'MSG38' });
    await expect(createCustomer({ customer_code: 'new3', name: 'X' })).rejects.toMatchObject({ code: 'MSG33' });
    await expect(createCustomer({ customer_code: '', name: 'X' })).rejects.toMatchObject({ code: 'MSG01' });
    const edited = await updateCustomer('NEW1', { name: 'Renamed', phone: null });
    expect(edited).toMatchObject({ name: 'Renamed', phone: null });
    await expect(updateCustomer('NOPE', { name: 'A' })).rejects.toMatchObject({ code: 'MSG22' });
  });

  it('issues points: floor(amount / earn_ratio), idempotent, MSG34 on a different request', async () => {
    await loginAs('owner@octapoint.test');
    await saveRules({ earn_ratio: 10000, min_redemption_threshold: 50 });
    const k = key();
    const tx = await issuePoints('CUS010', 125000, k);
    expect(tx).toMatchObject({ type: 'ISSUE', customer_code: 'CUS010', points: 12, status: 'PENDING_ANCHOR' });
    expect(tx.transaction_id).toMatch(/^TXN-\d{8}-[A-Z0-9]{8}$/);

    const replay = await issuePoints('CUS010', 125000, k);
    expect(replay.transaction_id).toBe(tx.transaction_id);
    await expect(issuePoints('CUS010', 200000, k)).rejects.toMatchObject({ code: 'MSG34', status: 409 });

    await expect(issuePoints('CUS010', 9999, key())).rejects.toMatchObject({ code: 'MSG24' });
    await expect(issuePoints('NOPE', 100000, key())).rejects.toMatchObject({ code: 'MSG22' });
    await expect(issuePoints('CUS010', 1.5, key())).rejects.toMatchObject({ code: 'MSG33' });
    await expect(issuePoints('CUS010', 100000, '')).rejects.toMatchObject({ code: 'MSG33' });
    await expect(issuePoints('CUS010', 20_000_000_000, key())).rejects.toMatchObject({ code: 'MSG33' });
  });

  it('checks the minimum before the balance on redeem (MSG09 before MSG08)', async () => {
    await loginAs('owner@octapoint.test');
    await saveRules({ earn_ratio: 10000, min_redemption_threshold: 50 });
    // CUS003 has a balance of 10: below the minimum AND above the balance.
    const low = await redeemPoints('CUS003', 20, key()).catch((e: unknown) => e);
    expect(low).toMatchObject({ code: 'MSG09', status: 422 });
    expect((low as { message: string }).message).toContain('50');
    await expect(redeemPoints('CUS003', 60, key())).rejects.toMatchObject({ code: 'MSG08' });

    const before = (await listCustomers({ q: 'CUS004' })).items[0]?.balance ?? 0;
    const tx = await redeemPoints('CUS004', 60, key());
    expect(tx).toMatchObject({ type: 'REDEEM', points: 60, balance_after: before - 60 });
  });

  it('blocks a deactivated customer (MSG39) and reactivation allows it again', async () => {
    await loginAs('owner@octapoint.test');
    await deactivateCustomer('CUS020');
    await expect(issuePoints('CUS020', 100000, key())).rejects.toMatchObject({ code: 'MSG39' });
  });

  it('validates and saves loyalty rules', async () => {
    await loginAs('owner@octapoint.test');
    await expect(saveRules({ earn_ratio: 0, min_redemption_threshold: 5 })).rejects.toMatchObject({ code: 'MSG33' });
    await expect(saveRules({ earn_ratio: 1.5, min_redemption_threshold: 5 })).rejects.toMatchObject({
      code: 'MSG33',
    });
    const saved = await saveRules({ earn_ratio: 5000, min_redemption_threshold: 20 });
    expect(saved).toEqual({ earn_ratio: 5000, min_redemption_threshold: 20 });
    expect(await getRules()).toEqual(saved);
  });

  it('shows the secret once and allows at most 5 open API keys (MSG40)', async () => {
    await loginAs('owner@octapoint.test');
    const before = await listApiKeys();
    const open = before.items.filter((k) => k.status !== 'REVOKED').length;

    const created = await createApiKey();
    expect(created.key_id).toMatch(/^oct_[0-9a-f]{32}$/);
    expect(created.secret.length).toBeGreaterThanOrEqual(32);
    const listed = (await listApiKeys()).items.find((k) => k.id === created.id);
    expect(listed).toMatchObject({ status: 'ACTIVE' });
    expect(JSON.stringify(listed)).not.toContain(created.secret);
    expect(listed?.masked_key_id).toBe(`${created.key_id.slice(0, 8)}...${created.key_id.slice(-4)}`);

    for (let i = open + 1; i < 5; i += 1) await createApiKey();
    await expect(createApiKey()).rejects.toMatchObject({ code: 'MSG40', status: 409 });

    await revokeApiKey(created.id);
    await expect(createApiKey()).resolves.toBeDefined();
    await expect(revokeApiKey('does-not-exist')).rejects.toMatchObject({ code: 'MSG33' });
  });

  it('creates staff, rejects duplicates and weak passwords, and deactivated staff cannot log in', async () => {
    await loginAs('owner@octapoint.test');
    const email = `cashier${Math.random().toString(36).slice(2, 8)}@octapoint.test`;
    const staff = await createStaff({ full_name: 'Cash Ier', email, initial_password: 'Passw0rd1' });
    expect(staff).toMatchObject({ email, is_active: true });
    expect((await listStaff()).items.some((s) => s.id === staff.id)).toBe(true);
    await expect(createStaff({ full_name: 'Dup', email, initial_password: 'Passw0rd1' })).rejects.toMatchObject({
      code: 'MSG31',
    });
    await expect(
      createStaff({ full_name: 'Weak', email: 'weak@octapoint.test', initial_password: 'short' }),
    ).rejects.toMatchObject({ code: 'MSG37' });
    await expect(createStaff({ full_name: '', email: 'x@octapoint.test', initial_password: 'Passw0rd1' })).rejects.toMatchObject({
      code: 'MSG01',
    });

    await deactivateStaff(staff.id);
    await logout();
    await expect(login({ email, password: 'Passw0rd1' })).rejects.toMatchObject({ code: 'MSG02' });
  });

  it('reverses once (MSG26), refuses a negative balance (MSG25) and shows reversible only to the Owner', async () => {
    await loginAs('owner@octapoint.test');
    await saveRules({ earn_ratio: 10000, min_redemption_threshold: 50 });
    const issued = await issuePoints('CUS013', 300000, key()); // 30 points
    const ledger = await listMerchantLedger();
    expect(ledger.items[0]).toMatchObject({ transaction_id: issued.transaction_id, reversible: true, bill_amount: 300000 });
    expect(ledger.items[0]).not.toHaveProperty('merchant_code');

    const reversal = await reverseTransaction(issued.transaction_id);
    expect(reversal).toMatchObject({ type: 'REVERSAL', reverses_transaction_id: issued.transaction_id, points: 30 });
    await expect(reverseTransaction(issued.transaction_id)).rejects.toMatchObject({ code: 'MSG26' });
    await expect(reverseTransaction(reversal.transaction_id)).rejects.toMatchObject({ code: 'MSG26' });
    await expect(reverseTransaction('TXN-20260101-ZZZZZZZZ')).rejects.toMatchObject({ code: 'MSG22' });

    // CUS003 starts with 10 points: issue 60 (balance 70), redeem 50 (balance 20), then reversing the ISSUE would go below zero.
    const big = await issuePoints('CUS003', 600000, key());
    await redeemPoints('CUS003', 50, key());
    await expect(reverseTransaction(big.transaction_id)).rejects.toMatchObject({ code: 'MSG25', status: 409 });

    await logout();
    await loginAs('staff@octapoint.test');
    const asStaff = await listMerchantLedger();
    expect(asStaff.items.every((row) => row.reversible === false)).toBe(true);
  });

  it('filters the ledger and counts today in the dashboard', async () => {
    await loginAs('owner@octapoint.test');
    await saveRules({ earn_ratio: 10000, min_redemption_threshold: 50 });
    const dashBefore = await getMerchantDashboard();
    await issuePoints('CUS015', 100000, key());
    const dashAfter = await getMerchantDashboard();
    expect(dashAfter.today_transactions).toBe(dashBefore.today_transactions + 1);
    expect(dashAfter.circulating_points).toBe(dashBefore.circulating_points + 10);

    const onlyRedeem = await listMerchantLedger({ type: 'REDEEM' });
    expect(onlyRedeem.items.every((row) => row.type === 'REDEEM')).toBe(true);
    const byCustomer = await listMerchantLedger({ customer_code: 'CUS015' });
    expect(byCustomer.items.every((row) => row.customer_code === 'CUS015')).toBe(true);
    await expect(listMerchantLedger({ date_from: '09/11/2026' })).rejects.toMatchObject({ code: 'MSG33' });
  });
});
