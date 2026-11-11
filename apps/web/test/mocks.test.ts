import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  approveMerchant,
  changePassword,
  getAdminDashboard,
  getMe,
  listAdminLedger,
  listAdminMerchants,
  login,
  logout,
  register,
  setSessionExpiredHandler,
  suspendMerchant,
} from '../src/lib/api-client';
import { DEMO_PASSWORD } from '../src/lib/mock-accounts';

// The mock API sits behind the real api-client, so these tests also prove that mock mode behaves like
// the contract in docs/api-spec.md (error codes, pagination, allowed merchant transitions).

const PHO_CORNER = '00000000-0000-4000-8000-000000000006'; // PENDING in the fixtures
const GREEN_GARDEN = '00000000-0000-4000-8000-000000000005'; // ACTIVE in the fixtures

async function loginAs(email: string): Promise<void> {
  await login({ email, password: DEMO_PASSWORD });
}

describe('mock API (NEXT_PUBLIC_USE_MOCKS=true)', () => {
  let sessionExpired: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_USE_MOCKS = 'true';
    sessionExpired = vi.fn();
    setSessionExpiredHandler(sessionExpired);
  });

  afterEach(async () => {
    await logout().catch(() => undefined);
    setSessionExpiredHandler(null);
    delete process.env.NEXT_PUBLIC_USE_MOCKS;
  });

  it('answers MSG35 without a session and triggers the redirect', async () => {
    await expect(getMe()).rejects.toMatchObject({ code: 'MSG35', status: 401 });
    expect(sessionExpired).toHaveBeenCalledTimes(1);
  });

  it('logs in with the role-based redirect, shows the profile and logs out', async () => {
    const result = await login({ email: 'admin@octapoint.test', password: DEMO_PASSWORD });
    expect(result.redirect).toBe('/admin');
    expect(result.user.role).toBe('ADMIN');
    expect(await getMe()).toMatchObject({ email: 'admin@octapoint.test', role: 'ADMIN', merchant: null });

    await logout();
    await expect(getMe()).rejects.toMatchObject({ code: 'MSG35' });

    const owner = await login({ email: 'owner@octapoint.test', password: DEMO_PASSWORD });
    expect(owner.redirect).toBe('/dashboard');
    expect(await getMe()).toMatchObject({ merchant: { code: 'MCH-4F7K2Q', status: 'ACTIVE' } });
    await logout();

    const staff = await login({ email: 'staff@octapoint.test', password: DEMO_PASSWORD });
    expect(staff.redirect).toBe('/customers');
  });

  it('answers MSG02 for a wrong password, MSG01 for blanks and MSG15 for a pending merchant', async () => {
    await expect(login({ email: 'admin@octapoint.test', password: 'wrong-password1' })).rejects.toMatchObject({
      code: 'MSG02',
      status: 401,
    });
    await expect(login({ email: '', password: '' })).rejects.toMatchObject({ code: 'MSG01' });
    await expect(login({ email: 'pending@octapoint.test', password: DEMO_PASSWORD })).rejects.toMatchObject({
      code: 'MSG15',
      status: 403,
    });
    expect(sessionExpired).toHaveBeenCalledTimes(0);
  });

  it('refuses admin endpoints for an Owner with MSG04', async () => {
    await loginAs('owner@octapoint.test');
    await expect(getAdminDashboard()).rejects.toMatchObject({ code: 'MSG04', status: 403 });
    await expect(listAdminMerchants()).rejects.toMatchObject({ code: 'MSG04' });
    await expect(listAdminLedger()).rejects.toMatchObject({ code: 'MSG04' });
  });

  it('lists merchants in pages of 20 and filters by status', async () => {
    await loginAs('admin@octapoint.test');
    const first = await listAdminMerchants();
    expect(first.page).toBe(1);
    expect(first.page_size).toBe(20);
    expect(first.items).toHaveLength(20);
    expect(first.total).toBeGreaterThan(20);
    const second = await listAdminMerchants({ page: 2 });
    expect(second.items).toHaveLength(first.total - 20);
    expect(typeof first.items[0]?.id).toBe('string');

    const pending = await listAdminMerchants({ status: 'PENDING' });
    expect(pending.items.length).toBeGreaterThan(0);
    expect(pending.items.every((item) => item.status === 'PENDING')).toBe(true);

    await expect(listAdminMerchants({ page: 0 })).rejects.toMatchObject({ code: 'MSG33' });
  });

  it('follows the allowed merchant transitions only', async () => {
    await loginAs('admin@octapoint.test');

    await approveMerchant(PHO_CORNER); // PENDING -> ACTIVE
    await expect(approveMerchant(PHO_CORNER)).rejects.toMatchObject({ code: 'MSG33' }); // ACTIVE -> approve
    await suspendMerchant(PHO_CORNER); // ACTIVE -> SUSPENDED
    await expect(suspendMerchant(PHO_CORNER)).rejects.toMatchObject({ code: 'MSG33' }); // SUSPENDED -> suspend
    await approveMerchant(PHO_CORNER); // SUSPENDED -> ACTIVE
    await suspendMerchant(GREEN_GARDEN);
    await approveMerchant(GREEN_GARDEN);
  });

  it('keeps the dashboard totals consistent with the merchant list', async () => {
    await loginAs('admin@octapoint.test');
    const dashboard = await getAdminDashboard();
    const { total, pending, active, suspended } = dashboard.merchants;
    expect(pending + active + suspended).toBe(total);
    expect((await listAdminMerchants()).total).toBe(total);
    expect((await listAdminMerchants({ status: 'ACTIVE' })).total).toBe(active);
    expect(dashboard.points_issued).toBeGreaterThan(0);
    expect(dashboard.points_redeemed).toBeGreaterThan(0);
  });

  it('serves the ledger newest first with filters and Explorer links', async () => {
    await loginAs('admin@octapoint.test');
    const first = await listAdminLedger();
    expect(first.items).toHaveLength(20);
    expect(first.total).toBeGreaterThan(40);
    const times = first.items.map((item) => item.created_at);
    expect(times).toEqual([...times].sort().reverse());

    const reversals = await listAdminLedger({ type: 'REVERSAL' });
    expect(reversals.items.length).toBeGreaterThan(0);
    expect(reversals.items.every((item) => item.type === 'REVERSAL' && item.reverses_transaction_id !== null)).toBe(true);

    const anchored = await listAdminLedger({ status: 'ANCHORED' });
    expect(anchored.items.every((item) => item.sui_digest !== null && item.explorer_url !== null)).toBe(true);
    const pending = await listAdminLedger({ status: 'PENDING_ANCHOR' });
    expect(pending.items.length).toBeGreaterThan(0);
    expect(pending.items.every((item) => item.sui_digest === null && item.explorer_url === null)).toBe(true);

    const code = first.items[0]?.merchant_code ?? '';
    const byMerchant = await listAdminLedger({ merchant_code: code });
    expect(byMerchant.items.every((item) => item.merchant_code === code)).toBe(true);

    expect((await listAdminLedger({ date_from: '2099-01-01', date_to: '2099-01-31' })).items).toHaveLength(0);
    await expect(listAdminLedger({ type: 'NOPE' as never })).rejects.toMatchObject({ code: 'MSG33' });
  });

  it('registers a PENDING merchant that cannot log in yet, and rejects bad input', async () => {
    const body = {
      business_name: 'Mock Bistro',
      owner_name: 'Test Owner',
      email: 'bistro@example.test',
      password: 'Bistro2026',
    };
    await register(body);
    await expect(register(body)).rejects.toMatchObject({ code: 'MSG31', status: 409 });
    await expect(register({ ...body, email: 'other@example.test', password: 'short' })).rejects.toMatchObject({
      code: 'MSG37',
    });
    await expect(register({ ...body, email: 'blank@example.test', business_name: '' })).rejects.toMatchObject({
      code: 'MSG01',
    });
    await expect(login({ email: body.email, password: body.password })).rejects.toMatchObject({ code: 'MSG15' });
  });

  it('changes the password only with the right current one and a policy-conform new one', async () => {
    await loginAs('staff@octapoint.test');
    await expect(changePassword({ current_password: 'WrongOne123', new_password: 'NewPass123' })).rejects.toMatchObject({
      code: 'MSG36',
      status: 422,
    });
    await expect(changePassword({ current_password: DEMO_PASSWORD, new_password: 'weak' })).rejects.toMatchObject({
      code: 'MSG37',
    });
    await changePassword({ current_password: DEMO_PASSWORD, new_password: 'NewPass123' });
    await logout();
    await expect(login({ email: 'staff@octapoint.test', password: DEMO_PASSWORD })).rejects.toMatchObject({
      code: 'MSG02',
    });
    await login({ email: 'staff@octapoint.test', password: 'NewPass123' });
  });

  it('refuses a write without the CSRF header, like the real API (MSG04)', async () => {
    const { mockFetch } = await import('../src/lib/mocks');
    const response = await mockFetch('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@octapoint.test', password: DEMO_PASSWORD }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'MSG04' });
  });

  it('answers unknown routes with 404 and the MSG33 body', async () => {
    await loginAs('admin@octapoint.test');
    const { mockFetch } = await import('../src/lib/mocks');
    const response = await mockFetch('/api/v1/nothing/here');
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'MSG33' });
  });

  it('throws ApiError instances', async () => {
    await expect(getMe()).rejects.toBeInstanceOf(ApiError);
  });
});
