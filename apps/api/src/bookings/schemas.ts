import { z } from '@hono/zod-openapi';
import type { Queryable } from '../db/db.js';
import type { Deps } from '../deps.js';
import { OrderSchema, orderOut, type OrderRow } from '../orders/service.js';
import type { BayRow, RangeRow } from '../ranges/repo.js';
import { AddOnKindSchema, Cents, Instant, RangeSummarySchema, rangeSummary } from '../ranges/schemas.js';
import { HOUR_MS } from '../time.js';
import type { BookingRow } from './service.js';

export const AddOnRequestSchema = z
  .object({
    kind: AddOnKindSchema,
    quantity: z.number().int().min(1).max(4).optional().openapi({ description: 'Sets of clubs; 1 for a robot or a lesson. Defaults to 1.' }),
  })
  .openapi('AddOnRequest');

export const BookingSchema = z
  .object({
    id: z.string().uuid(),
    range: RangeSummarySchema,
    bay: z.object({ id: z.string().uuid(), number: z.number().int(), name: z.string() }),
    accountId: z.string().uuid().nullable(),
    source: z.enum(['rangeops', 'external']).openapi({ description: 'rangeops: booked in the app. external: handed in from another booking system.' }),
    externalRef: z.string().nullable(),
    customerName: z.string().nullable(),
    startsAt: Instant,
    endsAt: Instant,
    hours: z.number().int(),
    status: z.enum(['pending_payment', 'confirmed', 'cancelled']),
    checkedInAt: Instant.nullable(),
    addOns: z.array(z.object({ kind: AddOnKindSchema, quantity: z.number().int(), priceCents: Cents })),
    totalCents: Cents,
    currency: z.string(),
    order: OrderSchema.nullable(),
    createdAt: Instant,
    cancelledAt: Instant.nullable(),
  })
  .openapi('Booking');

export type BookingOut = z.infer<typeof BookingSchema>;

export async function bookingOut(deps: Deps, b: BookingRow, q?: Queryable): Promise<BookingOut> {
  const { db } = deps;
  const [range, bay, addOns, order] = await Promise.all([
    db.one<RangeRow>('select * from ranges where id = $1', [b.range_id], q),
    db.one<BayRow>('select * from bays where id = $1', [b.bay_id], q),
    db.many<{ kind: 'robot' | 'club_hire' | 'lesson'; quantity: number; total_cents: number }>(
      'select kind, quantity, total_cents from booking_addons where booking_id = $1 order by kind',
      [b.id],
      q,
    ),
    b.order_id ? db.one<OrderRow>('select * from orders where id = $1', [b.order_id], q) : Promise.resolve(undefined),
  ]);
  return {
    id: b.id,
    range: rangeSummary(range),
    bay: { id: bay.id, number: bay.number, name: bay.name },
    accountId: b.account_id,
    source: b.source,
    externalRef: b.external_ref,
    customerName: b.customer_name,
    startsAt: b.starts_at.toISOString(),
    endsAt: b.ends_at.toISOString(),
    hours: Math.round((b.ends_at.getTime() - b.starts_at.getTime()) / HOUR_MS),
    status: b.status,
    checkedInAt: b.checked_in_at?.toISOString() ?? null,
    addOns: addOns.map((a) => ({ kind: a.kind, quantity: a.quantity, priceCents: a.total_cents })),
    totalCents: order?.total_cents ?? 0,
    currency: range.currency,
    order: order ? await orderOut(deps, order, q) : null,
    createdAt: b.created_at.toISOString(),
    cancelledAt: b.cancelled_at?.toISOString() ?? null,
  };
}

export const BookingIdParam = z.object({
  bookingId: z.string().uuid().openapi({ param: { name: 'bookingId', in: 'path' } }),
});
