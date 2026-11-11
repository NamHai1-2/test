import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { OctaPointClient } from '@octapoint/sdk';
import { ConfigError, loadConfig, type McpConfig } from './config.js';
import { createServer } from './server.js';

// OctaPoint MCP server (task T15, docs/api-spec.md C.1, BR-14): stdio, read-only tools only.
// stdout carries the MCP protocol, so every message for humans goes to stderr. The API secret is never printed.

async function main(): Promise<void> {
  let config: McpConfig;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const client = new OctaPointClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
  });

  await createServer(client).connect(new StdioServerTransport());
  console.error(`OctaPoint MCP server ready (stdio, read-only). API: ${config.baseUrl}`);
}

main().catch((error: unknown) => {
  console.error('OctaPoint MCP server stopped:', error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
});
