// Demo logins of the mock API (NEXT_PUBLIC_USE_MOCKS=true). Kept apart from mocks.ts so the login page can
// show them without pulling the fixtures into the normal bundle. These are fake accounts, not real secrets.

export const DEMO_PASSWORD = 'Passw0rd1';

export const DEMO_ACCOUNTS = [
  { email: 'admin@octapoint.test', label: 'Admin' },
  { email: 'owner@octapoint.test', label: 'Owner' },
  { email: 'staff@octapoint.test', label: 'Staff' },
  { email: 'pending@octapoint.test', label: 'Owner of a pending merchant (login is refused)' },
] as const;
