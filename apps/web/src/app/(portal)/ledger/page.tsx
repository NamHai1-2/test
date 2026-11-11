'use client';

import { useState, type FormEvent } from 'react';
import { ExternalLink, ReceiptText, Search, Undo2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CopyButton } from '@/components/copy-button';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { StatusBadge, TypeBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listMerchantLedger, reverseTransaction } from '@/lib/api-client';
import type { LedgerFilters, LedgerItem, TxStatus, TxType } from '@/lib/api-types';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatNumber, shortenMiddle } from '@/lib/format';
import { errorText, notifyError, notifySuccess } from '@/lib/notify';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

interface Draft {
  customer_code: string;
  type: '' | TxType;
  status: '' | TxStatus;
  date_from: string;
  date_to: string;
}

const EMPTY: Draft = { customer_code: '', type: '', status: '', date_from: '', date_to: '' };

function toQuery(filters: Draft, page: number): LedgerFilters {
  return {
    customer_code: filters.customer_code.trim() || undefined,
    type: filters.type || undefined,
    status: filters.status || undefined,
    date_from: filters.date_from || undefined,
    date_to: filters.date_to || undefined,
    page,
  };
}

export default function MerchantLedgerPage() {
  const { state } = useAuth();
  const isOwner = state.status === 'authenticated' && state.user.role === 'MERCHANT_OWNER';

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [applied, setApplied] = useState<Draft>(EMPTY);
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi(() => listMerchantLedger(toQuery(applied, page)), [applied, page]);

  const [target, setTarget] = useState<LedgerItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied(draft);
    setPage(1);
  }

  function reset() {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setPage(1);
  }

  async function confirmReverse() {
    if (!target || busy) return;
    setBusy(true);
    try {
      const reversal = await reverseTransaction(target.transaction_id);
      notifySuccess('MSG19', { reversal_id: reversal.transaction_id });
      setTarget(null);
      setReverseError(null);
      reload();
    } catch (caught) {
      // MSG26 (already reversed), MSG25 (balance would go below 0), MSG41 (balance above the ceiling), MSG22.
      setReverseError(errorText(caught));
      setTarget(null);
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Ledger"
        description="Every transaction of your business, newest first. Mistakes are fixed with a reversal, never by editing."
      />

      <Card className="mb-4 p-4">
        <form onSubmit={apply} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="f-customer">Customer code</Label>
            <Input
              id="f-customer"
              placeholder="CUS001"
              className="font-mono"
              value={draft.customer_code}
              onChange={(event) => update('customer_code', event.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-type">Type</Label>
            <Select id="f-type" value={draft.type} onChange={(event) => update('type', event.target.value as Draft['type'])}>
              <option value="">All types</option>
              <option value="ISSUE">Issue</option>
              <option value="REDEEM">Redeem</option>
              <option value="REVERSAL">Reversal</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-status">Status</Label>
            <Select id="f-status" value={draft.status} onChange={(event) => update('status', event.target.value as Draft['status'])}>
              <option value="">All statuses</option>
              <option value="PENDING_ANCHOR">Pending anchor</option>
              <option value="ANCHORED">Anchored</option>
              <option value="FAILED">Failed</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-from">From</Label>
            <Input id="f-from" type="date" value={draft.date_from} onChange={(event) => update('date_from', event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-to">To</Label>
            <Input id="f-to" type="date" value={draft.date_to} onChange={(event) => update('date_to', event.target.value)} />
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-5 lg:justify-end">
            <Button type="button" variant="ghost" onClick={reset}>
              Reset
            </Button>
            <Button type="submit">
              <Search className="h-4 w-4" aria-hidden="true" />
              Apply filters
            </Button>
          </div>
        </form>
      </Card>

      {reverseError ? (
        <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {reverseError}
        </p>
      ) : null}

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
                  <TableHead>Transaction</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Bill (VND)</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="text-right">Balance after</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sui digest</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Time (UTC+7)</TableHead>
                  {isOwner ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !data
                  ? Array.from({ length: 8 }, (_, index) => (
                      <TableRow key={index} className="hover:bg-transparent">
                        <TableCell colSpan={isOwner ? 11 : 10}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : data?.items.map((row) => (
                      <TableRow key={row.transaction_id} className={cn(loading && 'opacity-60')}>
                        <TableCell>
                          <span className="font-mono text-xs">{row.transaction_id}</span>
                          {row.reverses_transaction_id ? (
                            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                              reverses {row.reverses_transaction_id}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.customer_code}</TableCell>
                        <TableCell>
                          <TypeBadge type={row.type} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {row.bill_amount === null ? '—' : formatNumber(row.bill_amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(row.points)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatNumber(row.balance_after)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={row.status} />
                        </TableCell>
                        <TableCell>
                          {row.sui_digest ? (
                            <span className="flex items-center gap-0.5">
                              <span className="font-mono text-xs" title={row.sui_digest}>
                                {shortenMiddle(row.sui_digest)}
                              </span>
                              <CopyButton value={row.sui_digest} label="Copy digest" />
                              {row.explorer_url ? (
                                <a
                                  href={row.explorer_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label="Open in Sui Explorer"
                                  title="Open in Sui Explorer"
                                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                </a>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {row.performed_by.label}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(row.created_at)}
                        </TableCell>
                        {isOwner ? (
                          <TableCell className="text-right">
                            {row.reversible ? (
                              <Button variant="ghost" size="sm" onClick={() => setTarget(row)}>
                                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                                Reverse
                              </Button>
                            ) : null}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
              </TableBody>
            </Table>

            {data && data.items.length === 0 ? (
              <EmptyState
                icon={ReceiptText}
                title="No transactions found"
                description="Try different filters, or issue points to a customer to create the first one."
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

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title="Reverse this transaction?"
        description={
          target ? (
            <>
              This creates a new <strong>Reversal</strong> that undoes{' '}
              <span className="font-mono">{target.transaction_id}</span>:{' '}
              {target.type === 'ISSUE'
                ? `${formatNumber(target.points)} points are taken back from ${target.customer_code}.`
                : `${formatNumber(target.points)} points are given back to ${target.customer_code}.`}{' '}
              A transaction can be reversed only once.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Reverse transaction"
        destructive
        loading={busy}
        onConfirm={() => void confirmReverse()}
      />
    </>
  );
}
