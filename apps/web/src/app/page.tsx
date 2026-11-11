'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { homeFor } from '@/lib/navigation';

/** "/" only decides where to go: the role's landing page when signed in, /login otherwise. */
export default function IndexPage() {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'authenticated') router.replace(homeFor(state.user.role));
    else if (state.status === 'anonymous') router.replace('/login');
  }, [state, router]);

  return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
}
