import { randomUUID } from 'node:crypto';
import { OctaPointError } from './errors.js';
import { sign } from './signing.js';
import type {
  Balance,
  IssuePointsInput,
  ListTransactionsOptions,
  LoyaltyRules,
  OctaPointClientOptions,
  Page,
  RedeemPointsInput,
  Transaction,
} from './types.js';

// External API client (docs/api-spec.md A and C.2). Every call is signed with HMAC-SHA256 (A.2).
// The SDK never retries by itself: to retry after a timeout, call again with the same idempotencyKey.

const API_PREFIX = '/api/v1';
const DEFAULT_TIMEOUT_MS = 10_000;

interface RawTransaction {
  transaction_id: string;
  type: Transaction['type'];
  customer_code: string;
  points: number;
  balance_after: number;
  status: Transaction['status'];
  sui_digest: string | null;
  explorer_url: string | null;
  reverses_transaction_id: string | null;
  created_at: string;
}

interface RawPage<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

function toTransaction(raw: RawTransaction): Transaction {
  return {
    transactionId: raw.transaction_id,
    type: raw.type,
    customerCode: raw.customer_code,
    points: raw.points,
    balanceAfter: raw.balance_after,
    status: raw.status,
    suiDigest: raw.sui_digest,
    explorerUrl: raw.explorer_url,
    reversesTransactionId: raw.reverses_transaction_id,
    createdAt: raw.created_at,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unexpectedResponse(httpStatus: number): OctaPointError {
  return new OctaPointError('MSG23', 'Unexpected response from the OctaPoint API.', httpStatus);
}

function transportError(error: unknown, timeoutMs: number): OctaPointError {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return new OctaPointError('MSG23', `Request timed out after ${timeoutMs} ms.`, 0, { cause: error });
  }
  const reason = error instanceof Error ? error.message : String(error);
  return new OctaPointError('MSG23', `Could not reach the OctaPoint API: ${reason}`, 0, { cause: error });
}

export class OctaPointClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly timeoutMs: number;

  constructor(options: OctaPointClientOptions) {
    if (!options.baseUrl) throw new TypeError('OctaPointClient: baseUrl is required');
    if (!options.apiKey) throw new TypeError('OctaPointClient: apiKey is required');
    if (!options.apiSecret) throw new TypeError('OctaPointClient: apiSecret is required');
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError('OctaPointClient: timeoutMs must be a positive number');
    }
    try {
      new URL(options.baseUrl);
    } catch {
      throw new TypeError('OctaPointClient: baseUrl is not a valid URL');
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.timeoutMs = timeoutMs;
  }

  /** UC-10. Resolves with the new ISSUE transaction (status PENDING_ANCHOR). */
  async issuePoints(input: IssuePointsInput): Promise<Transaction> {
    const raw = await this.request<RawTransaction>('POST', '/points/issue', {
      body: { customer_code: input.customerCode, amount: input.amount },
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
    });
    return toTransaction(raw);
  }

  /** UC-11. Resolves with the new REDEEM transaction. */
  async redeemPoints(input: RedeemPointsInput): Promise<Transaction> {
    const raw = await this.request<RawTransaction>('POST', '/points/redeem', {
      body: { customer_code: input.customerCode, points: input.points },
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
    });
    return toTransaction(raw);
  }

  /** UC-12. The code is sent as given: the API is strict about case (a lower-case code answers MSG33). */
  async getBalance(customerCode: string): Promise<Balance> {
    const raw = await this.request<{ customer_code: string; balance: number }>(
      'GET',
      `/customers/${encodeURIComponent(customerCode)}/balance`,
    );
    return { customerCode: raw.customer_code, balance: raw.balance };
  }

  /** UC-13. Newest first, 20 per page. */
  async listTransactions(
    customerCode: string,
    options: ListTransactionsOptions = {},
  ): Promise<Page<Transaction>> {
    const query = new URLSearchParams();
    if (options.page !== undefined) query.set('page', String(options.page));
    if (options.type !== undefined) query.set('type', options.type);
    if (options.status !== undefined) query.set('status', options.status);
    if (options.dateFrom !== undefined) query.set('date_from', options.dateFrom);
    if (options.dateTo !== undefined) query.set('date_to', options.dateTo);
    const raw = await this.request<RawPage<RawTransaction>>(
      'GET',
      `/customers/${encodeURIComponent(customerCode)}/transactions`,
      { query },
    );
    return {
      items: raw.items.map(toTransaction),
      page: raw.page,
      pageSize: raw.page_size,
      total: raw.total,
    };
  }

  /** Should-have (used by the MCP tool get_loyalty_rules). MSG32 when the Owner has not saved rules yet. */
  async getLoyaltyRules(): Promise<LoyaltyRules> {
    const raw = await this.request<{ earn_ratio: number; min_redemption_threshold: number }>(
      'GET',
      '/loyalty-rules',
    );
    return { earnRatio: raw.earn_ratio, minRedemptionThreshold: raw.min_redemption_threshold };
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options: { query?: URLSearchParams; body?: unknown; idempotencyKey?: string } = {},
  ): Promise<T> {
    const queryText = options.query?.toString() ?? '';
    const url = new URL(`${this.baseUrl}${API_PREFIX}${path}${queryText ? `?${queryText}` : ''}`);
    // Sign the target exactly as fetch will send it (path + query of the serialized URL).
    const target = url.pathname + url.search;
    const body = options.body === undefined ? '' : JSON.stringify(options.body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const idempotencyKey = options.idempotencyKey;

    const signature = sign(this.apiSecret, {
      timestamp,
      method,
      target,
      body,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    });

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-API-Key': this.apiKey,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
    };
    if (method === 'POST') headers['Content-Type'] = 'application/json';
    if (idempotencyKey !== undefined) headers['X-Idempotency-Key'] = idempotencyKey;

    let status: number;
    let ok: boolean;
    let text: string;
    try {
      const response = await fetch(url, {
        method,
        headers,
        ...(body === '' ? {} : { body }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      status = response.status;
      ok = response.ok;
      text = await response.text();
    } catch (error) {
      throw transportError(error, this.timeoutMs);
    }

    let parsed: unknown;
    try {
      parsed = text === '' ? undefined : JSON.parse(text);
    } catch {
      parsed = undefined;
    }

    if (!ok) {
      // CR-06 body: { code, message } (MSG17 adds server_time). Anything else is not from our API.
      if (isRecord(parsed) && typeof parsed.code === 'string') {
        const serverTime =
          parsed.code === 'MSG17' && typeof parsed.server_time === 'number' ? parsed.server_time : undefined;
        const message =
          typeof parsed.message === 'string' ? parsed.message : `Request failed with code ${parsed.code}.`;
        throw new OctaPointError(parsed.code, message, status, { serverTime });
      }
      throw unexpectedResponse(status);
    }

    if (parsed === undefined) throw unexpectedResponse(status);
    return parsed as T;
  }
}
