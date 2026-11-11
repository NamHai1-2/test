import type { MerchantStatus } from './api-types';

export type MerchantAction = 'approve' | 'suspend';

/**
 * Buttons offered for a merchant (SRS 3.2.1.2, api-spec B.3):
 * PENDING -> Approve, ACTIVE -> Suspend, SUSPENDED -> Approve (activates it again).
 * Any other transition is refused by the server with MSG33, so the UI never offers it.
 */
export function merchantActions(status: MerchantStatus): readonly MerchantAction[] {
  if (status === 'PENDING') return ['approve'];
  if (status === 'ACTIVE') return ['suspend'];
  return ['approve'];
}
