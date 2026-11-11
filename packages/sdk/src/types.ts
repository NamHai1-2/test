export type TransactionType = 'ISSUE' | 'REDEEM' | 'REVERSAL';
export type TransactionStatus = 'PENDING_ANCHOR' | 'ANCHORED' | 'FAILED';

/** Transaction object of api-spec section 0, with camelCase names. */
export interface Transaction {
  transactionId: string;
  type: TransactionType;
  customerCode: string;
  points: number;
  balanceAfter: number;
  status: TransactionStatus;
  /** Sui transaction digest; null until the transaction is ANCHORED. */
  suiDigest: string | null;
  /** Sui Explorer link; null unless the transaction is ANCHORED. */
  explorerUrl: string | null;
  reversesTransactionId: string | null;
  /** ISO 8601 UTC, for example "2026-11-01T03:15:42.123Z". */
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Balance {
  customerCode: string;
  balance: number;
}

/** Loyalty rules of the merchant (GET /loyalty-rules, api-spec A.3). */
export interface LoyaltyRules {
  /** VND per point. */
  earnRatio: number;
  /** Smallest number of points that can be redeemed. */
  minRedemptionThreshold: number;
}

export interface OctaPointClientOptions {
  /** Origin of the API, for example "http://localhost:3001". "/api/v1" is added by the SDK. */
  baseUrl: string;
  /** Key id, for example "oct_3f9a...". */
  apiKey: string;
  /** API secret. Never logged, never sent. */
  apiSecret: string;
  /** Request timeout in milliseconds. Default 10000. */
  timeoutMs?: number;
}

export interface IssuePointsInput {
  customerCode: string;
  /** Bill amount, integer VND, 1 to 1,000,000,000. */
  amount: number;
  /** Pass the same value again to retry safely after a timeout. Default: a new random UUID. */
  idempotencyKey?: string;
}

export interface RedeemPointsInput {
  customerCode: string;
  /** Points to redeem, 1 to 1,000,000. */
  points: number;
  /** Pass the same value again to retry safely after a timeout. Default: a new random UUID. */
  idempotencyKey?: string;
}

export interface ListTransactionsOptions {
  /** Integer >= 1. Default 1. Page size is fixed at 20. */
  page?: number;
  type?: TransactionType;
  status?: TransactionStatus;
  /** YYYY-MM-DD, interpreted in UTC+7, inclusive. */
  dateFrom?: string;
  /** YYYY-MM-DD, interpreted in UTC+7, inclusive. */
  dateTo?: string;
}
