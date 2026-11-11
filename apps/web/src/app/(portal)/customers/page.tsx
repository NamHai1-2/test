'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { MinusCircle, Pencil, Plus, PlusCircle, Search, Users } from 'lucide-react';
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
import {
  createCustomer,
  deactivateCustomer,
  issuePoints,
  listCustomers,
  reactivateCustomer,
  redeemPoints,
  updateCustomer,
} from '@/lib/api-client';
import type { CustomerItem } from '@/lib/api-types';
import { useAuth } from '@/lib/auth';
import { formatNumber } from '@/lib/format';
import { useIdempotencyKey } from '@/lib/idempotency';
import { errorText, notifyError, notifySuccess } from '@/lib/notify';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const CODE_PATTERN = /^[A-Z0-9]{1,32}$/;
const PHONE_PATTERN = /^0[0-9]{9}$/;
const INTEGER = /^[0-9]+$/;

type Dialog =
  | { kind: 'add' }
  | { kind: 'edit'; customer: CustomerItem }
  | { kind: 'issue'; customer: CustomerItem }
  | { kind: 'redeem'; customer: CustomerItem }
  | { kind: 'toggle'; customer: CustomerItem }
  | null;

export default function CustomersPage() {
  const { state } = useAuth();
  const isOwner = state.status === 'authenticated' && state.user.role === 'MERCHANT_OWNER';

  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi(
    () => listCustomers({ q: query || undefined, page }),
    [query, page],
  );
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  // Search as the user types, after a short pause.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = draft.trim();
      setQuery((current) => {
        if (current !== next) setPage(1);
        return next;
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [draft]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(draft.trim());
    setPage(1);
  }

  async function confirmToggle() {
    if (dialog?.kind !== 'toggle' || toggleBusy) return;
    const { customer } = dialog;
    setToggleBusy(true);
    try {
      if (customer.is_active) await deactivateCustomer(customer.customer_code);
      else await reactivateCustomer(customer.customer_code);
      notifySuccess('MSG29', { entity_name: 'customer' });
      setDialog(null);
      reload();
    } catch (caught) {
      notifyError(caught);
      setDialog(null);
    } finally {
      setToggleBusy(false);
    }
  }

  const close = () => setDialog(null);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Find a customer to issue or redeem points."
        actions={
          <Button onClick={() => setDialog({ kind: 'add' })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add customer
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <form onSubmit={search} role="search" className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              aria-label="Search customers"
              placeholder="Search by code, name or phone"
              className="pl-9"
              value={draft}
              maxLength={100}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
      </Card>

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
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !data
                  ? Array.from({ length: 8 }, (_, index) => (
                      <TableRow key={index} className="hover:bg-transparent">
                        <TableCell colSpan={6}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : data?.items.map((customer) => (
                      <TableRow key={customer.id} className={cn(loading && 'opacity-60')}>
                        <TableCell className="font-mono text-xs">{customer.customer_code}</TableCell>
                        <TableCell className="font-medium">{customer.name}</TableCell>
                        <TableCell className="text-muted-foreground">{customer.phone ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(customer.balance)}</TableCell>
                        <TableCell>
                          <Badge variant={customer.is_active ? 'success' : 'neutral'} dot>
                            {customer.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!customer.is_active}
                              onClick={() => setDialog({ kind: 'issue', customer })}
                            >
                              <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                              Issue
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!customer.is_active}
                              onClick={() => setDialog({ kind: 'redeem', customer })}
                            >
                              <MinusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                              Redeem
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Edit ${customer.customer_code}`}
                              title="Edit"
                              onClick={() => setDialog({ kind: 'edit', customer })}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            {isOwner ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className={customer.is_active ? 'text-red-700 hover:text-red-800' : undefined}
                                onClick={() => setDialog({ kind: 'toggle', customer })}
                              >
                                {customer.is_active ? 'Deactivate' : 'Reactivate'}
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>

            {data && data.items.length === 0 ? (
              <EmptyState
                icon={Users}
                title={query ? 'No customers match your search' : 'No customers yet'}
                description={query ? 'Check the code, name or phone number.' : 'Add your first customer to start issuing points.'}
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

      <CustomerFormDialog
        mode={dialog?.kind === 'add' ? 'add' : dialog?.kind === 'edit' ? 'edit' : null}
        customer={dialog?.kind === 'edit' ? dialog.customer : null}
        onClose={close}
        onSaved={() => {
          close();
          reload();
        }}
      />

      <PointsDialog
        mode={dialog?.kind === 'issue' ? 'issue' : dialog?.kind === 'redeem' ? 'redeem' : null}
        customer={dialog?.kind === 'issue' || dialog?.kind === 'redeem' ? dialog.customer : null}
        onClose={close}
        onDone={() => {
          close();
          reload();
        }}
      />

      <ConfirmDialog
        open={dialog?.kind === 'toggle'}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={dialog?.kind === 'toggle' && dialog.customer.is_active ? 'Deactivate this customer?' : 'Reactivate this customer?'}
        description={
          dialog?.kind === 'toggle' ? (
            dialog.customer.is_active ? (
              <>
                <strong>{dialog.customer.name}</strong> ({dialog.customer.customer_code}) will not be able to earn or
                redeem points. The balance is kept and you can reactivate the customer at any time.
              </>
            ) : (
              <>
                <strong>{dialog.customer.name}</strong> ({dialog.customer.customer_code}) will be able to earn and redeem
                points again.
              </>
            )
          ) : (
            ''
          )
        }
        confirmLabel={dialog?.kind === 'toggle' && dialog.customer.is_active ? 'Deactivate' : 'Reactivate'}
        destructive={dialog?.kind === 'toggle' && dialog.customer.is_active}
        loading={toggleBusy}
        onConfirm={() => void confirmToggle()}
      />
    </>
  );
}

// ---------------------------------------------------------------------------------------------

function CustomerFormDialog({
  mode,
  customer,
  onClose,
  onSaved,
}: {
  mode: 'add' | 'edit' | null;
  customer: CustomerItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fill (or clear) the form every time the dialog opens.
  useEffect(() => {
    if (mode === null) return;
    setCode(customer?.customer_code ?? '');
    setName(customer?.name ?? '');
    setPhone(customer?.phone ?? '');
    setFormError(null);
  }, [mode, customer]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || mode === null) return;
    setFormError(null);
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    if (mode === 'add' && !code) return setFormError('Customer code is required.');
    if (mode === 'add' && !CODE_PATTERN.test(code)) {
      return setFormError('Customer code must be 1-32 characters: capital letters and digits only.');
    }
    if (!cleanName) return setFormError('Name is required.');
    if (cleanPhone && !PHONE_PATTERN.test(cleanPhone)) {
      return setFormError('Phone must be 10 digits and start with 0, for example 0912345678.');
    }
    setSaving(true);
    try {
      if (mode === 'add') {
        await createCustomer({ customer_code: code, name: cleanName, phone: cleanPhone || null });
        notifySuccess('MSG28', { entity_name: 'customer' });
      } else if (customer) {
        await updateCustomer(customer.customer_code, { name: cleanName, phone: cleanPhone || null });
        notifySuccess('MSG29', { entity_name: 'customer' });
      }
      onSaved();
    } catch (caught) {
      setFormError(errorText(caught)); // MSG27 / MSG38 / MSG33 next to the form
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={mode === 'edit' ? 'Edit customer' : 'Add customer'}
      description={mode === 'edit' ? 'The customer code cannot be changed.' : 'The code is the ID you use at the counter.'}
      busy={saving}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="c-code">Customer code</Label>
          <Input
            id="c-code"
            className="font-mono"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={32}
            disabled={saving || mode === 'edit'}
            autoFocus={mode === 'add'}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-name">Name</Label>
          <Input id="c-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} disabled={saving} autoFocus={mode === 'edit'} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-phone">Phone (optional)</Label>
          <Input id="c-phone" inputMode="tel" placeholder="0912345678" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={10} disabled={saving} />
        </div>
        {formError ? (
          <p role="alert" className="text-sm text-red-700">
            {formError}
          </p>
        ) : null}
        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {mode === 'edit' ? 'Save changes' : 'Add customer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------

function PointsDialog({
  mode,
  customer,
  onClose,
  onDone,
}: {
  mode: 'issue' | 'redeem' | null;
  customer: CustomerItem | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { keyFor, reset } = useIdempotencyKey();

  useEffect(() => {
    if (mode === null) return;
    setValue('');
    setFormError(null);
    reset();
  }, [mode, customer, reset]);

  const issue = mode === 'issue';
  const label = issue ? 'Bill amount (VND)' : 'Points to redeem';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !customer || mode === null) return;
    setFormError(null);
    const text = value.trim();
    const number = Number(text);
    if (!INTEGER.test(text) || !Number.isSafeInteger(number) || number < 1) {
      return setFormError('Enter a whole number greater than 0.');
    }
    setSaving(true);
    try {
      // The same key is reused while the request stays the same, so a double click or a retry after a lost
      // answer cannot issue or redeem twice (BR-10). A different amount gets a new key.
      const key = keyFor(`${mode}:${customer.customer_code}:${number}`);
      if (issue) {
        const tx = await issuePoints(customer.customer_code, number, key);
        notifySuccess('MSG06', { points: formatNumber(tx.points), customer_code: customer.customer_code });
        notifySuccess('MSG20');
      } else {
        const tx = await redeemPoints(customer.customer_code, number, key);
        notifySuccess('MSG07', { points: formatNumber(tx.points), new_balance: formatNumber(tx.balance_after) });
        notifySuccess('MSG20');
      }
      reset();
      onDone();
    } catch (caught) {
      setFormError(errorText(caught)); // MSG24, MSG33 / MSG08, MSG09 next to the field
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={issue ? 'Issue points' : 'Redeem points'}
      description={
        customer ? (
          <>
            {customer.name} · <span className="font-mono">{customer.customer_code}</span> · balance{' '}
            <strong>{formatNumber(customer.balance)}</strong> points
          </>
        ) : undefined
      }
      busy={saving}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="p-value">{label}</Label>
          <Input
            id="p-value"
            inputMode="numeric"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={formError ? true : undefined}
            aria-describedby={formError ? 'p-error' : 'p-help'}
            disabled={saving}
            autoFocus
          />
          {formError ? (
            <p id="p-error" role="alert" className="text-sm text-red-700">
              {formError}
            </p>
          ) : (
            <p id="p-help" className="text-xs text-muted-foreground">
              {issue
                ? 'Points are calculated from your loyalty rules; any remainder is dropped.'
                : 'The amount must reach your minimum redemption and not exceed the balance.'}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {issue ? 'Issue points' : 'Redeem points'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
