// Configuration of the MCP server: three environment variables, nothing else (api-spec C.1).

export const ENV_NAMES = ['OCTAPOINT_BASE_URL', 'OCTAPOINT_API_KEY', 'OCTAPOINT_API_SECRET'] as const;

export interface McpConfig {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
}

/** Start-up problem with a message that is safe to print: it never contains a value, only variable names. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: Record<string, string | undefined>): McpConfig {
  const value = (name: (typeof ENV_NAMES)[number]): string => (env[name] ?? '').trim();

  const missing = ENV_NAMES.filter((name) => value(name) === '');
  if (missing.length > 0) {
    throw new ConfigError(
      `OctaPoint MCP server cannot start. Missing environment variable${missing.length > 1 ? 's' : ''}: ` +
        `${missing.join(', ')}. Set them in the configuration of your MCP client (see packages/mcp/README.md).`,
    );
  }

  const baseUrl = value('OCTAPOINT_BASE_URL');
  let protocol: string;
  try {
    protocol = new URL(baseUrl).protocol;
  } catch {
    protocol = '';
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new ConfigError(
      'OctaPoint MCP server cannot start. OCTAPOINT_BASE_URL must be the origin of the API, ' +
        'for example http://localhost:3001.',
    );
  }

  return { baseUrl, apiKey: value('OCTAPOINT_API_KEY'), apiSecret: value('OCTAPOINT_API_SECRET') };
}
