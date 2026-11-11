'use client';

import { useState, type FormEvent } from 'react';
import { ExternalLink, ReceiptText, Search } from 'lucide-react';
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
import { listAdminLedger } from '@/lib/api-client';
import type { AdminLedgerQuery, TxStatus, TxType } from '@/lib/api-types';
import { formatDateTime, formatNumber, shortenMiddle } from '@/lib/format';
import { errorText } from '@/lib/notify';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

interface Draft {
  merchant_code: string;
  customer_code: string;
  type: '' | TxType;
  status: '' | TxStatus;
  date_from: string;
  date_to: string;
}

const EMPTY: Draft = { merchant_code: '', customer_code: '', type: '', status: '', date_from: '', date_to: '' };

function toQuery(filters: Draft, page: number): AdminLedgerQuery {
  return {
    merchant_code: filters.merchant_code.trim() || undefined,
    customer_code: filters.customer_code.trim() || undefined,
    type: filters.type || undefined,
    status: filters.status || undefined,
    date_from: filters.date_from || undefined,
    date_to: filters.date_to || undefined,
    page,
  };
}

export default function AdminLedgerPage() {
  // `draft` is what the user is typing; `applied` is what the table uses (changes on "Apply" only).
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [applied, setApplied] = useState<Draft>(EMPTY);
  const [page, setPage] = useState(1);

  const { data, error, loading, reload } = useApi(() => listAdminLedger(toQuery(applied, page)), [applied, page]);

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

  return (
    <>
      <PageHeader
        title="System Ledger"
        description="Every transaction of every merchant, newest first. Read-only."
      />

      <Card className="mb-4 p-4">
        <form onSubmit={apply} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1.5 lg:col-span-1">
            <Label htmlFor="f-merchant">Merchant code</Label>
            <Input
              id="f-merchant"
              placeholder="MCH-XXXXXX"
              className="font-mono"
              value={draft.merchant_code}
              onChange={(event) => update('merchant_code', event.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5 lg:col-span-1">
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
            <Select
              id="f-status"
              value={draft.status}
              onChange={(event) => update('status', event.target.value as Draft['status'])}
            >
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
          <div className="flex gap-2 sm:col-span-2 lg:col-span-6 lg:justify-end">
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
                  <TableHead>Merchant</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="text-right">Balance after</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sui digest</TableHead>
                  <TableHead>Time (UTC+7)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !data
                  ? Array.from({ length: 8 }, (_, index) => (
                      <TableRow key={index} className="hover:bg-transparent">
                        <TableCell colSpan={9}>
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
                        <TableCell className="font-mono text-xs">{row.merchant_code}</TableCell>
                        <TableCell className="font-mono text-xs">{row.customer_code}</TableCell>
                        <TableCell>
                          <TypeBadge type={row.type} />
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
                          {formatDateTime(row.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>

            {data && data.items.length === 0 ? (
              <EmptyState
                icon={ReceiptText}
                title="No transactions found"
                description="Try different filters or clear them to see every transaction."
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
    </>
  );
}
