import { OctaPointError } from '@octapoint/sdk';
import type { Balance, LoyaltyRules, Page, Transaction } from '@octapoint/sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Tool logic of the MCP server (SRS 3.2.4.1, api-spec C.1, BR-14). No MCP types are needed here except the result
// shape, so everything can be tested with a fake client.

/**
 * The ONLY tools of the server. They are read-only (BR-14). Adding a name here must be a conscious scope decision:
 * tools.test.ts fails for any other name and for names that suggest a write.
 */
export const TOOL_NAMES = ['get_balance', 'list_transactions', 'get_loyalty_rules'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** `list_transactions` returns the latest 10 (the first 10 items of page 1, newest first). */
export const TRANSACTION_LIMIT = 10;

/**
 * The part of the SDK client that the tools may use. It lists read methods only: a tool that issues, redeems or
 * changes anything has no method to call.
 */
export interface ReadOnlyClient {
  getBalance(customerCode: string): Promise<Balance>;
  listTransactions(customerCode: string): Promise<Page<Transaction>>;
  getLoyaltyRules(): Promise<LoyaltyRules>;
}

export interface CustomerArgs {
  customer_code: string;
}

export interface ToolHandlers {
  get_balance(args: CustomerArgs): Promise<CallToolResult>;
  list_transactions(args: CustomerArgs): Promise<CallToolResult>;
  get_loyalty_rules(): Promise<CallToolResult>;
}

/** AI assistants often send lower case or spaces; the API itself stays strict (lower case answers MSG33). */
export function normalizeCustomerCode(value: string): string {
  return value.trim().toUpperCase();
}

function success(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function failure(code: string, message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ code, message }) }] };
}

/** API errors keep their original code and message (MSG18, MSG22 ...). Anything else becomes MSG23 without details. */
function toFailure(error: unknown): CallToolResult {
  if (error instanceof OctaPointError) return failure(error.code, error.message);
  return failure('MSG23', 'Unexpected error while calling the OctaPoint API.');
}

async function run(action: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return success(await action());
  } catch (error) {
    return toFailure(error);
  }
}

export function createToolHandlers(client: ReadOnlyClient): ToolHandlers {
  return {
    async get_balance(args) {
      const code = normalizeCustomerCode(args.customer_code);
      if (code === '') return failure('MSG33', 'customer_code must not be empty.');
      return run(async () => {
        const result = await client.getBalance(code);
        return { customer_code: result.customerCode, balance: result.balance };
      });
    },

    async list_transactions(args) {
      const code = normalizeCustomerCode(args.customer_code);
      if (code === '') return failure('MSG33', 'customer_code must not be empty.');
      return run(async () => {
        const page = await client.listTransactions(code);
        return page.items.slice(0, TRANSACTION_LIMIT).map((item) => ({
          transaction_id: item.transactionId,
          type: item.type,
          points: item.points,
          status: item.status,
          sui_digest: item.suiDigest,
        }));
      });
    },

    async get_loyalty_rules() {
      return run(async () => {
        const rules = await client.getLoyaltyRules();
        return { earn_ratio: rules.earnRatio, min_redemption_threshold: rules.minRedemptionThreshold };
      });
    },
  };
}
