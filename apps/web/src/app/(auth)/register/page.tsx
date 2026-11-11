'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { AuthLayout } from '@/components/auth-layout';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { register } from '@/lib/api-client';
import { MESSAGES, formatMessage } from '@/lib/messages';
import { errorText } from '@/lib/notify';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, isValidPassword } from '@/lib/password-policy';
import { cn } from '@/lib/utils';

export default function RegisterPage() {
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (![businessName, ownerName, email, password].every((value) => value.trim())) {
      setError(MESSAGES.MSG01);
      return;
    }
    if (!isValidPassword(password, email)) {
      setError(MESSAGES.MSG37);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await register({
        business_name: businessName.trim(),
        owner_name: ownerName.trim(),
        email: email.trim(),
        password,
      });
      setDone(true); // the account is PENDING until an Admin approves it (MSG30)
    } catch (caught) {
      setError(errorText(caught)); // MSG31 duplicate email, MSG37 policy, MSG01 required
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight">Registration received</h2>
          <p className="mt-2 text-sm text-muted-foreground">{formatMessage('MSG30')}</p>
          <Link href="/login" className={cn(buttonVariants(), 'mt-8 w-full')}>
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight">Create a merchant account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          An Admin reviews every new merchant before it can sign in.
        </p>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4">
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
          <Label htmlFor="business_name">Business name</Label>
          <Input
            id="business_name"
            autoComplete="organization"
            autoFocus
            maxLength={120}
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="owner_name">Owner full name</Label>
          <Input
            id="owner_name"
            autoComplete="name"
            maxLength={120}
            value={ownerName}
            onChange={(event) => setOwnerName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} characters with at least one letter and one digit.
          </p>
        </div>

        <Button type="submit" className="w-full" loading={submitting}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already registered?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
