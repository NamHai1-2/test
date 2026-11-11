'use client';

import { useState } from 'react';
import { Building2, CheckCircle2, PauseCircle } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { approveMerchant, listAdminMerchants, suspendMerchant } from '@/lib/api-client';
import type { AdminMerchantItem, MerchantStatus } from '@/lib/api-types';
import { formatDateTime } from '@/lib/format';
import { merchantActions } from '@/lib/merchant-actions';
import { errorText, notifyError, notifySuccess, notifyWarning } from '@/lib/notify';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const TABS: ReadonlyArray<{ label: string; value: MerchantStatus | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Suspended', value: 'SUSPENDED' },
];

export default function AdminMerchantsPage() {
  const [status, setStatus] = useState<MerchantStatus | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toSuspend, setToSuspend] = useState<AdminMerchantItem | null>(null);

  const { data, error, loading, reload } = useApi(() => listAdminMerchants({ status, page }), [status, page]);

  function selectTab(value: MerchantStatus | undefined) {
    setStatus(value);
    setPage(1);
  }

  async function approve(merchant: AdminMerchantItem) {
    setBusyId(merchant.id);
    try {
      await approveMerchant(merchant.id);
      notifySuccess('MSG13');
      reload();
    } catch (caught) {
      notifyError(caught);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmSuspend() {
    if (!toSuspend) return;
    setBusyId(toSuspend.id);
    try {
      await suspendMerchant(toSuspend.id);
      notifyWarning('MSG14');
      setToSuspend(null);
      reload();
    } catch (caught) {
      notifyError(caught);
      setToSuspend(null);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader title="Merchants" description="Approve new merchants and suspend the ones that break the rules." />

      <div role="tablist" aria-label="Filter by status" className="mb-4 inline-flex rounded-lg bg-muted p-1">
        {TABS.map((tab) => {
          const selected = tab.value === status;
          return (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => selectTab(tab.value)}
              className={cn(
                'rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors',
                selected ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

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
                  <TableHead>Merchant</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Owner email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !data
                  ? Array.from({ length: 6 }, (_, index) => (
                      <TableRow key={index} className="hover:bg-transparent">
                        <TableCell colSpan={6}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : data?.items.map((merchant) => {
                      const actions = merchantActions(merchant.status);
                      const busy = busyId === merchant.id;
                      return (
                        <TableRow key={merchant.id} className={cn(loading && 'opacity-60')}>
                          <TableCell className="font-medium">{merchant.name}</TableCell>
                          <TableCell className="font-mono text-xs">{merchant.code}</TableCell>
                          <TableCell className="text-muted-foreground">{merchant.owner_email}</TableCell>
                          <TableCell>
                            <StatusBadge status={merchant.status} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatDateTime(merchant.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            {actions.includes('approve') ? (
                              <Button
                                size="sm"
                                variant={merchant.status === 'PENDING' ? 'default' : 'outline'}
                                loading={busy}
                                disabled={busyId !== null}
                                onClick={() => void approve(merchant)}
                              >
                                {!busy ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                                {merchant.status === 'PENDING' ? 'Approve' : 'Reactivate'}
                              </Button>
                            ) : null}
                            {actions.includes('suspend') ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyId !== null}
                                onClick={() => setToSuspend(merchant)}
                              >
                                <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                Suspend
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>

            {data && data.items.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No merchants here"
                description={status ? 'No merchant has this status right now.' : 'No merchant has registered yet.'}
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
        open={toSuspend !== null}
        onOpenChange={(open) => {
          if (!open) setToSuspend(null);
        }}
        title="Suspend this merchant?"
        description={
          <>
            <strong>{toSuspend?.name}</strong> and its staff will no longer be able to sign in, and its API keys stop
            working. You can reactivate it later.
          </>
        }
        confirmLabel="Suspend"
        destructive
        loading={toSuspend !== null && busyId === toSuspend.id}
        onConfirm={() => void confirmSuspend()}
      />
    </>
  );
}
