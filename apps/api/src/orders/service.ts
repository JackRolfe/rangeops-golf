import { z } from '@hono/zod-openapi';
import type { Queryable } from '../db/db.js';
import type { Deps } from '../deps.js';

export type OrderKind = 'booking' | 'bucket' | 'pass' | 'ball_credit';
export type OrderStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface OrderRow {
  id: string;
  account_id: string | null;
  range_id: string;
  kind: OrderKind;
  total_cents: number;
  currency: string;
  status: OrderStatus;
  payment_provider: string | null;
  charge_id: string | null;
  failure_reason: string | null;
  created_at: Date;
  paid_at: Date | null;
  refunded_at: Date | null;
}

export interface OrderLineRow {
  description: string;
  quantity: number;
  unit_cents: number;
}

export interface NewOrder {
  accountId: string | null;
  rangeId: string;
  kind: OrderKind;
  currency: string;
  lines: OrderLineRow[];
}

export const lineTotal = (lines: OrderLineRow[]) => lines.reduce((sum, l) => sum + l.quantity * l.unit_cents, 0);

/** Records a pending order and its lines. */
export async function createOrder(deps: Deps, order: NewOrder, q?: Queryable): Promise<OrderRow> {
  const row = await deps.db.one<OrderRow>(
    `insert into orders (account_id, range_id, kind, total_cents, currency, status, created_at)
     values ($1, $2, $3, $4, $5, 'pending', $6) returning *`,
    [order.accountId, order.rangeId, order.kind, lineTotal(order.lines), order.currency, deps.now()],
    q,
  );
  for (const [i, l] of order.lines.entries()) {
    await deps.db.many(
      'insert into order_lines (order_id, position, description, quantity, unit_cents) values ($1, $2, $3, $4, $5)',
      [row.id, i, l.description, l.quantity, l.unit_cents],
      q,
    );
  }
  return row;
}

/** Marks an order paid with no charge: a zero total, or paid some other way (ball credit, another booking source). */
export async function markPaid(deps: Deps, orderId: string, provider: string, q?: Queryable): Promise<OrderRow> {
  return deps.db.one<OrderRow>(
    "update orders set status = 'paid', payment_provider = $2, paid_at = $3 where id = $1 returning *",
    [orderId, provider, deps.now()],
    q,
  );
}

/**
 * Charges a pending order through the payment provider and marks it paid or
 * failed. Runs outside any transaction, since a real provider is a network call.
 */
export async function chargeOrder(deps: Deps, order: OrderRow, paymentMethod: string | undefined, description: string): Promise<OrderRow> {
  if (order.total_cents === 0) return markPaid(deps, order.id, 'none');
  if (!paymentMethod) {
    return deps.db.one<OrderRow>(
      "update orders set status = 'failed', failure_reason = $2 where id = $1 returning *",
      [order.id, 'No payment method given.'],
    );
  }
  const result = await deps.payments.charge({
    amountCents: order.total_cents,
    currency: order.currency,
    description,
    paymentMethod,
    idempotencyKey: order.id,
  });
  if (!result.ok) {
    return deps.db.one<OrderRow>(
      "update orders set status = 'failed', payment_provider = $2, failure_reason = $3 where id = $1 returning *",
      [order.id, deps.payments.name, result.reason],
    );
  }
  return deps.db.one<OrderRow>(
    "update orders set status = 'paid', payment_provider = $2, charge_id = $3, paid_at = $4 where id = $1 returning *",
    [order.id, deps.payments.name, result.chargeId, deps.now()],
  );
}

/** Refunds a paid order in full. Orders paid without a charge are just marked refunded. */
export async function refundOrder(deps: Deps, order: OrderRow): Promise<OrderRow> {
  if (order.status !== 'paid') return order;
  if (order.charge_id) {
    const result = await deps.payments.refund({ chargeId: order.charge_id, amountCents: order.total_cents });
    if (!result.ok) throw new Error(`Refund failed for order ${order.id}: ${result.reason}`);
  }
  return deps.db.one<OrderRow>(
    "update orders set status = 'refunded', refunded_at = $2 where id = $1 returning *",
    [order.id, deps.now()],
  );
}

export const OrderSchema = z
  .object({
    id: z.string().uuid(),
    accountId: z.string().uuid().nullable(),
    rangeId: z.string().uuid(),
    kind: z.enum(['booking', 'bucket', 'pass', 'ball_credit']),
    status: z.enum(['pending', 'paid', 'failed', 'refunded']),
    totalCents: z.number().int(),
    currency: z.string(),
    lines: z.array(z.object({ description: z.string(), quantity: z.number().int(), unitCents: z.number().int() })),
    paymentProvider: z.string().nullable().openapi({ description: '"fake" today; "none" when nothing was charged; "ball_credit"; "external"' }),
    failureReason: z.string().nullable(),
    createdAt: z.string().datetime({ offset: true }),
    paidAt: z.string().datetime({ offset: true }).nullable(),
    refundedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .openapi('Order');

export type OrderOut = z.infer<typeof OrderSchema>;

export async function orderOut(deps: Deps, order: OrderRow, q?: Queryable): Promise<OrderOut> {
  const lines = await deps.db.many<OrderLineRow>(
    'select description, quantity, unit_cents from order_lines where order_id = $1 order by position',
    [order.id],
    q,
  );
  return {
    id: order.id,
    accountId: order.account_id,
    rangeId: order.range_id,
    kind: order.kind,
    status: order.status,
    totalCents: order.total_cents,
    currency: order.currency,
    lines: lines.map((l) => ({ description: l.description, quantity: l.quantity, unitCents: l.unit_cents })),
    paymentProvider: order.payment_provider,
    failureReason: order.failure_reason,
    createdAt: order.created_at.toISOString(),
    paidAt: order.paid_at?.toISOString() ?? null,
    refundedAt: order.refunded_at?.toISOString() ?? null,
  };
}

export const PaymentMethod = z.string().min(1).openapi({
  description: "A payment method from the provider's card form. With the local fake provider: pm_fake_ok succeeds, pm_fake_declined declines.",
  example: 'pm_fake_ok',
});
