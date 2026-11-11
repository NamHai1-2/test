'use client';

import Link from 'next/link';
import { Coins, ReceiptText, Users } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getMerchantDashboard } from '@/lib/api-client';
import { errorText } from '@/lib/notify';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

export default function MerchantDashboardPage() {
  const { data, error, loading, reload } = useApi(getMerchantDashboard, []);

  return (
    <>
      <PageHeader title="Dashboard" description="How your loyalty program is doing today." />

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
        <section aria-label="Overview" className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Customers" value={data?.total_customers} icon={Users} loading={loading} />
          <StatCard
            label="Points in circulation"
            value={data?.circulating_points}
            icon={Coins}
            loading={loading}
            hint="Sum of all customer balances"
          />
          <StatCard
            label="Transactions today"
            value={data?.today_transactions}
            icon={ReceiptText}
            loading={loading}
            hint="Counted in Vietnam time (UTC+7)"
          />
        </section>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/customers" className={buttonVariants({ variant: 'outline' })}>
          Issue or redeem points
        </Link>
        <Link href="/ledger" className={buttonVariants({ variant: 'outline' })}>
          View ledger
        </Link>
      </div>
    </>
  );
}
