import type { Role } from './api-types';

// Role-based menu (SRS 3.1.6). Hiding a menu entry is only a convenience: the server enforces every
// permission and answers MSG04 for anything the role may not do.

export type NavIcon =
  | 'dashboard'
  | 'merchants'
  | 'ledger'
  | 'customers'
  | 'rules'
  | 'keys'
  | 'staff'
  | 'account';

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
}

const ACCOUNT: NavItem = { label: 'Account', href: '/account', icon: 'account' };

const MENUS: Record<Role, readonly NavItem[]> = {
  ADMIN: [
    { label: 'Dashboard', href: '/admin', icon: 'dashboard' },
    { label: 'Merchants', href: '/admin/merchants', icon: 'merchants' },
    { label: 'System Ledger', href: '/admin/ledger', icon: 'ledger' },
    ACCOUNT,
  ],
  MERCHANT_OWNER: [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
    { label: 'Customers', href: '/customers', icon: 'customers' },
    { label: 'Loyalty Rules', href: '/rules', icon: 'rules' },
    { label: 'API Keys', href: '/api-keys', icon: 'keys' },
    { label: 'Staff', href: '/staff', icon: 'staff' },
    { label: 'Ledger', href: '/ledger', icon: 'ledger' },
    ACCOUNT,
  ],
  MERCHANT_STAFF: [
    { label: 'Customers', href: '/customers', icon: 'customers' },
    { label: 'Ledger', href: '/ledger', icon: 'ledger' },
    ACCOUNT,
  ],
};

export function menuFor(role: Role): readonly NavItem[] {
  return MENUS[role];
}

/** Landing page after login. Must match the `redirect` field of POST /auth/login (api-spec B.2). */
export function homeFor(role: Role): string {
  if (role === 'ADMIN') return '/admin';
  if (role === 'MERCHANT_OWNER') return '/dashboard';
  return '/customers';
}

export function roleLabel(role: Role): string {
  if (role === 'ADMIN') return 'Admin';
  if (role === 'MERCHANT_OWNER') return 'Owner';
  return 'Staff';
}

/** True when the path belongs to one of the role's menu entries (or is below one). */
export function canAccess(role: Role, pathname: string): boolean {
  return MENUS[role].some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}

/** Menu entry that is highlighted for the current path (the longest matching href wins). */
export function activeItem(role: Role, pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const item of MENUS[role]) {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (best === undefined || item.href.length > best.href.length)) best = item;
  }
  return best;
}

/**
 * Where to go after login. The server sends the path, but a redirect target is never trusted blindly:
 * only same-site paths made of letters, digits, "-", "_" and "/" are followed.
 */
export function safeRedirect(target: unknown, role: Role): string {
  if (typeof target === 'string' && /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(target)) return target;
  return homeFor(role);
}
