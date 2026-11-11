import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/format';

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  loading = false,
}: {
  label: string;
  value: number | undefined;
  icon: LucideIcon;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      {loading || value === undefined ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{formatNumber(value)}</p>
      )}
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}
