'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changePassword } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { MESSAGES } from '@/lib/messages';
import { roleLabel } from '@/lib/navigation';
import { errorText, notifySuccess } from '@/lib/notify';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, isValidPassword } from '@/lib/password-policy';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

export default function AccountPage() {
  const { state } = useAuth();
  const user = state.user;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current || !next || !confirm) {
      setError(MESSAGES.MSG01);
      return;
    }
    if (next !== confirm) {
      setError('The new password and its confirmation do not match.');
      return;
    }
    if (!isValidPassword(next, user?.email)) {
      setError(MESSAGES.MSG37);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await changePassword({ current_password: current, new_password: next });
      notifySuccess('MSG29');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (caught) {
      setError(errorText(caught)); // MSG36 wrong current password, MSG37 policy
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null; // the portal layout only renders pages for a signed-in user

  return (
    <>
      <PageHeader title="Account" description="Your profile and password." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Contact the Admin if one of these details is wrong.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 sm:grid-cols-2">
              <Field label="Full name">{user.full_name}</Field>
              <Field label="Email">{user.email}</Field>
              <Field label="Role">{roleLabel(user.role)}</Field>
              {user.merchant ? (
                <>
                  <Field label="Merchant">{user.merchant.name}</Field>
                  <Field label="Merchant code">
                    <span className="font-mono text-xs">{user.merchant.code}</span>
                  </Field>
                  <Field label="Merchant status">
                    <StatusBadge status={user.merchant.status} />
                  </Field>
                </>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>
              {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} characters with at least one letter and one digit.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                <Label htmlFor="current">Current password</Label>
                <Input
                  id="current"
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  onChange={(event) => setCurrent(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="next">New password</Label>
                <Input
                  id="next"
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(event) => setNext(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </div>
              <Button type="submit" loading={submitting}>
                Update password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
