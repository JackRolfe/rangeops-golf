// Today's takings: money taken, counted when paid (not when used), net of refunds.
import type { Cents, Payment, PaymentKind } from './types';

export interface Takings {
  byKind: Record<PaymentKind, Cents>;
  /** Refunds given, as a positive amount. Already taken off `byKind` and `total`. */
  refunds: Cents;
  total: Cents;
  count: number;
}

export function takings(payments: readonly Payment[]): Takings {
  const byKind: Record<PaymentKind, Cents> = { bay: 0, robot: 0, bucket: 0, pass: 0 };
  let refunds = 0;
  for (const payment of payments) {
    byKind[payment.kind] += payment.amount;
    if (payment.amount < 0) refunds -= payment.amount;
  }
  const total = byKind.bay + byKind.robot + byKind.bucket + byKind.pass;
  return { byKind, refunds, total, count: payments.filter((p) => p.amount > 0).length };
}
