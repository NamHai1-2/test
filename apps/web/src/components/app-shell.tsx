'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Building2,
  Coins,
  KeyRound,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  ScrollText,
  Settings2,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { initials } from '@/lib/format';
import { activeItem, menuFor, roleLabel, type NavIcon } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import type { MeResponse } from '@/lib/api-types';
import { isMockMode } from '@/lib/api-client';

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  merchants: Building2,
  ledger: ReceiptText,
  customers: Users,
  rules: ScrollText,
  keys: KeyRound,
  staff: UserCog,
  account: Settings2,
};

export function AppShell({ user, children }: { user: MeResponse; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();
  const items = menuFor(user.role);
  const current = activeItem(user.role, pathname);

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-16 items-center gap-2.5 border-b px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Coins className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-tight">OctaPoint</span>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = current?.href === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {user.merchant ? (
          <div className="border-t p-4">
            <p className="truncate text-sm font-medium">{user.merchant.name}</p>
            <p className="font-mono text-xs text-muted-foreground">{user.merchant.code}</p>
          </div>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b bg-card/80 px-6 backdrop-blur">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">{current?.label ?? 'OctaPoint'}</h2>
            {isMockMode() ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Mock data
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{user.full_name}</p>
              <p className="text-xs text-muted-foreground">{roleLabel(user.role)}</p>
            </div>
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              aria-hidden="true"
            >
              {initials(user.full_name)}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
