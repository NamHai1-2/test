import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createToolHandlers, type ReadOnlyClient, type ToolHandlers } from './tools.js';

const customerCode = z
  .string()
  .describe('Customer code of the merchant, for example CUS001. Spaces and lower case are accepted.');

/** Registers the three read-only tools (api-spec C.1). Nothing else is ever registered (BR-14). */
export function registerTools(server: McpServer, handlers: ToolHandlers): void {
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  server.registerTool(
    'get_balance',
    {
      title: 'Get customer balance',
      description: 'Returns the current point balance of one customer: { customer_code, balance }.',
      inputSchema: { customer_code: customerCode },
      annotations: readOnly,
    },
    (args) => handlers.get_balance(args),
  );

  server.registerTool(
    'list_transactions',
    {
      title: 'List recent transactions',
      description:
        'Returns the latest 10 transactions of one customer, newest first: ' +
        '[{ transaction_id, type, points, status, sui_digest }]. sui_digest is null until the transaction is anchored on Sui.',
      inputSchema: { customer_code: customerCode },
      annotations: readOnly,
    },
    (args) => handlers.list_transactions(args),
  );

  server.registerTool(
    'get_loyalty_rules',
    {
      title: 'Get loyalty rules',
      description:
        'Returns the merchant loyalty rules: { earn_ratio (VND per point), min_redemption_threshold (points) }.',
      annotations: readOnly,
    },
    () => handlers.get_loyalty_rules(),
  );
}

export function createServer(client: ReadOnlyClient): McpServer {
  const server = new McpServer({ name: 'octapoint', version: '0.1.0' });
  registerTools(server, createToolHandlers(client));
  return server;
}
