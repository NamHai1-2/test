# OctaPoint – Configuration, Project Layout and Deployment

Stack is fixed by the SRS (6.3 Tools): Next.js + TypeScript + Tailwind + shadcn/ui (frontend), Node.js 20+ + TypeScript + Hono (backend), PostgreSQL 16+, Sui Testnet with Move and `@mysten/sui`, MCP SDK. Items marked *(recommended)* are free choices that the SRS does not fix.

## 1. Repository layout (monorepo, pnpm workspaces *(recommended)*)

```
octapoint/
  CLAUDE.md                 rules for developers and AI assistants
  docker-compose.yml        local PostgreSQL 16 (development and tests)
  tsconfig.base.json  eslint.config.mjs  .prettierrc  .editorconfig  .nvmrc
  .github/workflows/ci.yml  lint + typecheck + tests against a PostgreSQL service
  docs/                     SRS + this documentation set
  apps/
    api/                    Hono backend, anchoring worker, migrations, seed script
      src/
        index.ts  app.ts    server start-up and the Hono app (health, error handler, request id)
        env.ts  config.ts   root .env loading and validated configuration
        routes/             external/ (surface A) and portal/ (surface B)        [from T02/T09]
        services/           points, ledger, auth, merchants, apikeys, idempotency, anchoring [from T02]
        db/                 client.ts, migrate.ts, migrations/0001_init.sql
        lib/                messages, errors, logger, hmac, request-target, password, password-policy, prompt
                            (later: crypto AES-GCM, proof-hash, codes)
        scripts/            seed-admin.ts, reset-password.ts
      test/
        unit/               tests that need no database
        db/                 tests that need PostgreSQL (each file gets a throw-away database)
        helpers/            createTestDatabase(), seed helpers
    web/                    Next.js portal (App Router)
  packages/
    sdk/                    TypeScript SDK (not published to npm, LI-10)
    mcp/                    MCP server (stdio), uses packages/sdk
  contracts/
    anchor/                 Move package (Move.toml, sources/anchor.move, tests/)
```

Suggested libraries *(recommended)*: `zod` (validation), `postgres` or `pg` (plain SQL, no heavy ORM so row locks and triggers stay explicit), `bcryptjs` (BCrypt), `vitest` (tests), `@modelcontextprotocol/sdk`, `@mysten/sui`.

Central files that must exist in `apps/api/src/lib`:
- `messages.ts` – every `MSGxx` code with its text and HTTP status (single source, matches SRS 5.3 and `api-spec.md`).
- `errors.ts` – `AppError(code)`; the global error handler turns it into `{code, message}` and turns anything else into MSG23.

## 2. Environment variables

### API (`apps/api`)

| Variable | Required | Example / default | Purpose |
|---|---|---|---|
| `NODE_ENV` | yes | `production` | |
| `PORT` | no | `3001` | |
| `DATABASE_URL` | yes | `postgres://user:pass@host:5432/octapoint` | PostgreSQL 16+ |
| `TEST_DATABASE_URL` | tests only | `postgres://octapoint:octapoint@localhost:5433/postgres` | Server on which each DB test file creates and drops its own database |
| `SECRET_ENCRYPTION_KEY` | yes | 32 random bytes, base64 | Master key for API secrets, AES-256-GCM (CR-07). Generate once; losing it makes all secrets unreadable. |
| `SUI_RPC_URL` | yes | `https://fullnode.testnet.sui.io:443` | Testnet RPC (LI-02) |
| `SUI_GRAPHQL_URL` | yes | `https://graphql.testnet.sui.io/graphql` |  |
| `SUI_PRIVATE_KEY` | worker | `suiprivkey…` | Platform wallet (BR-13) |
| `SUI_PACKAGE_ID` | worker | `0x…` | Published `anchor` package |
| `SUI_REGISTRY_ID` | worker | `0x…` | `AnchorRegistry` object |
| `SUI_EXPLORER_TX_URL` | no | `https://suiscan.xyz/testnet/tx/{digest}` | Link template for ledger digests |
| `ENABLE_ANCHOR_WORKER` | no | `false` | `true` on **exactly one** instance |
| `ANCHOR_INTERVAL_SECONDS` | no | `30` | SRS 3.2.5.3 |
| `ANCHOR_BATCH_SIZE` | no | `20` | Rows per run |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | seed only | | Used only by `pnpm --filter api seed:admin` (LI-14) |

Constants in code (not env): business time zone `Asia/Ho_Chi_Minh` (UTC+7), timestamp window 300 s, session lifetime 8 h, idempotency window 24 h, page size 20, max 5 API keys per merchant, anchoring retry delay after a temporary infrastructure error 5 min.

### Web (`apps/web`)
| Variable | Example | Purpose |
|---|---|---|
| `API_BASE_URL` | `https://octapoint-api.onrender.com` | Target of the `/api/*` proxy rewrite |
| `NEXT_PUBLIC_USE_MOCKS` | `false` | `true` runs the portal on in-memory demo data (`src/lib/mocks.ts`) with no API or database; demo logins are listed on the login page. Never `true` in production |

### MCP server and SDK samples
`OCTAPOINT_BASE_URL`, `OCTAPOINT_API_KEY`, `OCTAPOINT_API_SECRET` (see `api-spec.md` C.1).

