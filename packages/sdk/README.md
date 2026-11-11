# @octapoint/sdk

TypeScript SDK for the OctaPoint external API (`docs/api-spec.md` surface A and C.2). Node.js 20+.
It signs every request with HMAC-SHA256 (A.2), adds the idempotency key for issue and redeem, and turns
API errors into `OctaPointError`. It is not published to npm (LI-10): use it from this monorepo.

**Server side only.** The API secret must never reach a browser or a mobile app.

## Use

```ts
import { OctaPointClient, OctaPointError } from '@octapoint/sdk';

const client = new OctaPointClient({
  baseUrl: 'http://localhost:3001', // origin only; the SDK adds /api/v1
  apiKey: process.env.OCTAPOINT_API_KEY!,
  apiSecret: process.env.OCTAPOINT_API_SECRET!,
  // timeoutMs: 10000,
});

const issued = await client.issuePoints({ customerCode: 'CUS001', amount: 150000 });
const redeemed = await client.redeemPoints({ customerCode: 'CUS001', points: 50 });
const { balance } = await client.getBalance('CUS001');
const page = await client.listTransactions('CUS001', { page: 1, type: 'ISSUE', dateFrom: '2026-11-01' });
```

| Call | Result |
|---|---|
| `issuePoints({ customerCode, amount, idempotencyKey? })` | `Transaction` |
| `redeemPoints({ customerCode, points, idempotencyKey? })` | `Transaction` |
| `getBalance(customerCode)` | `{ customerCode, balance }` |
| `listTransactions(customerCode, { page?, type?, status?, dateFrom?, dateTo? })` | `Page<Transaction>` (20 per page, newest first) |
| `getLoyaltyRules()` | `{ earnRatio, minRedemptionThreshold }` (`MSG32` when the Owner has not saved rules) |

Field names are camelCase (`transactionId`, `balanceAfter`, `suiDigest`, `explorerUrl` ...). A transaction is
`PENDING_ANCHOR` until the worker writes it to Sui; `suiDigest` and `explorerUrl` are then filled.

The customer code is sent exactly as given. The API is strict: a lower-case code answers `MSG33`.

## Idempotency and retries

`issuePoints` and `redeemPoints` add `X-Idempotency-Key` (a new `crypto.randomUUID()` unless you pass
`idempotencyKey`), and the key is part of the signature. The SDK **never retries by itself**. After a timeout you
do not know whether the transaction was created, so call again with the **same** `idempotencyKey`: the server
returns the saved result and never creates a second transaction.

```ts
const key = crypto.randomUUID(); // keep it with your own order id
try {
  await client.issuePoints({ customerCode: 'CUS001', amount: 150000, idempotencyKey: key });
} catch (error) {
  if (error instanceof OctaPointError && error.httpStatus === 0) {
    await client.issuePoints({ customerCode: 'CUS001', amount: 150000, idempotencyKey: key }); // safe retry
  } else throw error;
}
```

The same key with a different body is `MSG34`.

## Errors

Every failure throws `OctaPointError { code, message, httpStatus, serverTime? }`.

- API error: `code` is the message code (`MSG08` ...), `message` the server text, `httpStatus` the HTTP status.
- `MSG17` (timestamp outside ±300 s): `serverTime` is the server clock in Unix seconds. Compare it with
  `Math.floor(Date.now() / 1000)` to see how far your clock is off.
- No usable answer (timeout, connection refused, proxy error page): `code` is `MSG23`. `httpStatus` is `0` when
  nothing came back, otherwise the status of the answer.
- Wrong options in `new OctaPointClient(...)` throw a plain `TypeError`.

Useful codes: `MSG18` unknown, suspended or revoked key (or suspended merchant), `MSG16` wrong signature or
wrong secret, `MSG22` unknown customer, `MSG32` loyalty rules not set, `MSG08` balance too low, `MSG09` below the
minimum redemption.

## Run the sample against a local API

1. Start the database and the API (`docker compose up -d db`, `pnpm --filter api migrate`, `pnpm --filter api dev`).
2. In the portal, as an approved merchant Owner: save the loyalty rules (without them issue answers `MSG32`),
   add a customer, and create an API key. Copy the key id and the secret now; the secret is shown once.
3. Run (PowerShell):

```powershell
$env:OCTAPOINT_BASE_URL = "http://localhost:3001"
$env:OCTAPOINT_API_KEY = "oct_..."
$env:OCTAPOINT_API_SECRET = "..."
$env:OCTAPOINT_CUSTOMER_CODE = "CUS001"
pnpm --filter @octapoint/sdk example
```

Expected: the balance before, the issued transaction (`PENDING_ANCHOR`), `Retry returned the same transaction: true`,
the balance after (raised once, not twice), and the latest transactions. After the anchoring worker has run
the same transaction shows `ANCHORED` with an Explorer link.

## Test

```
pnpm --filter @octapoint/sdk test
pnpm --filter @octapoint/sdk typecheck
```

`test/signing.test.ts` checks the three vectors of `api-spec.md` A.2. `test/client.test.ts` checks that the
client sends the same signature on the wire (vectors 1 and 2), keys, errors, `serverTime` and timeouts, with
`fetch` replaced by a mock.
