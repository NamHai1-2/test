import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  approveMerchant,
  buildQuery,
  changePassword,
  getMe,
  issuePoints,
  listAdminMerchants,
  listCustomers,
  login,
  logout,
  redeemPoints,
  reverseTransaction,
  setSessionExpiredHandler,
} from '../src/lib/api-client';
import { MESSAGES } from '../src/lib/messages';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api-client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let sessionExpired: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_USE_MOCKS; // these tests talk to the (stubbed) real transport
    sessionExpired = vi.fn();
    setSessionExpiredHandler(sessionExpired);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setSessionExpiredHandler(null);
  });

  describe('error mapping (CR-06)', () => {
    it('turns an error body into an ApiError with code, status and the server text', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(422, { code: 'MSG08', message: 'Insufficient point balance for this redemption.' }),
      );
      const error = await approveMerchant('m1').catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        name: 'ApiError',
        code: 'MSG08',
        status: 422,
        message: 'Insufficient point balance for this redemption.',
      });
    });

    it('keeps server_time of MSG17', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(401, { code: 'MSG17', message: 'Request timestamp is expired.', server_time: 1_790_000_000 }),
      );
      await expect(getMe()).rejects.toMatchObject({ code: 'MSG17', serverTime: 1_790_000_000 });
    });

    it('falls back to the MSG text when the body has a code but no message', async () => {
      fetchMock.mockResolvedValue(jsonResponse(403, { code: 'MSG04' }));
      await expect(getMe()).rejects.toMatchObject({ code: 'MSG04', message: MESSAGES.MSG04 });
    });

    it('answers MSG23 when the body is not a CR-06 body (proxy error page)', async () => {
      fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
      await expect(getMe()).rejects.toMatchObject({
        code: 'MSG23',
        status: 502,
        message: MESSAGES.MSG23,
      });
    });

    it('answers MSG23 with status 0 when the network fails', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(getMe()).rejects.toMatchObject({ code: 'MSG23', status: 0 });
    });
  });

  describe('session expiry (MSG35)', () => {
    it('calls the redirect handler once and still throws the ApiError', async () => {
      fetchMock.mockResolvedValue(jsonResponse(401, { code: 'MSG35', message: MESSAGES.MSG35 }));
      await expect(getMe()).rejects.toMatchObject({ code: 'MSG35', status: 401 });
      expect(sessionExpired).toHaveBeenCalledTimes(1);
    });

    it('does not redirect on a wrong password (MSG02 is an inline error, not an expired session)', async () => {
      fetchMock.mockResolvedValue(jsonResponse(401, { code: 'MSG02', message: MESSAGES.MSG02 }));
      await expect(login({ email: 'a@b.test', password: 'x' })).rejects.toMatchObject({ code: 'MSG02' });
      expect(sessionExpired).toHaveBeenCalledTimes(0);
    });

    it('does not redirect on MSG04 (403)', async () => {
      fetchMock.mockResolvedValue(jsonResponse(403, { code: 'MSG04', message: MESSAGES.MSG04 }));
      await expect(getMe()).rejects.toMatchObject({ code: 'MSG04' });
      expect(sessionExpired).toHaveBeenCalledTimes(0);
    });
  });

  describe('requests', () => {
    it('sends credentials, JSON and the CSRF header on a write', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          user: { id: 'u1', full_name: 'A', email: 'a@b.test', role: 'ADMIN' },
          redirect: '/admin',
        }),
      );
      const result = await login({ email: 'a@b.test', password: 'Secret123' });
      expect(result.redirect).toBe('/admin');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(url).toBe('/api/v1/auth/login');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');
      expect(headers['X-Requested-With']).toBe('octapoint-portal');
      expect(headers['Content-Type']).toBe('application/json');
      expect(init.body).toBe(JSON.stringify({ email: 'a@b.test', password: 'Secret123' }));
    });

    it('does not send the CSRF header or a body on a read', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { id: 'u1', full_name: 'A', email: 'a@b.test', role: 'ADMIN', merchant: null }),
      );
      await getMe();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(url).toBe('/api/v1/auth/me');
      expect(init.method).toBe('GET');
      expect(init.credentials).toBe('include');
      expect(headers['X-Requested-With']).toBeUndefined();
      expect(init.body).toBeUndefined();
    });

    it('resolves to undefined on 204 (logout)', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
      await expect(logout()).resolves.toBeUndefined();
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)['X-Requested-With']).toBe('octapoint-portal');
    });

    it('sends the change-password body as is', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}));
      await changePassword({ current_password: 'Old12345', new_password: 'New12345' });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/v1/auth/change-password');
      expect(init.body).toBe(JSON.stringify({ current_password: 'Old12345', new_password: 'New12345' }));
    });

    it('builds the merchant list query and leaves out empty filters', async () => {
      // a Response body can be read once, so every call needs a fresh Response
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, { items: [], page: 2, page_size: 20, total: 0 })));
      await listAdminMerchants({ status: 'PENDING', page: 2 });
      await listAdminMerchants({});
      expect((fetchMock.mock.calls[0] as [string])[0]).toBe('/api/v1/admin/merchants?status=PENDING&page=2');
      expect((fetchMock.mock.calls[1] as [string])[0]).toBe('/api/v1/admin/merchants');
    });

    it('encodes the id in a path segment', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}));
      await approveMerchant('a/b');
      expect((fetchMock.mock.calls[0] as [string])[0]).toBe('/api/v1/admin/merchants/a%2Fb/approve');
    });
  });

  describe('merchant calls', () => {
    it('sends the idempotency key on issue and redeem, and the CSRF header', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(201, { transaction_id: 'TXN-20260101-AAAAAAAA' })));
      await issuePoints('CUS001', 125000, 'key-1');
      await redeemPoints('CUS001', 60, 'key-2');
      const [issueUrl, issueInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      const [redeemUrl, redeemInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(issueUrl).toBe('/api/v1/merchant/customers/CUS001/issue');
      expect(redeemUrl).toBe('/api/v1/merchant/customers/CUS001/redeem');
      expect((issueInit.headers as Record<string, string>)['X-Idempotency-Key']).toBe('key-1');
      expect((redeemInit.headers as Record<string, string>)['X-Idempotency-Key']).toBe('key-2');
      expect((issueInit.headers as Record<string, string>)['X-Requested-With']).toBe('octapoint-portal');
      expect(JSON.parse(String(issueInit.body))).toEqual({ amount: 125000 });
      expect(JSON.parse(String(redeemInit.body))).toEqual({ points: 60 });
    });

    it('does not send an idempotency header on other calls', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { items: [], page: 1, page_size: 20, total: 0 }));
      await listCustomers({ q: 'an', page: 2 });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/v1/merchant/customers?q=an&page=2');
      expect((init.headers as Record<string, string>)['X-Idempotency-Key']).toBeUndefined();
    });

    it('unwraps the reversal and keeps MSG25 as an ApiError', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(201, { reversal: { transaction_id: 'TXN-20260101-BBBBBBBB' } }));
      const reversal = await reverseTransaction('TXN-20260101-AAAAAAAA');
      expect(reversal.transaction_id).toBe('TXN-20260101-BBBBBBBB');
      expect((fetchMock.mock.calls[0] as [string])[0]).toBe('/api/v1/merchant/ledger/TXN-20260101-AAAAAAAA/reverse');

      fetchMock.mockResolvedValueOnce(jsonResponse(409, { code: 'MSG25', message: 'x' }));
      await expect(reverseTransaction('TXN-20260101-CCCCCCCC')).rejects.toMatchObject({ code: 'MSG25', status: 409 });
    });
  });

  describe('buildQuery', () => {
    it('skips undefined, null and empty values but keeps 0', () => {
      expect(buildQuery({ status: 'ACTIVE', page: 2, q: '', x: undefined, y: null })).toBe(
        '?status=ACTIVE&page=2',
      );
      expect(buildQuery({ page: 0 })).toBe('?page=0');
      expect(buildQuery({})).toBe('');
    });
  });
});