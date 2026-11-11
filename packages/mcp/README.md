# @octapoint/mcp

Read-only MCP server for OctaPoint (`docs/api-spec.md` C.1, SRS 3.2.4.1). It lets an AI assistant such as Claude Desktop read
the **balance** and the **latest transactions** of a customer of one merchant. It runs on your own machine over stdio
and uses `@octapoint/sdk`, so it signs every request like any other client (HMAC, A.2).

**No tool can change data (BR-14).** Only these tools exist:

| Tool | Input | Output |
|---|---|---|
| `get_balance` | `{ customer_code }` | `{ customer_code, balance }` |
| `list_transactions` | `{ customer_code }` | the latest 10, newest first: `[{ transaction_id, type, points, status, sui_digest }]` (`sui_digest` is `null` until the transaction is anchored) |
| `get_loyalty_rules` (Should) | none | `{ earn_ratio, min_redemption_threshold }` |

`customer_code` is trimmed and upper-cased by the server (`" cus001 "` becomes `CUS001`), because assistants often send lower case.
The API itself stays strict.

API errors come back as MCP tool errors with the original code and message, for example `{"code":"MSG22","message":"..."}`
(unknown customer) or `MSG18` (unknown, revoked or suspended key). `MSG32` from `get_loyalty_rules` means the Owner has not saved rules yet.
An error that is not an API error becomes `MSG23`.

## Configuration

Three environment variables (set by the MCP client, see below). The server stops at start-up and names the missing ones.

| Variable | Example |
|---|---|
| `OCTAPOINT_BASE_URL` | `http://localhost:3001` (origin only, no `/api/v1`) |
| `OCTAPOINT_API_KEY` | `oct_...` (key id from the portal, page API Keys) |
| `OCTAPOINT_API_SECRET` | the secret shown once when the key was created |

The secret is never printed or logged. Use a key of the merchant whose data the assistant may read; the server sees only that merchant (BR-01).

## Run with Claude Desktop

1. Start the API (`pnpm --filter api dev`) and make sure the merchant has a customer and an API key.
2. Open `claude_desktop_config.json` (Claude Desktop → Settings → Developer → Edit Config) and add the server.
   Use the path of your clone; on Windows write `\\` in JSON strings.

```json
{
  "mcpServers": {
    "octapoint": {
      "command": "pnpm",
      "args": ["-C", "D:\\path\\to\\octapoint", "--silent", "--filter", "@octapoint/mcp", "start"],
      "env": {
        "OCTAPOINT_BASE_URL": "http://localhost:3001",
        "OCTAPOINT_API_KEY": "oct_REPLACE_ME",
        "OCTAPOINT_API_SECRET": "REPLACE_ME"
      }
    }
  }
}
```

`--silent` matters: stdout carries the MCP protocol, and pnpm would otherwise print its own header lines into it.

3. Restart Claude Desktop. The tools `get_balance`, `list_transactions` and `get_loyalty_rules` appear in the tools list.
4. Ask, for example: "What is the balance of customer cus001?" or "Show the last transactions of CUS001".

## Try it without Claude Desktop

```bash
OCTAPOINT_BASE_URL=http://localhost:3001 OCTAPOINT_API_KEY=oct_... OCTAPOINT_API_SECRET=... \
  npx @modelcontextprotocol/inspector pnpm --silent --filter @octapoint/mcp start
```

(PowerShell: set the three variables with `$env:NAME = "value"` first.) The inspector lists the tools and lets you call them.

## Tests

```bash
pnpm --filter @octapoint/mcp test
pnpm --filter @octapoint/mcp typecheck
```

`test/tools.test.ts` asserts the exact tool list, that no tool name suggests a write, the upper-casing of the customer code,
the output mapping, the error pass-through and the start-up check of the environment variables.

Layout: `src/tools.ts` (tool logic, testable with a fake client), `src/server.ts` (registers the tools),
`src/config.ts` (environment), `src/index.ts` (stdio entry point). Remote (HTTP) transport is out of scope.
