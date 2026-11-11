import { describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OctaPointError } from '@octapoint/sdk';
import type { Transaction } from '@octapoint/sdk';
import { ConfigError, loadConfig } from '../src/config.js';
import { registerTools } from '../src/server.js';
import {
  TOOL_NAMES,
  createToolHandlers,
  normalizeCustomerCode,
  type ReadOnlyClient,
} from '../src/tools.js';

function transaction(n: number): Transaction {
  return {
    transactionId: `TXN-20261101-${String(n).padStart(8, '0')}`,
    type: n % 2 === 0 ? 'REDEEM' : 'ISSUE',
    customerCode: 'CUS001',
    points: n,
    balanceAfter: 1000 + n,
    status: n === 1 ? 'ANCHORED' : 'PENDING_ANCHOR',
    suiDigest: n === 1 ? 'DIGEST1' : null,
    explorerUrl: n === 1 ? 'https://example.test/tx/DIGEST1' : null,
    reversesTransactionId: null,
    createdAt: '2026-11-01T03:15:42.123Z',
  };
}

function fakeClient(overrides: Partial<ReadOnlyClient> = {}): ReadOnlyClient & {
  getBalance: ReturnType<typeof vi.fn>;
  listTransactions: ReturnType<typeof vi.fn>;
  getLoyaltyRules: ReturnType<typeof vi.fn>;
} {
  return {
    getBalance: vi.fn().mockResolvedValue({ customerCode: 'CUS001', balance: 4200 }),
    listTransactions: vi.fn().mockResolvedValue({
      items: Array.from({ length: 15 }, (_, i) => transaction(i + 1)),
      page: 1,
      pageSize: 20,
      total: 15,
    }),
    getLoyaltyRules: vi.fn().mockResolvedValue({ earnRatio: 10000, minRedemptionThreshold: 50 }),
    ...overrides,
  } as never;
}

function payload(result: { content: { type: string; text?: string }[] }): unknown {
  const first = result.content[0];
  return JSON.parse(first?.text ?? 'null');
}

describe('tool list (BR-14: read-only)', () => {
  it('is exactly the three read tools of api-spec C.1', () => {
    expect([...TOOL_NAMES]).toEqual(['get_balance', 'list_transactions', 'get_loyalty_rules']);
  });

  it('contains no name that suggests a write', () => {
    const forbidden = /issue|redeem|reverse|create|update|delete|write|set|add|remove|revoke|deactivate|approve/i;
    for (const name of TOOL_NAMES) expect(name).not.toMatch(forbidden);
  });

  it('registers exactly those tools on the server, nothing more', () => {
    const registered: string[] = [];
    const server = {
      registerTool: (name: string) => {
        registered.push(name);
        return {};
      },
    } as unknown as McpServer;
    registerTools(server, createToolHandlers(fakeClient()));
    expect(registered).toEqual([...TOOL_NAMES]);
  });

  it('has one handler per tool and the client type offers read methods only', () => {
    const handlers = createToolHandlers(fakeClient());
    expect(Object.keys(handlers).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it('never calls a write method, even if the client object has them', async () => {
    const client = Object.assign(fakeClient(), { issuePoints: vi.fn(), redeemPoints: vi.fn() });
    const handlers = createToolHandlers(client);
    await handlers.get_balance({ customer_code: 'CUS001' });
    await handlers.list_transactions({ customer_code: 'CUS001' });
    await handlers.get_loyalty_rules();
    expect(client.issuePoints).not.toHaveBeenCalled();
    expect(client.redeemPoints).not.toHaveBeenCalled();
  });
});

describe('customer code handling (SRS 3.2.4.1 step 2)', () => {
  it('trims and upper-cases', () => {
    expect(normalizeCustomerCode(' cus001 ')).toBe('CUS001');
  });

  it("sends ' cus001 ' to the API as CUS001 (both tools)", async () => {
    const client = fakeClient();
    const handlers = createToolHandlers(client);
    await handlers.get_balance({ customer_code: ' cus001 ' });
    await handlers.list_transactions({ customer_code: ' cus001 ' });
    expect(client.getBalance).toHaveBeenCalledWith('CUS001');
    expect(client.listTransactions).toHaveBeenCalledWith('CUS001');
  });

  it('answers MSG33 without calling the API when the code is empty', async () => {
    const client = fakeClient();
    const result = await createToolHandlers(client).get_balance({ customer_code: '   ' });
    expect(result.isError).toBe(true);
    expect(payload(result)).toMatchObject({ code: 'MSG33' });
    expect(client.getBalance).not.toHaveBeenCalled();
  });
});

describe('output mapping (api-spec C.1)', () => {
  it('get_balance returns { customer_code, balance }', async () => {
    const result = await createToolHandlers(fakeClient()).get_balance({ customer_code: 'CUS001' });
    expect(result.isError).toBeUndefined();
    expect(payload(result)).toEqual({ customer_code: 'CUS001', balance: 4200 });
  });

  it('list_transactions returns the first 10, in the order of the API, with snake_case fields only', async () => {
    const result = await createToolHandlers(fakeClient()).list_transactions({ customer_code: 'CUS001' });
    const items = payload(result) as Record<string, unknown>[];
    expect(items).toHaveLength(10);
    expect(items[0]).toEqual({
      transaction_id: 'TXN-20261101-00000001',
      type: 'ISSUE',
      points: 1,
      status: 'ANCHORED',
      sui_digest: 'DIGEST1',
    });
    expect(items[9]?.transaction_id).toBe('TXN-20261101-00000010');
    expect(items[1]).toMatchObject({ status: 'PENDING_ANCHOR', sui_digest: null });
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(['points', 'status', 'sui_digest', 'transaction_id', 'type']);
    }
  });

  it('list_transactions returns an empty list for a customer without transactions', async () => {
    const client = fakeClient({
      listTransactions: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 }),
    });
    const result = await createToolHandlers(client).list_transactions({ customer_code: 'CUS001' });
    expect(payload(result)).toEqual([]);
  });

  it('get_loyalty_rules returns { earn_ratio, min_redemption_threshold }', async () => {
    const result = await createToolHandlers(fakeClient()).get_loyalty_rules();
    expect(payload(result)).toEqual({ earn_ratio: 10000, min_redemption_threshold: 50 });
  });
});

