import type { Queryable } from '../db/db.js';
import type { Deps } from '../deps.js';
import { conflict, notFound, paymentDeclined, unprocessable } from '../errors.js';
import { chargeOrder, createOrder, type OrderRow } from '../orders/service.js';
import { findRange, type BucketProductRow } from '../ranges/repo.js';
import { newBucketCode, normaliseCode } from './codes.js';
import { buyBucketWithCredit, passDiscountLine } from './passes.js';
import type { BucketCodeRow } from './schemas.js';

export type PayWith = { method: 'card'; paymentMethod: string } | { method: 'ball_credit' };

/** Inserts a code for a paid order, retrying on the rare clash with an existing code. */
export async function issueBucketCode(deps: Deps, order: OrderRow, product: BucketProductRow, q?: Queryable): Promise<BucketCodeRow> {
  for (let attempt = 0; ; attempt++) {
    const row = await deps.db.maybeOne<BucketCodeRow>(
      `insert into bucket_codes (range_id, order_id, account_id, bucket_product_id, name, balls, code, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (range_id, code) do nothing returning *`,
      [order.range_id, order.id, order.account_id, product.id, product.name, product.balls, newBucketCode(), deps.now()],
      q,
    );
    if (row) return row;
    if (attempt > 10) throw new Error('Could not find a free bucket code');
  }
}

export async function findBucketProduct(deps: Deps, rangeIdOrSlug: string, productId: string) {
  const range = await findRange(deps.db, rangeIdOrSlug);
  const product = await deps.db.maybeOne<BucketProductRow>(
    'select * from bucket_products where id = $1 and range_id = $2',
    [productId, range.id],
  );
  if (!product) throw notFound('No such bucket at this range.');
  if (!product.active) throw unprocessable(`${product.name} is not on sale.`, 'not_on_sale');
  return { range, product };
}

/** Buys a bucket by card (less any pass discount) or from ball credit, and returns the paid order and its code. */
export async function buyBucket(deps: Deps, accountId: string, rangeIdOrSlug: string, productId: string, payWith: PayWith) {
  const { range, product } = await findBucketProduct(deps, rangeIdOrSlug, productId);
  if (payWith.method === 'ball_credit') return buyBucketWithCredit(deps, accountId, range, product);
  const lines = [
    { description: `${product.name}, ${product.balls} balls`, quantity: 1, unit_cents: product.cents },
    ...(await passDiscountLine(deps, accountId, range.id, deps.now(), product.cents, 'buckets')),
  ];
  const order = await createOrder(deps, { accountId, rangeId: range.id, kind: 'bucket', currency: range.currency, lines });
  const paid = await chargeOrder(deps, order, payWith.paymentMethod, `${range.name}: ${product.name}`);
  if (paid.status !== 'paid') throw paymentDeclined(paid.failure_reason ?? 'The payment did not go through.');
  return { order: paid, code: await issueBucketCode(deps, paid, product) };
}

/** Marks a code handed over. 404 if unknown at this range, 409 if already redeemed. */
export async function redeemBucketCode(deps: Deps, rangeId: string, input: string, staffId: string): Promise<BucketCodeRow> {
  const code = normaliseCode(input);
  const redeemed = await deps.db.maybeOne<BucketCodeRow>(
    `update bucket_codes set redeemed_at = $3, redeemed_by = $4
     where range_id = $1 and code = $2 and redeemed_at is null returning *`,
    [rangeId, code, deps.now(), staffId],
  );
  if (redeemed) return redeemed;
  const existing = await deps.db.maybeOne<BucketCodeRow>('select * from bucket_codes where range_id = $1 and code = $2', [rangeId, code]);
  if (!existing) throw notFound('No such bucket code at this range.', 'unknown_code');
  throw conflict(`That bucket was handed over at ${existing.redeemed_at!.toISOString()}.`, 'already_redeemed');
}
