'use client';

import Link from 'next/link';
import { ArrowDownToLine, ArrowUpFromLine, Building2, Clock, PauseCircle, Users } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getAdminDashboard } from '@/lib/api-client';
import { errorText } from '@/lib/notify';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

export default function AdminDashboardPage() {
  const { data, error, loading, reload } = useApi(getAdminDashboard, []);

  return (
    <>
      <PageHeader title="Dashboard" description="Platform overview across all merchants." />

      {error ? (
        <Card className="p-6">
          <p role="alert" className="text-sm text-red-700">
            {errorText(error)}
          </p>
          <button type="button" onClick={reload} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3')}>
            Try again
          </button>
        </Card>
      ) : (
        <>
          <section aria-label="Merchants" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total merchants" value={data?.merchants.total} icon={Building2} loading={loading} />
            <StatCard
              label="Pending approval"
              value={data?.merchants.pending}
              icon={Clock}
              loading={loading}
              hint="Waiting for an Admin"
            />
            <StatCard label="Active" value={data?.merchants.active} icon={Building2} loading={loading} />
            <StatCard label="Suspended" value={data?.merchants.suspended} icon={PauseCircle} loading={loading} />
          </section>

          <section aria-label="Points" className="mt-4 grid gap-4 sm:grid-cols-3">
            <StatCard label="Customers" value={data?.total_customers} icon={Users} loading={loading} />
            <StatCard label="Points issued" value={data?.points_issued} icon={ArrowUpFromLine} loading={loading} />
            <StatCard label="Points redeemed" value={data?.points_redeemed} icon={ArrowDownToLine} loading={loading} />
          </section>

          {data && data.merchants.pending > 0 ? (
            <Card className="mt-6 flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-900">
                {data.merchants.pending} merchant{data.merchants.pending === 1 ? ' is' : 's are'} waiting for approval.
              </p>
              <Link href="/admin/merchants" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Review merchants
              </Link>
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}
