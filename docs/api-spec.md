# OctaPoint – API Specification

Source of truth: SRS (`PROJECT_REPORT_FIXED.md`). Message codes (`MSGxx`) and business rules (`BR-xx`) are defined there. Table and column names are defined in `db-schema.md`.

Base path for everything: `/api/v1`. All bodies are JSON (UTF-8). All timestamps in responses are ISO 8601 UTC (`2026-11-01T03:15:42.123Z`).

There are three surfaces:

| Surface | Auth | Used by |
|---|---|---|
| A. External API | API key + HMAC-SHA256 | POS / SDK / MCP Server |
| B. Portal API | Session cookie | Web portal (Admin, Owner, Staff) |
| C. MCP tools and SDK | wrap surface A | AI agents, merchant developers |

## 0. Common rules

**Error format (CR-06)** – no stack traces:
```json
{ "code": "MSG08", "message": "Insufficient point balance for this redemption." }
```
`message` is the text from SRS 5.3, with `{placeholders}` filled in. Exception: MSG17 also returns `"server_time": <Unix seconds>` so a client can see how far its clock is off.

**Message code → HTTP status**

| HTTP | Codes |
|---|---|
| 400 | MSG01, MSG33, MSG37 |
| 401 | MSG02, MSG16, MSG17, MSG18, MSG35 |
| 403 | MSG04, MSG15 |
| 404 | MSG22 |
| 409 | MSG25, MSG26, MSG27, MSG31, MSG34, MSG38, MSG40, MSG41 |
| 422 | MSG08, MSG09, MSG24, MSG32, MSG36, MSG39 |
| 500 | MSG23 (any unexpected error; log the detail server-side only) |

**Unknown routes** return HTTP 404 with the CR-06 body `{ "code": "MSG33", "message": "Request data is invalid." }`.

**Pagination** – lists use `page` (default 1; not an integer ≥ 1 → 400 MSG33; a page beyond the last returns empty `items`) and a fixed page size of 20. Transaction lists are ordered by `created_at` newest first, then by `id` descending, so a page never repeats or skips a row when several transactions share the same time. Response shape:
```json
{ "items": [ ... ], "page": 1, "page_size": 20, "total": 134 }
```

**Date filters** (`date_from`, `date_to`, format `YYYY-MM-DD`) are interpreted in UTC+7 and are inclusive (CR-02).

**Sui Explorer link** – the API returns `explorer_url` for `ANCHORED` transactions, built from the env template `SUI_EXPLORER_TX_URL` (see `config-and-deploy.md`). It is `null` for `PENDING_ANCHOR` and `FAILED`.

**Transaction object** (used by several endpoints):
```json
{
  "transaction_id": "TXN-20261101-K7P2M9QX",
  "type": "ISSUE",
  "customer_code": "CUS001",
  "points": 1500,
  "balance_after": 4200,
  "status": "PENDING_ANCHOR",
  "sui_digest": null,
  "explorer_url": null,
  "reverses_transaction_id": null,
  "created_at": "2026-11-01T03:15:42.123Z"
}
```

---

## A. External API (API key + HMAC)

### A.1 Headers

| Header | Required | Value |
|---|---|---|
| `X-API-Key` | all | the key id, e.g. `oct_3f9a…` |
| `X-Timestamp` | all | Unix time in **seconds**, integer string |
| `X-Signature` | all | lowercase hex HMAC-SHA256 (A.2) |
| `X-Idempotency-Key` | `POST /points/issue`, `POST /points/redeem` | 1–128 chars, unique per intended operation (a UUID is recommended). It is part of the signature (A.2). |
| `Content-Type` | POST | `application/json` |

### A.2 Signature (UC-15, BR-08, BR-09)

