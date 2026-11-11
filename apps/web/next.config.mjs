import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Same root .env as the API. Variables already set in the environment (Vercel) win.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Inlined into the browser bundle. "true" runs the portal against the in-memory mock API
  // (src/lib/mocks.ts) so the screens can be used while the backend is not ready.
  env: {
    NEXT_PUBLIC_USE_MOCKS: process.env.NEXT_PUBLIC_USE_MOCKS ?? 'false',
  },
  // Same-origin proxy: the browser only talks to this app, so the session cookie is first-party
  // (SameSite=Lax) and no CORS is needed. See docs/config-and-deploy.md section 3.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiBase}/api/:path*` }];
  },
};

export default nextConfig;
