import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OctaPointClient, OctaPointError } from '../src/index.js';
import { sign } from '../src/signing.js';

const SECRET = 'test_secret_do_not_use';
const KEY_ID = 'oct_test_key';
const BASE = 'http://localhost:3001';
const KEY_1 = '11111111-1111-4111-8111-111111111111';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const RAW_TX = {
  transaction_id: 'TXN-20261101-K7P2M9QX',
  type: 'ISSUE',
  customer_code: 'CUS001',
  points: 15,
  balance_after: 4200,
  status: 'PENDING_ANCHOR',
  sui_digest: null,
  explorer_url: null,
  reverses_transaction_id: null,
  created_at: '2026-11-01T03:15:42.123Z',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface Sent {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Every call gets a fresh Response (a body can be read only once). */
function respond(status: number, body: unknown): void {
  fetchMock.mockImplementation(() => Promise.resolve(json(status, body)));
}

function lastSent(): Sent {
  const [url, init] = fetchMock.mock.calls.at(-1) as [URL, RequestInit];
  return {
    url: url.toString(),
    method: String(init.method),
    headers: init.headers as Record<string, string>,
    body: init.body as string | undefined,
  };
}

function client(timeoutMs?: number): OctaPointClient {
  return new OctaPointClient({
    baseUrl: BASE,
    apiKey: KEY_ID,
    apiSecret: SECRET,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(1_700_000_000_000)); // X-Timestamp = 1700000000, as in the A.2 vectors
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('signing on the wire (api-spec A.1, A.2)', () => {
  it('vector 1: issuePoints sends the documented headers and signature', async () => {
    respond(201, RAW_TX);
    await client().issuePoints({ customerCode: 'CUS001', amount: 150000, idempotencyKey: KEY_1 });

    const sent = lastSent();
    expect(sent.url).toBe('http://localhost:3001/api/v1/points/issue');
    expect(sent.method).toBe('POST');
    expect(sent.body).toBe('{"customer_code":"CUS001","amount":150000}');
    expect(sent.headers).toMatchObject({
      'X-API-Key': KEY_ID,
      'X-Timestamp': '1700000000',
      'X-Idempotency-Key': KEY_1,
      'Content-Type': 'application/json',
      'X-Signature': 'a886d990691785c75c8c53da0ce590f06b53debc8d803f558defcd7c51e599e0',
    });
  });

  it('vector 2: listTransactions signs the exact query, with no idempotency key and no body', async () => {
    respond(200, { items: [], page: 2, page_size: 20, total: 0 });
    await client().listTransactions('CUS001', { page: 2, type: 'ISSUE' });

    const sent = lastSent();
    expect(sent.url).toBe('http://localhost:3001/api/v1/customers/CUS001/transactions?page=2&type=ISSUE');
    expect(sent.method).toBe('GET');
    expect(sent.body).toBeUndefined();
    expect(sent.headers['X-Signature']).toBe('d53e51fa1efe9d41097a3a2aa50cd6d982699acbb8e174cb8c828511c990c08c');
    expect(sent.headers).not.toHaveProperty('X-Idempotency-Key');
    expect(sent.headers).not.toHaveProperty('Content-Type');
  });

  it('adds a random idempotency key by itself and signs it', async () => {
    respond(201, RAW_TX);
    await client().redeemPoints({ customerCode: 'CUS001', points: 500 });

    const sent = lastSent();
    const key = sent.headers['X-Idempotency-Key'];
    expect(key).toMatch(UUID_V4);
    expect(sent.headers['X-Signature']).toBe(
      sign(SECRET, {
        timestamp: '1700000000',
        method: 'POST',
        target: '/api/v1/points/redeem',
        body: '{"customer_code":"CUS001","points":500}',
        idempotencyKey: key as string,
      }),
    );
  });

  it('uses a new key for every call, and the same key when the caller passes it again', async () => {
    respond(201, RAW_TX);
    const sdk = client();
    await sdk.issuePoints({ customerCode: 'CUS001', amount: 150000 });
    const first = lastSent().headers['X-Idempotency-Key'];
    await sdk.issuePoints({ customerCode: 'CUS001', amount: 150000 });
    expect(lastSent().headers['X-Idempotency-Key']).not.toBe(first);

    await sdk.issuePoints({ customerCode: 'CUS001', amount: 150000, idempotencyKey: KEY_1 });
    const a = lastSent();
    await sdk.issuePoints({ customerCode: 'CUS001', amount: 150000, idempotencyKey: KEY_1 });
    const b = lastSent();
    expect(b.headers['X-Idempotency-Key']).toBe(KEY_1);
    expect(b.headers['X-Signature']).toBe(a.headers['X-Signature']); // same second, same request, same signature
  });

  it('never sends the secret', async () => {
    respond(200, { customer_code: 'CUS001', balance: 4200 });
    await client().getBalance('CUS001');
    const sent = lastSent();
    expect(JSON.stringify(sent.headers)).not.toContain(SECRET);
    expect(sent.url).not.toContain(SECRET);
  });
});

describe('calls and results', () => {
  it('getBalance returns camelCase and encodes the code in the path', async () => {
    respond(200, { customer_code: 'CUS001', balance: 4200 });
    await expect(client().getBalance('CUS001')).resolves.toEqual({ customerCode: 'CUS001', balance: 4200 });
    expect(lastSent().url).toBe('http://localhost:3001/api/v1/customers/CUS001/balance');

    await client().getBalance('a/b?c');
    expect(lastSent().url).toBe('http://localhost:3001/api/v1/customers/a%2Fb%3Fc/balance');
  });

  it('does not change the case of the customer code (the API is strict)', async () => {
    respond(200, { customer_code: 'cus001', balance: 0 });
    await client().getBalance('cus001');
    expect(lastSent().url).toContain('/customers/cus001/balance');
  });

  it('maps a transaction and a page', async () => {
    respond(201, RAW_TX);
    await expect(client().issuePoints({ customerCode: 'CUS001', amount: 150000 })).resolves.toEqual({
      transactionId: 'TXN-20261101-K7P2M9QX',
      type: 'ISSUE',
      customerCode: 'CUS001',
      points: 15,
      balanceAfter: 4200,
      status: 'PENDING_ANCHOR',
      suiDigest: null,
      explorerUrl: null,
      reversesTransactionId: null,
      createdAt: '2026-11-01T03:15:42.123Z',
    });

    respond(200, { items: [RAW_TX], page: 1, page_size: 20, total: 1 });
    const page = await client().listTransactions('CUS001');
    expect(page).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(page.items[0]?.transactionId).toBe('TXN-20261101-K7P2M9QX');
  });

  it('sends only the filters that are set, with the API names', async () => {
    respond(200, { items: [], page: 1, page_size: 20, total: 0 });
    await client().listTransactions('CUS001', {
      status: 'ANCHORED',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
    });
    expect(lastSent().url).toBe(
      'http://localhost:3001/api/v1/customers/CUS001/transactions?status=ANCHORED&date_from=2026-11-01&date_to=2026-11-30',
    );
  });

  it('accepts a base URL with a trailing slash', async () => {
    respond(200, { customer_code: 'CUS001', balance: 1 });
    await new OctaPointClient({ baseUrl: `${BASE}/`, apiKey: KEY_ID, apiSecret: SECRET }).getBalance('CUS001');
    expect(lastSent().url).toBe('http://localhost:3001/api/v1/customers/CUS001/balance');
  });
});

describe('errors', () => {
  it('throws OctaPointError with the MSG code, message and HTTP status', async () => {
    respond(422, { code: 'MSG08', message: 'Insufficient point balance for this redemption.' });
    const error = await client()
      .redeemPoints({ customerCode: 'CUS001', points: 500 })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OctaPointError);
    expect(error).toMatchObject({
      name: 'OctaPointError',
      code: 'MSG08',
      message: 'Insufficient point balance for this redemption.',
      httpStatus: 422,
    });
    expect((error as OctaPointError).serverTime).toBeUndefined();
  });

  it('exposes serverTime on MSG17 only', async () => {
    respond(401, { code: 'MSG17', message: 'Request timestamp is expired.', server_time: 1_790_000_000 });
    await expect(client().getBalance('CUS001')).rejects.toMatchObject({
      code: 'MSG17',
      httpStatus: 401,
      serverTime: 1_790_000_000,
    });

    respond(401, { code: 'MSG18', message: 'Invalid API key.', server_time: 5 });
    const error = await client()
      .getBalance('CUS001')
      .catch((caught: unknown) => caught);
    expect((error as OctaPointError).serverTime).toBeUndefined();
  });

  it('turns an answer that is not a CR-06 body into MSG23 and keeps the HTTP status', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(client().getBalance('CUS001')).rejects.toMatchObject({ code: 'MSG23', httpStatus: 502 });
  });

  it('turns an unreadable success body into MSG23', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));
    await expect(client().getBalance('CUS001')).rejects.toMatchObject({ code: 'MSG23', httpStatus: 200 });
  });

  it('turns a network failure into MSG23 with HTTP status 0, and never retries by itself', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const error = await client()
      .issuePoints({ customerCode: 'CUS001', amount: 150000 })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OctaPointError);
    expect(error).toMatchObject({ code: 'MSG23', httpStatus: 0 });
    expect((error as OctaPointError).message).not.toContain(SECRET);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times out after timeoutMs', async () => {
    fetchMock.mockImplementation(
      (_url: URL, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    await expect(client(20).getBalance('CUS001')).rejects.toMatchObject({
      code: 'MSG23',
      httpStatus: 0,
      message: 'Request timed out after 20 ms.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('configuration', () => {
  it('rejects missing or invalid options', () => {
    const ok = { baseUrl: BASE, apiKey: KEY_ID, apiSecret: SECRET };
    expect(() => new OctaPointClient({ ...ok, baseUrl: '' })).toThrow(TypeError);
    expect(() => new OctaPointClient({ ...ok, baseUrl: 'not a url' })).toThrow(TypeError);
    expect(() => new OctaPointClient({ ...ok, apiKey: '' })).toThrow(TypeError);
    expect(() => new OctaPointClient({ ...ok, apiSecret: '' })).toThrow(TypeError);
    expect(() => new OctaPointClient({ ...ok, timeoutMs: 0 })).toThrow(TypeError);
  });
});

describe('getLoyaltyRules (api-spec A.3, used by the MCP server)', () => {
  it('sends a signed GET without body and maps the answer to camelCase', async () => {
    respond(200, { earn_ratio: 10000, min_redemption_threshold: 50 });
    const rules = await client().getLoyaltyRules();

    expect(rules).toEqual({ earnRatio: 10000, minRedemptionThreshold: 50 });
    const sent = lastSent();
    expect(sent.url).toBe('http://localhost:3001/api/v1/loyalty-rules');
    expect(sent.method).toBe('GET');
    expect(sent.body).toBeUndefined();
    expect(sent.headers['X-Signature']).toBe(
      sign(SECRET, {
        timestamp: '1700000000',
        method: 'GET',
        target: '/api/v1/loyalty-rules',
        body: '',
      }),
    );
    expect(sent.headers).not.toHaveProperty('X-Idempotency-Key');
  });

  it('throws OctaPointError MSG32 when the rules are not set', async () => {
    respond(422, { code: 'MSG32', message: 'Loyalty rules are not set.' });
    await expect(client().getLoyaltyRules()).rejects.toMatchObject({ code: 'MSG32', httpStatus: 422 });
  });
});
