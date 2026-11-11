'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { AuthLayout } from '@/components/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isMockMode, login } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/lib/mock-accounts';
import { MESSAGES } from '@/lib/messages';
import { safeRedirect } from '@/lib/navigation';
import { errorText } from '@/lib/notify';

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError(MESSAGES.MSG01); // required field missing
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await login({ email: email.trim(), password });
      await refresh();
      router.replace(safeRedirect(result.redirect, result.user.role));
    } catch (caught) {
      // MSG02 (wrong credentials or inactive user) and MSG15 (merchant not active) are shown under the form.
      setError(errorText(caught));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
        <p className="mt-1 text-sm text-muted-foreground">Welcome back. Enter your account details.</p>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={error ? true : undefined}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error ? true : undefined}
          />
        </div>

        <Button type="submit" className="w-full" loading={submitting}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New merchant?{' '}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>

      {isMockMode() ? (
        <div className="mt-8 rounded-lg border border-dashed bg-muted/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Demo accounts (mock data)
          </p>
          <ul className="mt-2 space-y-1.5">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{account.label}</span>{' '}
                  <span className="font-mono text-xs text-muted-foreground">{account.email}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(DEMO_PASSWORD);
                    setError(null);
                  }}
                >
                  Fill
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Password for all: <span className="font-mono">{DEMO_PASSWORD}</span>
          </p>
        </div>
      ) : null}
    </AuthLayout>
  );
}
