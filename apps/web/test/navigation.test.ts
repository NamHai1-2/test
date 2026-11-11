import { describe, expect, it } from 'vitest';
import type { Role } from '../src/lib/api-types';
import { merchantActions } from '../src/lib/merchant-actions';
import { activeItem, canAccess, homeFor, menuFor, safeRedirect } from '../src/lib/navigation';

const hrefs = (role: Role): string[] => menuFor(role).map((item) => item.href);

describe('role menu (SRS 3.1.6)', () => {
  it('Admin sees the admin screens and the account page, nothing of a merchant', () => {
    expect(hrefs('ADMIN')).toEqual(['/admin', '/admin/merchants', '/admin/ledger', '/account']);
  });

  it('Owner sees every merchant screen', () => {
    expect(hrefs('MERCHANT_OWNER')).toEqual([
      '/dashboard',
      '/customers',
      '/rules',
      '/api-keys',
      '/staff',
      '/ledger',
      '/account',
    ]);
  });

  it('Staff does not see the Owner-only entries', () => {
    expect(hrefs('MERCHANT_STAFF')).toEqual(['/customers', '/ledger', '/account']);
    for (const ownerOnly of ['/dashboard', '/rules', '/api-keys', '/staff']) {
      expect(hrefs('MERCHANT_STAFF')).not.toContain(ownerOnly);
    }
  });

  it('every role can open its own landing page and the account page', () => {
    for (const role of ['ADMIN', 'MERCHANT_OWNER', 'MERCHANT_STAFF'] as const) {
      expect(canAccess(role, homeFor(role))).toBe(true);
      expect(canAccess(role, '/account')).toBe(true);
    }
  });
});

describe('landing page after login (api-spec B.2 "redirect")', () => {
  it('Admin -> /admin, Owner -> /dashboard, Staff -> /customers', () => {
    expect(homeFor('ADMIN')).toBe('/admin');
    expect(homeFor('MERCHANT_OWNER')).toBe('/dashboard');
    expect(homeFor('MERCHANT_STAFF')).toBe('/customers');
  });
});

describe('canAccess', () => {
  it('allows pages below a menu entry', () => {
    expect(canAccess('ADMIN', '/admin/merchants')).toBe(true);
    expect(canAccess('MERCHANT_OWNER', '/customers/CUS001')).toBe(true);
  });

  it('refuses areas of another role', () => {
    expect(canAccess('MERCHANT_OWNER', '/admin')).toBe(false);
    expect(canAccess('MERCHANT_STAFF', '/admin/ledger')).toBe(false);
    expect(canAccess('MERCHANT_STAFF', '/rules')).toBe(false);
    expect(canAccess('MERCHANT_STAFF', '/api-keys')).toBe(false);
    expect(canAccess('ADMIN', '/customers')).toBe(false);
  });

  it('does not match on a shared prefix only', () => {
    expect(canAccess('MERCHANT_OWNER', '/dashboardx')).toBe(false);
    expect(canAccess('ADMIN', '/administrator')).toBe(false);
  });
});

describe('activeItem', () => {
  it('highlights the most specific entry', () => {
    expect(activeItem('ADMIN', '/admin')?.label).toBe('Dashboard');
    expect(activeItem('ADMIN', '/admin/merchants')?.label).toBe('Merchants');
    expect(activeItem('MERCHANT_STAFF', '/nowhere')).toBeUndefined();
  });
});

describe('safeRedirect', () => {
  it('follows same-site paths', () => {
    expect(safeRedirect('/admin', 'ADMIN')).toBe('/admin');
    expect(safeRedirect('/api-keys', 'MERCHANT_OWNER')).toBe('/api-keys');
  });

  it('falls back to the role home for anything else', () => {
    expect(safeRedirect('//evil.example', 'MERCHANT_OWNER')).toBe('/dashboard');
    expect(safeRedirect('https://evil.example', 'ADMIN')).toBe('/admin');
    expect(safeRedirect('/admin?next=1', 'ADMIN')).toBe('/admin');
    expect(safeRedirect(undefined, 'MERCHANT_STAFF')).toBe('/customers');
    expect(safeRedirect(42, 'MERCHANT_STAFF')).toBe('/customers');
  });
});

describe('merchant actions (SRS 3.2.1.2)', () => {
  it('offers only the allowed transition for each status', () => {
    expect(merchantActions('PENDING')).toEqual(['approve']);
    expect(merchantActions('ACTIVE')).toEqual(['suspend']);
    expect(merchantActions('SUSPENDED')).toEqual(['approve']);
  });
});
