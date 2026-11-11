import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { ApiKeyStatus, MerchantStatus, TxStatus, TxType } from '@/lib/api-types';
import { titleCase } from '@/lib/format';

// One colour per meaning, the same on every screen: green = good, amber = waiting, red = problem.
const VARIANTS: Record<MerchantStatus | TxStatus | ApiKeyStatus, NonNullable<BadgeProps['variant']>> = {
  ACTIVE: 'success',
  ANCHORED: 'success',
  PENDING: 'warning',
  PENDING_ANCHOR: 'warning',
  SUSPENDED: 'danger',
  FAILED: 'danger',
  REVOKED: 'neutral',
};

export function StatusBadge({ status }: { status: MerchantStatus | TxStatus | ApiKeyStatus }) {
  return (
    <Badge variant={VARIANTS[status]} dot>
      {titleCase(status)}
    </Badge>
  );
}

const TYPE_VARIANTS: Record<TxType, NonNullable<BadgeProps['variant']>> = {
  ISSUE: 'info',
  REDEEM: 'purple',
  REVERSAL: 'neutral',
};

export function TypeBadge({ type }: { type: TxType }) {
  return <Badge variant={TYPE_VARIANTS[type]}>{titleCase(type)}</Badge>;
}