```
signing_string = X-Timestamp + "." + METHOD + "." + PATH_WITH_QUERY + "." + sha256_hex(raw_body) + "." + IDEMPOTENCY_KEY
X-Signature    = lowercase_hex( HMAC_SHA256(api_secret, signing_string) )
```
- `IDEMPOTENCY_KEY` is the exact value of `X-Idempotency-Key`, or an empty string when the header is not sent (every GET), so the signing string of a GET ends with a `.`. Because the key is signed, replaying a captured POST with a different key fails with MSG16 and cannot create a second transaction.
- `METHOD` is uppercase (`GET`, `POST`).
- `PATH_WITH_QUERY` is the request target exactly as sent, including `/api/v1` and the query string, e.g. `/api/v1/customers/CUS001/transactions?page=2&type=ISSUE`.
- `sha256_hex(raw_body)` is over the exact bytes sent. For requests without a body it is the hash of the empty string `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- The server must compare signatures in constant time.

**Verification order** (stop at the first failure):

| Step | Check | Failure |
|---|---|---|
| 1 | `X-API-Key` present, key exists, key `ACTIVE`, merchant `ACTIVE` | 401 MSG18 |
| 2 | `X-Timestamp` is an integer and within ±300 s of server time | 401 MSG17 |
| 3 | `X-Signature` present and equals the recomputed value | 401 MSG16 |
| 4 | Body/query validation (zod) | 400 MSG33 |
| 5 | Idempotency (POST issue/redeem): header missing → 400 MSG33; see BR-10 and `db-schema.md` §5 | 409 MSG34 on payload mismatch |
| 6 | Business logic | see each endpoint |

**Test vectors** (SDK and server tests must all pass them):
```
secret         : test_secret_do_not_use
timestamp      : 1700000000

1) POST /api/v1/points/issue   body: {"customer_code":"CUS001","amount":150000}
   X-Idempotency-Key : 11111111-1111-4111-8111-111111111111
   sha256(body)   : 2f3a15194661221065981d3607b484d7434e4ca28cd983f1722ac23ce9279eea
   signing_string : 1700000000.POST./api/v1/points/issue.2f3a15194661221065981d3607b484d7434e4ca28cd983f1722ac23ce9279eea.11111111-1111-4111-8111-111111111111
   X-Signature    : a886d990691785c75c8c53da0ce590f06b53debc8d803f558defcd7c51e599e0

2) GET /api/v1/customers/CUS001/transactions?page=2&type=ISSUE   (empty body, no idempotency key)
   signing_string : 1700000000.GET./api/v1/customers/CUS001/transactions?page=2&type=ISSUE.e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
   X-Signature    : d53e51fa1efe9d41097a3a2aa50cd6d982699acbb8e174cb8c828511c990c08c

3) Replay of vector 1 with another key (22222222-2222-4222-8222-222222222222) but the signature of vector 1
   -> must be rejected with MSG16. The correct signature for that key would be:
   X-Signature    : 096ee56092b5ac5514efd58cbb1ba62292ba2200520c520501ab05b33365e912
