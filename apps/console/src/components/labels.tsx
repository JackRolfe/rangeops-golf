import type { BookingStatus, BucketSize, OrderStatus, Source } from '../domain/types';
import { BUCKET_BALLS } from '../domain/types';

export const SOURCE_LABEL: Record<Source, string> = { app: 'App', counter: 'Counter', partner: 'Partner' };

export function bucketLabel(size: BucketSize): string {
  return `${size[0].toUpperCase()}${size.slice(1)} (${BUCKET_BALLS[size]})`;
}

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  if (status === 'checked-in') return <span className="pill pill--good">Checked in</span>;
  if (status === 'cancelled') return <span className="pill pill--bad">Cancelled</span>;
  return <span className="pill">Booked</span>;
}

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  if (status === 'handed-over') return <span className="pill pill--good">Handed over</span>;
  if (status === 'refunded') return <span className="pill pill--bad">Refunded</span>;
  return <span className="pill pill--warn">Waiting</span>;
}
