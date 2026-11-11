'use client';

import { useState, type FormEvent } from 'react';
import { Plus, UserCog } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { Modal } from '@/components/modal';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createStaff, deactivateStaff, listStaff } from '@/lib/api-client';
import type { StaffItem } from '@/lib/api-types';
import { formatDateTime } from '@/lib/format';
import { errorText, notifyError, notifySuccess } from '@/lib/notify';
import { isValidPassword } from '@/lib/password-policy';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

export default function StaffPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi(() => listStaff(page), [page]);
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState<StaffItem | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmDeactivate() {
    if (!target || busy) return;
    setBusy(true);
    try {
      await deactivateStaff(target.id);
      notifySuccess('MSG29', { entity_name: 'staff account' });
      setTarget(null);
      reload();
    } catch (caught) {
      notifyError(caught);
      setTarget(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Staff"
        description="Staff can look up customers, issue and redeem points and read the ledger. They cannot change rules, keys or reverse transactions."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add staff
          </Button>
        }
      />

      <Card className="overflow-hidden">
        {error ? (
          <div className="p-6">
            <p role="alert" className="text-sm text-red-700">
              {errorText(error)}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={reload}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Added (UTC+7)</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !data
                  ? Array.from({ length: 3 }, (_, index) => (
                      <TableRow key={index} className="hover:bg-transparent">
                        <TableCell colSpan={5}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : data?.items.map((item) => (
                      <TableRow key={item.id} className={cn(loading && 'opacity-60')}>
                        <TableCell className="font-medium">{item.full_name}</TableCell>
                        <TableCell className="text-muted-foreground">{item.email}</TableCell>
                        <TableCell>
                          <Badge variant={item.is_active ? 'success' : 'neutral'} dot>
                            {item.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(item.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.is_active ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-700 hover:text-red-800"
                              onClick={() => setTarget(item)}
                            >
                              Deactivate
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>

            {data && data.items.length === 0 ? (
              <EmptyState
                icon={UserCog}
                title="No staff accounts yet"
                description="Add a cashier so they can sign in and serve customers."
              />
            ) : null}

            {data ? (
              <Pagination
                page={data.page}
                pageSize={data.page_size}
                total={data.total}
                onPageChange={setPage}
                disabled={loading}
              />
            ) : null}
          </>
        )}
      </Card>

      <AddStaffDialog
        open={adding}
        onOpenChange={setAdding}
        onCreated={() => {
          setAdding(false);
          setPage(1);
          reload();
        }}
      />

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title="Deactivate this staff account?"
        description={
          <>
            <strong>{target?.full_name}</strong> will no longer be able to sign in. Their past transactions stay in the
            ledger. A deactivated account cannot be reactivated.
          </>
        }
        confirmLabel="Deactivate"
        destructive
        loading={busy}
        onConfirm={() => void confirmDeactivate()}
      />
    </>
  );
}

function AddStaffDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function close(next: boolean) {
    if (!next) {
      setFullName('');
      setEmail('');
      setPassword('');
      setFormError(null);
    }
    onOpenChange(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setFormError(null);
    const name = fullName.trim();
    const mail = email.trim();
    if (!name || !mail || !password) {
      setFormError('Please fill in every field.');
      return;
    }
    if (!isValidPassword(password, mail)) {
      setFormError('Password must be 8-64 characters with at least one letter and one digit.');
      return;
    }
    setSaving(true);
    try {
      await createStaff({ full_name: name, email: mail, initial_password: password });
      notifySuccess('MSG28', { entity_name: 'staff account' });
      close(false);
      onCreated();
    } catch (caught) {
      setFormError(errorText(caught)); // MSG31 (email in use), MSG37 (password), MSG33 ... shown next to the form
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Add staff"
      description="Share the initial password with your colleague yourself. They can change it after the first sign-in."
      busy={saving}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="staff-name">Full name</Label>
          <Input id="staff-name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={200} disabled={saving} autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="staff-email">Email</Label>
          <Input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} disabled={saving} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="staff-password">Initial password</Label>
          <Input id="staff-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={64} disabled={saving} />
          <p className="text-xs text-muted-foreground">8-64 characters, at least one letter and one digit.</p>
        </div>
        {formError ? (
          <p role="alert" className="text-sm text-red-700">
            {formError}
          </p>
        ) : null}
        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="outline" disabled={saving} onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Add staff
          </Button>
        </div>
      </form>
    </Modal>
  );
}