```

### A.3 Endpoints

**POST /api/v1/points/issue** (UC-10, BR-17, BR-22)
- Body: `{ "customer_code": "CUS001", "amount": 150000 }` (`amount` = bill amount, integer VND, 1–1,000,000,000).
- Success **201**: transaction object with `type: "ISSUE"`, `status: "PENDING_ANCHOR"` (MSG06 text is for the portal toast only).
- Errors: MSG22 (unknown customer), MSG39 (inactive), MSG32 (rules not set), MSG24 (0 points), MSG33 (invalid data; calculated points above 1,000,000; or new balance above 1,000,000,000). Check order: MSG22, MSG39, MSG32, MSG24, then the MSG33 ceilings.

**POST /api/v1/points/redeem** (UC-11)
- Body: `{ "customer_code": "CUS001", "points": 500 }` (1–1,000,000).
- Success **201**: transaction object with `type: "REDEEM"`.
- Errors: MSG22, MSG39, MSG32, MSG09 (below minimum, checked first), MSG08 (insufficient balance), MSG33.

**GET /api/v1/customers/{code}/balance** (UC-12)
- Success **200**: `{ "customer_code": "CUS001", "balance": 4200 }`. Inactive customers still return their balance.
- Errors: MSG22.

**GET /api/v1/customers/{code}/transactions** (UC-13)
- Query: `page`, `type` (`ISSUE|REDEEM|REVERSAL`), `status` (`PENDING_ANCHOR|ANCHORED|FAILED`), `date_from`, `date_to`.
- Success **200**: paginated list of transaction objects, newest first.
- Errors: MSG22, MSG33 (bad filter value).

**GET /api/v1/loyalty-rules** (Should, for MCP `get_loyalty_rules`)
- Success **200**: `{ "earn_ratio": 10000, "min_redemption_threshold": 50 }`. Errors: MSG32 if rules are not set.

---

## B. Portal API (session cookie)

### B.1 Session

- Cookie `octapoint_session`: random 32-byte token (base64url), `HttpOnly; Secure; SameSite=Lax; Path=/`, 8-hour lifetime (BR-19). The DB stores only `sha256(token)` in `sessions`.
- On **every** request the server checks: session not revoked and not expired, user `is_active`, and (for merchant users) merchant `ACTIVE`. Otherwise respond 401 MSG35 and the portal redirects to Login.
- The portal calls the API through a same-origin proxy (`/api/*` rewritten to the backend) so the cookie is first-party. See `config-and-deploy.md`.
- Portal requests that change state must send the header `X-Requested-With: octapoint-portal` (cheap CSRF guard together with `SameSite=Lax`). Requests without it → 403 MSG04.
- Role check happens after the session check. Not allowed → 403 MSG04 (CR-03). Merchant users only ever see their own `merchant_id` data (BR-01); the id is taken from the session, never from the request.

### B.2 Authentication and account

| Endpoint | Roles | Request → Response |
|---|---|---|
| `POST /auth/register` (UC-18, public) | – | `{business_name, owner_name, email, password}` → **201** MSG30. Creates a `PENDING` merchant (`MCH-` code) and a `MERCHANT_OWNER` user. Errors: MSG01, MSG31, MSG37. |
| `POST /auth/login` (UC-01, public) | – | `{email, password}` → **200** `{ user: {id, full_name, email, role}, redirect }` and sets the cookie (MSG03). `redirect` = `/admin` for Admin, `/dashboard` for Owner, `/customers` for Staff. Order: verify email + BCrypt first (wrong, or user inactive → 401 MSG02, same message); then merchant status (not `ACTIVE` → 403 MSG15). |
| `POST /auth/logout` | any | **204**. Revokes the session. |
| `GET /auth/me` | any | **200** `{id, full_name, email, role, merchant: {code, name, status} \| null}` |
| `POST /auth/change-password` (UC-02) | any | `{current_password, new_password}` → **200** (MSG29). Errors: MSG36 (wrong current), MSG37 (policy CR-08). Revokes the user's other sessions. Audit `PASSWORD_CHANGED`. |

### B.3 Admin (role `ADMIN`)

| Endpoint | Behaviour |
|---|---|
| `GET /admin/dashboard` (UC-03) | **200** `{ merchants: {total, pending, active, suspended}, total_customers, points_issued, points_redeemed }` (queries in `db-schema.md` §6). |
| `GET /admin/merchants?status=&page=` | Paginated: `{id, code, name, owner_email, status, created_at}`. |
| `POST /admin/merchants/{id}/approve` (UC-04) | Allowed from `PENDING` or `SUSPENDED` → `ACTIVE`; sets this merchant's `SUSPENDED` API keys back to `ACTIVE` (never touches `REVOKED`). **200** MSG13. Audit `MERCHANT_APPROVED`. |
| `POST /admin/merchants/{id}/suspend` | Allowed only from `ACTIVE` → `SUSPENDED`; sets its `ACTIVE` keys to `SUSPENDED`. **200** MSG14. Audit `MERCHANT_SUSPENDED`. Any other transition → 400 MSG33. |
| `GET /admin/ledger` (UC-13, read-only) | Same filters as the merchant ledger plus `merchant_code`; items add `merchant_code`. |

### B.4 Merchant (roles `MERCHANT_OWNER`, `MERCHANT_STAFF` unless noted)

| Endpoint | Roles | Behaviour |
|---|---|---|
| `GET /merchant/dashboard` (UC-05) | Owner | `{ total_customers, circulating_points, today_transactions }` |
| `GET /merchant/rules` | Owner | `{earn_ratio, min_redemption_threshold}` or `{}` if not set |
| `PUT /merchant/rules` (UC-06) | Owner | Body `{earn_ratio, min_redemption_threshold}` (positive integers ≤ 1,000,000, BR-07) → **200** MSG05. Upsert; audit `RULE_UPDATED` (old and new values in `details`). Applies to later transactions only (BR-22). |
| `GET /merchant/api-keys` | Owner | List: `{id, masked_key_id, status, created_at}` (masked = first 8 and last 4 chars). |
| `POST /merchant/api-keys` (UC-07) | Owner | **201** `{id, key_id, secret}` (MSG10, MSG11). The secret appears only in this response. Errors: MSG40 (already 5 `ACTIVE`/`SUSPENDED` keys). Audit `API_KEY_CREATED`. |
| `POST /merchant/api-keys/{id}/revoke` | Owner | → `REVOKED` permanently. **200** MSG12. Audit `API_KEY_REVOKED`. |
| `GET /merchant/staff` | Owner | List staff of the merchant. |
| `POST /merchant/staff` (UC-08) | Owner | `{full_name, email, initial_password}` → **201** MSG28. Errors: MSG31, MSG37. Audit `STAFF_CREATED`. |
| `POST /merchant/staff/{id}/deactivate` | Owner | `is_active=false`, revokes the user's sessions. **200**. Audit `STAFF_DEACTIVATED`. (No delete, no reactivation.) |
| `GET /merchant/customers?q=&page=` | both | Search by code, name or phone. Item: `{id, customer_code, name, phone, balance, is_active}`. |
| `POST /merchant/customers` (UC-09) | both | `{customer_code, name, phone?}` → **201** MSG28, balance 0. Errors: MSG27 (code exists), MSG38 (phone exists), MSG01, MSG33 (code not `^[A-Z0-9]{1,32}$`, phone not 10 digits starting with 0). |
| `PATCH /merchant/customers/{code}` | both | `{name?, phone?}` → **200** MSG29. The code cannot be changed. |
| `POST /merchant/customers/{code}/deactivate` and `/reactivate` | Owner | **200**. Audit `CUSTOMER_DEACTIVATED` / `CUSTOMER_REACTIVATED`. |
| `POST /merchant/customers/{code}/issue` | both | Body `{amount}`; **requires** `X-Idempotency-Key` (the portal generates one UUID per dialog submit; scope = the logged-in user). Same logic and errors as A `issue`. **201** → toast MSG06, then MSG20. |
| `POST /merchant/customers/{code}/redeem` | both | Body `{points}`; same as above. **201** → toast MSG07 (`{points}`, `{new_balance}`), then MSG20. |
| `GET /merchant/ledger` (UC-13) | both | Filters `type`, `status`, `date_from`, `date_to`, `customer_code`, `page`. Item = transaction object plus `bill_amount`, `performed_by: {kind: "USER"\|"API_KEY", label}`, `reversible` (true when type is `ISSUE`/`REDEEM` and not yet reversed; computed for Owner only). |
| `POST /merchant/ledger/{transaction_id}/reverse` (UC-14) | Owner | No body. **201** `{reversal: <transaction object>}` → toast MSG19. Errors: MSG26 (not reversible or already reversed), MSG25 (reversing an ISSUE would make balance negative), MSG41 (reversing a REDEEM would push the balance above 1,000,000,000), MSG22. Works for an inactive customer too. Audit `REVERSAL_CREATED`. |

`{id}` in paths is a UUID; `{code}` is the `customer_code`.

---

## C. MCP Server and SDK

### C.1 MCP tools (read-only, BR-14)

Transport: stdio (JSON-RPC). Configuration via environment: `OCTAPOINT_BASE_URL`, `OCTAPOINT_API_KEY`, `OCTAPOINT_API_SECRET`. The server signs requests exactly like the SDK (it reuses the SDK) and exposes **only** these tools:

| Tool | Input | Output | Backing call |
|---|---|---|---|
| `get_balance` | `{customer_code: string}` | `{customer_code, balance}` | A `balance` |
| `list_transactions` | `{customer_code: string}` | latest 10, newest first: `{transaction_id, type, points, status, sui_digest}` | A `transactions` (`page=1`, first 10 items) |
| `get_loyalty_rules` (Should) | `{}` | `{earn_ratio, min_redemption_threshold}` | A `loyalty-rules` |

The server trims and upper-cases `customer_code` before the call (the API itself stays strict: lower case → MSG33). API errors are returned as MCP tool errors with the original `code` and `message` (invalid credentials → MSG18, unknown customer → MSG22). No write tool may ever be registered.

### C.2 TypeScript SDK (Node.js 20+)

```ts
const client = new OctaPointClient({ baseUrl, apiKey, apiSecret, timeoutMs?: 10000 });

client.issuePoints({ customerCode, amount, idempotencyKey? })      // → Transaction
client.redeemPoints({ customerCode, points, idempotencyKey? })     // → Transaction
client.getBalance(customerCode)                                    // → { customerCode, balance }
client.listTransactions(customerCode, { page?, type?, status?, dateFrom?, dateTo? }) // → Page<Transaction>
client.getLoyaltyRules()                                           // → { earnRatio, minRedemptionThreshold } (Should, for the MCP tool)
```
- Every call adds `X-API-Key`, `X-Timestamp`, `X-Signature` (A.2). For issue/redeem it adds `X-Idempotency-Key` (`crypto.randomUUID()` unless supplied); the key is part of the signature.
- The SDK does **not** retry automatically. To retry safely after a timeout, the caller passes the same `idempotencyKey` again.
- Errors throw `OctaPointError { code: 'MSG08', message, httpStatus, serverTime? }` (`serverTime` only for MSG17).
- Must pass the test vectors in A.2.
