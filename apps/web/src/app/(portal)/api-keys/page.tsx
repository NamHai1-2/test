'use client';

import { useState } from 'react';
import { KeyRound, Plus, TriangleAlert } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CopyButton } from '@/components/copy-button';
import { EmptyState } from '@/components/empty-state';
import { Modal } from '@/components/modal';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError, createApiKey, listApiKeys, revokeApiKey } from '@/lib/api-client';
import type { ApiKeyItem, CreatedApiKey } from '@/lib/api-types';
import { formatDateTime } from '@/lib/format';
import { MESSAGES } from '@/lib/messages';
import { errorText, notifyError, notifySuccess } from '@/lib/notify';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

export default function ApiKeysPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi(() => listApiKeys(page), [page]);

  const [creating, setCreating] = useState(false);
  // The secret lives only in this state while the dialog is open. Closing the dialog drops it (CR-07).
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyItem | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [limitError, setLimitError] = useState<string | null>(null);

  async function generate() {
    if (creating) return;
    setCreating(true);
    setLimitError(null);
    try {
      const result = await createApiKey();
      setCreated(result);
      notifySuccess('MSG10');
      reload();
    } catch (caught) {
      // MSG40 (5 keys already) is shown next to the button; other errors as a toast.
      if (caught instanceof ApiError && caught.code === 'MSG40') {
        setLimitError(errorText(caught));
      } else {
        notifyError(caught);
      }
    } finally {
      setCreating(false);
    }
  }

  async function confirmRevoke() {
    if (!revoking || revokeBusy) return;
    setRevokeBusy(true);
    try {
      await revokeApiKey(revoking.id);
      notifySuccess('MSG12');
      setRevoking(null);
      setLimitError(null);
      reload();
    } catch (caught) {
      notifyError(caught);
      setRevoking(null);
    } finally {
      setRevokeBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="API keys"
        description="Keys let your own systems issue and redeem points through the API or SDK. You can have up to 5 active keys."
        actions={
          <Button onClick={() => void generate()} loading={creating}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Generate key
          </Button>
        }
      />

      {limitError ? (
        <p role="alert" className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {limitError}
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
                  <TableHead>Key ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created (UTC+7)</TableHead>
                  <TableHead className="w-28 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !data
                  ? Array.from({ length: 3 }, (_, index) => (
                      <TableRow key={index} className="hover:bg-transparent">
                        <TableCell colSpan={4}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : data?.items.map((item) => (
                      <TableRow key={item.id} className={cn(loading && 'opacity-60')}>
                        <TableCell className="font-mono text-xs">{item.masked_key_id}</TableCell>
                        <TableCell>
                          <StatusBadge status={item.status} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(item.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.status !== 'REVOKED' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-700 hover:text-red-800"
                              onClick={() => setRevoking(item)}
                            >
                              Revoke
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>

            {data && data.items.length === 0 ? (
              <EmptyState
                icon={KeyRound}
                title="No API keys yet"
                description="Generate a key to connect your point-of-sale system."
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

      <Modal
        open={created !== null}
        onOpenChange={(open) => {
          if (!open) setCreated(null);
        }}
        title="Your new API key"
        description={MESSAGES.MSG10}
        wide
      >
        {created ? (
          <div className="space-y-4">
            <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{MESSAGES.MSG11}</span>
            </p>
            <SecretField label="Key ID" value={created.key_id} />
            <SecretField label="Secret" value={created.secret} />
            <div className="flex justify-end">
              <Button onClick={() => setCreated(null)}>I have copied the secret</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title="Revoke this API key?"
        description={
          <>
            <span className="font-mono">{revoking?.masked_key_id}</span> stops working immediately. Systems that use it
            will get errors until you give them another key. This cannot be undone.
          </>
        }
        confirmLabel="Revoke key"
        destructive
        loading={revokeBusy}
        onConfirm={() => void confirmRevoke()}
      />
    </>
  );
}

function SecretField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{label}</p>
      <div className="flex items-center gap-1 rounded-md border bg-muted/50 px-3 py-2">
        <code className="min-w-0 flex-1 break-all font-mono text-xs">{value}</code>
        <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
      </div>
    </div>
  );
}
