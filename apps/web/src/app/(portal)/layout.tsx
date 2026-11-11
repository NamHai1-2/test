'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { canAccess, homeFor } from '@/lib/navigation';

/**
 * Every signed-in screen lives under this layout. It sends visitors without a session to /login and
 * sends a role away from screens of another role. The server still enforces every permission (MSG04).
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const allowed = state.status === 'authenticated' && canAccess(state.user.role, pathname);

  useEffect(() => {
    if (state.status === 'anonymous') router.replace('/login');
    else if (state.status === 'authenticated' && !allowed) router.replace(homeFor(state.user.role));
  }, [state, allowed, router]);

  if (state.status !== 'authenticated' || !allowed) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-64 border-r bg-card md:block" />
        <div className="flex-1 space-y-4 p-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }
  return <AppShell user={state.user}>{children}</AppShell>;
}