describe('errors', () => {
  it('keeps the original code and message of an API error (MSG22, MSG18, MSG32)', async () => {
    const cases: [string, string][] = [
      ['MSG22', 'Customer not found.'],
      ['MSG18', 'Invalid or inactive API credentials.'],
      ['MSG32', 'Loyalty rules are not set.'],
    ];
    for (const [code, message] of cases) {
      const client = fakeClient({
        getBalance: vi.fn().mockRejectedValue(new OctaPointError(code, message, 400)),
        getLoyaltyRules: vi.fn().mockRejectedValue(new OctaPointError(code, message, 400)),
      });
      const handlers = createToolHandlers(client);
      for (const result of [await handlers.get_balance({ customer_code: 'CUS999' }), await handlers.get_loyalty_rules()]) {
        expect(result.isError).toBe(true);
        expect(payload(result)).toEqual({ code, message });
      }
    }
  });

  it('turns an unexpected error into MSG23 and does not leak its text', async () => {
    const client = fakeClient({
      listTransactions: vi.fn().mockRejectedValue(new Error('secret-token-123 leaked')),
    });
    const result = await createToolHandlers(client).list_transactions({ customer_code: 'CUS001' });
    expect(result.isError).toBe(true);
    expect(payload(result)).toMatchObject({ code: 'MSG23' });
    expect(JSON.stringify(result)).not.toContain('secret-token-123');
  });
});

describe('configuration (start-up check)', () => {
  const valid = {
    OCTAPOINT_BASE_URL: 'http://localhost:3001',
    OCTAPOINT_API_KEY: 'oct_abc',
    OCTAPOINT_API_SECRET: 'super-secret-value',
  };

  it('accepts the three variables and trims them', () => {
    expect(loadConfig({ ...valid, OCTAPOINT_API_KEY: ' oct_abc ' })).toEqual({
      baseUrl: 'http://localhost:3001',
      apiKey: 'oct_abc',
      apiSecret: 'super-secret-value',
    });
  });

  function messageOf(env: Record<string, string | undefined>): string {
    try {
      loadConfig(env);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      return (error as Error).message;
    }
    throw new Error('loadConfig should have thrown');
  }

  it('names every missing variable in one message', () => {
    const message = messageOf({ OCTAPOINT_API_KEY: 'oct_abc' });
    expect(message).toContain('OCTAPOINT_BASE_URL');
    expect(message).toContain('OCTAPOINT_API_SECRET');
    expect(message).not.toContain('OCTAPOINT_API_KEY');
  });

  it('treats a blank value as missing', () => {
    expect(messageOf({ ...valid, OCTAPOINT_API_SECRET: '   ' })).toContain('OCTAPOINT_API_SECRET');
  });

  it('rejects a base URL that is not http(s) and never prints the secret', () => {
    const message = messageOf({ ...valid, OCTAPOINT_BASE_URL: 'not a url' });
    expect(message).toContain('OCTAPOINT_BASE_URL');
    expect(message).not.toContain('super-secret-value');
  });
});
