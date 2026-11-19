import type { Queryable } from '../db/db.js';
import type { Deps } from '../deps.js';
import { conflict, notFound, paymentDeclined, unprocessable } from '../errors.js';
import { chargeOrder, createOrder, markPaid, type OrderLineRow, type OrderRow } from '../orders/service.js';
import { percentOff } from '../pricing.js';
import { findRange, type BucketProductRow, type RangeRow } from '../ranges/repo.js';
import type { BucketCodeRow } from './schemas.js';
import { issueBucketCode } from './service.js';

export interface PassProductRow {
  id: string;
  range_id: string;
  kind: 'monthly_pass' | 'ball_credit';
  name: string;
  cents: number;
  days: number | null;
  discount_pct: number | null;
  balls: number | null;
  active: boolean;
}

export interface PassRow {
  id: string;
  account_id: string;
  range_id: string;
  pass_product_id: string;
  order_id: string;
  name: string;
  discount_pct: number;
  valid_from: Date;
  valid_to: Date;
  created_at: Date;
}

/** The pass with the best discount valid at an instant, if any. */
export async function activePass(deps: Deps, accountId: string | null, rangeId: string, at: Date, q?: Queryable) {
  if (!accountId) return undefined;
  return deps.db.maybeOne<PassRow>(
    `select * from passes where account_id = $1 and range_id = $2 and valid_from <= $3 and valid_to > $3
     order by discount_pct desc limit 1`,
    [accountId, rangeId, at],
    q,
  );
}

/** A negative order line for an active pass's discount on some amount, or nothing. */
export async function passDiscountLine(
  deps: Deps,
  accountId: string | null,
  rangeId: string,
  at: Date,
  cents: number,
  what: string,
): Promise<OrderLineRow[]> {
  const pass = await activePass(deps, accountId, rangeId, at);
  const off = pass ? percentOff(cents, pass.discount_pct) : 0;
  if (!pass || off === 0) return [];
  return [{ description: `${pass.name}: ${pass.discount_pct}% off ${what}`, quantity: 1, unit_cents: -off }];
}

export async function creditBalance(deps: Deps, accountId: string, rangeId: string, q?: Queryable): Promise<number> {
  const row = await deps.db.one<{ balls: number }>(
    'select coalesce(sum(balls), 0)::int as balls from ball_credit_entries where account_id = $1 and range_id = $2',
    [accountId, rangeId],
    q,
  );
  return row.balls;
}

/** Buys a monthly pass (extending any current one) or a ball credit pack. */
export async function buyPass(deps: Deps, accountId: string, rangeIdOrSlug: string, productId: string, paymentMethod: string) {
  const range = await findRange(deps.db, rangeIdOrSlug);
  const product = await deps.db.maybeOne<PassProductRow>('select * from pass_products where id = $1 and range_id = $2', [productId, range.id]);
  if (!product) throw notFound('No such pass at this range.');
  if (!product.active) throw unprocessable(`${product.name} is not on sale.`, 'not_on_sale');

  const order = await createOrder(deps, {
    accountId,
    rangeId: range.id,
    kind: product.kind === 'monthly_pass' ? 'pass' : 'ball_credit',
    currency: range.currency,
    lines: [{ description: product.name, quantity: 1, unit_cents: product.cents }],
  });
  const paid = await chargeOrder(deps, order, paymentMethod, `${range.name}: ${product.name}`);
  if (paid.status !== 'paid') throw paymentDeclined(paid.failure_reason ?? 'The payment did not go through.');

  if (product.kind === 'ball_credit') {
    await deps.db.many(
      "insert into ball_credit_entries (account_id, range_id, balls, reason, order_id, created_at) values ($1, $2, $3, 'purchase', $4, $5)",
      [accountId, range.id, product.balls, paid.id, deps.now()],
    );
    return { order: paid, pass: undefined };
  }

  const now = deps.now();
  const latest = await deps.db.maybeOne<{ valid_to: Date }>(
    'select max(valid_to) as valid_to from passes where account_id = $1 and range_id = $2 and valid_to > $3 having max(valid_to) is not null',
    [accountId, range.id, now],
  );
  const from = latest?.valid_to ?? now;
  const to = new Date(from.getTime() + product.days! * 86_400_000);
  const pass = await deps.db.one<PassRow>(
    `insert into passes (account_id, range_id, pass_product_id, order_id, name, discount_pct, valid_from, valid_to, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
    [accountId, range.id, product.id, paid.id, product.name, product.discount_pct, from, to, now],
  );
  return { order: paid, pass };
}

/** Pays for a bucket from the account's ball credit at the range. 409, changing nothing, if there isn't enough. */
export async function buyBucketWithCredit(
  deps: Deps,
  accountId: string,
  range: RangeRow,
  product: BucketProductRow,
): Promise<{ order: OrderRow; code: BucketCodeRow }> {
  return deps.db.tx(async (tx) => {
    const balance = await creditBalance(deps, accountId, range.id, tx);
    if (balance < product.balls) {
      throw conflict(`${product.name} needs ${product.balls} balls of credit; you have ${balance}.`, 'not_enough_credit');
    }
    const order = await createOrder(
      deps,
      {
        accountId,
        rangeId: range.id,
        kind: 'bucket',
        currency: range.currency,
        lines: [{ description: `${product.name}, ${product.balls} balls, from ball credit`, quantity: 1, unit_cents: 0 }],
      },
      tx,
    );
    const paid = await markPaid(deps, order.id, 'ball_credit', tx);
    const code = await issueBucketCode(deps, paid, product, tx);
    await deps.db.many(
      "insert into ball_credit_entries (account_id, range_id, balls, reason, bucket_code_id, created_at) values ($1, $2, $3, 'bucket', $4, $5)",
      [accountId, range.id, -product.balls, code.id, deps.now()],
      tx,
    );
    return { order: paid, code };
  });
}