Keep a committed `.env.example` with every name above and fake values. Real `.env` files are git-ignored.

### How the `.env` file is found

Keep **one** `.env` in the repository root. The API loads it from `apps/api/src/env.ts` (`process.loadEnvFile`, Node 20.12+) and the web app from `apps/web/next.config.mjs`. Variables that already exist in the real environment are never overwritten, so Render, Railway and Vercel settings win and no `.env` file is needed in production. `config.ts` checks every value at start-up and prints all problems at once; the three `SUI_*` values are required only when `ENABLE_ANCHOR_WORKER=true`.

## 2b. Local development and tests

```bash
corepack enable                      # makes the pnpm version in package.json available
pnpm install
cp .env.example .env                 # then put a real SECRET_ENCRYPTION_KEY in it (command in the file)
docker compose up -d db              # PostgreSQL 16 on localhost:5433
pnpm --filter api migrate
pnpm --filter api seed:admin
pnpm --filter api dev                # http://localhost:3001/health
pnpm --filter web dev                # http://localhost:3000
```

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (all tests, needs the database) and `pnpm test:unit` (no database).
- **Database tests never clean tables.** The ledger forbids `DELETE` and `TRUNCATE` (BR-03), so every DB test file calls `createTestDatabase()` (`apps/api/test/helpers/db.ts`): it creates a new database on the `TEST_DATABASE_URL` server, runs all migrations, and drops it at the end. Do not add cleanup with `TRUNCATE` or `DELETE`.
- `migrate` records a checksum for every applied file and refuses to run when an applied file was changed.
- `migrate`, `seed:admin` and `reset:password` run from source with `tsx` (a regular dependency), so they also work on the host after `pnpm install --prod`.

## 3. Same-origin proxy for the portal

The frontend (Vercel) and backend (Render/Railway) have different domains. To keep the session cookie first-party (`SameSite=Lax`, no CORS needed), the Next.js app proxies the API:

```js
// apps/web/next.config.js
module.exports = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_BASE_URL}/api/:path*` }];
  },
};
```
The portal calls relative URLs such as `/api/v1/auth/login`. The backend sets the cookie; the proxy passes `Set-Cookie` through. External clients (SDK/POS) call the backend URL directly and need no CORS. Disable CORS on the API.

## 4. Database setup

1. Create the database and run migrations in order: `pnpm --filter api migrate` (applies `apps/api/src/db/migrations/*.sql`, recording applied files in a `schema_migrations` table). The first migrations are the SQL in `db-schema.md` §2–3.
2. Create the first Admin: `pnpm --filter api seed:admin` (reads `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`, applies the password policy CR-08, hashes with BCrypt cost 12, role `ADMIN`, no merchant). Refuses to run if an Admin already exists.
3. Daily cleanup job (inside the API process): delete `idempotency_keys` older than 24 h and expired/revoked sessions.
4. Password reset (LI-14): `pnpm --filter api reset:password -- <email>` asks for a new password (CR-08 applies), stores the BCrypt hash, revokes all sessions of that user and writes an `audit_logs` row `PASSWORD_CHANGED` with `details = {"by":"script"}`. A team member runs it with database access after checking the person's identity.

## 5. Deployment (SRS 6.3)

| Part | Where | Notes |
|---|---|---|
| Web | Vercel | Set `API_BASE_URL`. |
| API + worker | Render or Railway, **one** instance | Health check `GET /health` → `{"status":"ok"}` (checks DB with `SELECT 1`, no auth). Set `ENABLE_ANCHOR_WORKER=true`. Free tiers may sleep; wake the service before the demo. |
| Database | Render/Railway PostgreSQL 16+ | Run migrations before starting a new version. |
| Move contract | Sui Testnet | Published once; ids go into env. |
| MCP server | Runs locally with the AI client (stdio) | Not deployed. |

Backup: free database plans can expire or be removed. Before every demo or deadline run `pg_dump`, keep the file in the shared Google Drive and test the restore once.

Release: tag on `main` (SRS 6.2); the Installation Guide lists env vars, migration, seed and contract publishing steps from this file.

## 6. Security and logging checklist

- HTTPS only in production. Cookies `HttpOnly; Secure; SameSite=Lax`.
- Passwords: BCrypt cost 12, policy CR-08. The password is pre-hashed with SHA-256 before BCrypt (`lib/password.ts`) because BCrypt silently ignores everything after 72 bytes and a 64-character password can be longer than that in UTF-8. Always use `hashPassword`/`verifyPassword`. API secrets: AES-256-GCM with a random 12-byte nonce per secret (see `db-schema.md`). Compare signatures with `crypto.timingSafeEqual`.
- Generate API key ids and secrets with `crypto.randomBytes` (`oct_` + 16 bytes hex; secret = 32 bytes base64url).
- Never log passwords, secrets, signatures, session tokens or the private key. Log a request id, route, status and duration.
- Error responses follow CR-06 only; internal details stay in server logs.
- Authorization is enforced on the server for every portal endpoint (role + `merchant_id` from the session); hiding menu items in the UI is only a convenience.
- Every DB query touching merchant data includes `merchant_id` (BR-01).
