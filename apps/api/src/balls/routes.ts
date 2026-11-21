import { createRoute, z } from '@hono/zod-openapi';
import type { Api } from '../app.js';
import { requireAccount, requireStaff } from '../auth/auth.js';
import { bearer } from '../auth/schemas.js';
import type { Deps } from '../deps.js';
import { errors, notFound } from '../errors.js';
import { OrderSchema, orderOut, PaymentMethod, type OrderRow } from '../orders/service.js';
import { findRange, type RangeRow } from '../ranges/repo.js';
import { Instant, RangeIdParam, RangeSummarySchema, rangeSummary } from '../ranges/schemas.js';
import { normaliseCode } from './codes.js';
import { BucketCodeSchema, bucketCodeOut, type BucketCodeRow } from './schemas.js';
import { buyPass, creditBalance, type PassRow } from './passes.js';
import { buyBucket, redeemBucketCode } from './service.js';

export const PayWithCard = z
  .object({ method: z.literal('card'), paymentMethod: PaymentMethod })
  .openapi('PayWithCard');

export const PayWithBallCredit = z
  .object({ method: z.literal('ball_credit') })
  .openapi('PayWithBallCredit', { description: "Spend the bucket's balls from your ball credit at this range" });

const PayWith = z.discriminatedUnion('method', [PayWithCard, PayWithBallCredit]).openapi('PayWith');

const PassSchema = z
  .object({
    id: z.string().uuid(),
    range: RangeSummarySchema,
    name: z.string(),
    discountPercent: z.number().int(),
    validFrom: Instant,
    validTo: Instant,
    orderId: z.string().uuid(),
  })
  .openapi('Pass');

const WalletSchema = z
  .object({
    passes: z.array(PassSchema).openapi({ description: 'Passes valid now or starting later' }),
    ballCredit: z.array(z.object({ range: RangeSummarySchema, balls: z.number().int() })).openapi({ description: 'Ball credit per range, where non-zero' }),
    bucketCodes: z.array(BucketCodeSchema).openapi({ description: 'Bucket codes not yet handed over' }),
  })
  .openapi('Wallet');

const buy = createRoute({
  method: 'post',
  path: '/orders/buckets',
  tags: ['Balls'],
  summary: 'Buy a bucket and get its code',
  description: 'Pay by card (less an active pass\'s discount) or from ball credit at the range.',
  security: bearer,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z
            .object({
              rangeId: z.string().openapi({ description: 'Range id or slug', example: 'demo' }),
              bucketProductId: z.string().uuid(),
              payWith: PayWith,
            })
            .openapi('BucketOrderRequest'),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Paid; show the code to get the balls',
      content: { 'application/json': { schema: z.object({ order: OrderSchema, bucketCode: BucketCodeSchema }).openapi('BucketPurchase') } },
    },
    ...errors(400, 401, 402, 404, 409, 422),
  },
});

const myOrders = createRoute({
  method: 'get',
  path: '/me/orders',
  tags: ['Balls'],
  summary: 'Everything you have paid for, at every range, newest first',
  security: bearer,
  responses: {
    200: { description: 'Orders', content: { 'application/json': { schema: z.object({ orders: z.array(OrderSchema) }) } } },
    ...errors(401),
  },
});

const CodeParams = RangeIdParam.extend({
  code: z.string().openapi({ param: { name: 'code', in: 'path' }, description: 'With or without the dash, any case', example: 'K7QM-4XRT' }),
});

const lookUp = createRoute({
  method: 'get',
  path: '/ranges/{rangeId}/bucket-codes/{code}',
  tags: ['Console'],
  summary: 'Look up a bucket code (staff)',
  security: bearer,
  request: { params: CodeParams },
  responses: {
    200: { description: 'The code and whether it was handed over', content: { 'application/json': { schema: BucketCodeSchema } } },
    ...errors(401, 403, 404),
  },
});

const redeem = createRoute({
  method: 'post',
  path: '/ranges/{rangeId}/bucket-codes/{code}/redeem',
  tags: ['Console'],
  summary: 'Hand over a bucket against its code (staff)',
  security: bearer,
  request: { params: CodeParams },
  responses: {
    200: { description: 'Redeemed', content: { 'application/json': { schema: BucketCodeSchema } } },
    ...errors(401, 403, 404, 409),
  },
});

const buyPassRoute = createRoute({
  method: 'post',
  path: '/orders/passes',
  tags: ['Balls'],
  summary: 'Buy a monthly pass or a ball credit pack',
  description: 'A second monthly pass at the same range starts when the current one ends.',
  security: bearer,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z
            .object({
              rangeId: z.string().openapi({ description: 'Range id or slug', example: 'demo' }),
              passProductId: z.string().uuid(),
              paymentMethod: PaymentMethod,
            })
            .openapi('PassOrderRequest'),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Paid',
      content: {
        'application/json': {
          schema: z
            .object({
              order: OrderSchema,
              pass: PassSchema.nullable().openapi({ description: 'The pass, for a monthly pass' }),
              ballCredit: z.number().int().nullable().openapi({ description: 'Your new ball credit at this range, for a credit pack' }),
            })
            .openapi('PassPurchase'),
        },
      },
    },
    ...errors(400, 401, 402, 404, 422),
  },
});

const wallet = createRoute({
  method: 'get',
  path: '/me/wallet',
  tags: ['Balls'],
  summary: 'Your passes, ball credit and unused bucket codes, at every range',
  security: bearer,
  responses: {
    200: { description: 'The wallet', content: { 'application/json': { schema: WalletSchema } } },
    ...errors(401),
  },
});

export function ballRoutes(app: Api, deps: Deps) {
  const ranges = async (ids: string[]) => {
    const rows = await deps.db.many<RangeRow>('select * from ranges where id = any($1::uuid[])', [ids]);
    return new Map(rows.map((r) => [r.id, rangeSummary(r)]));
  };
  const passOut = (p: PassRow, range: z.infer<typeof RangeSummarySchema>) => ({
    id: p.id,
    range,
    name: p.name,
    discountPercent: p.discount_pct,
    validFrom: p.valid_from.toISOString(),
    validTo: p.valid_to.toISOString(),
    orderId: p.order_id,
  });

  app.openapi(buyPassRoute, async (c) => {
    const account = await requireAccount(c, deps);
    const body = c.req.valid('json');
    const { order, pass } = await buyPass(deps, account.id, body.rangeId, body.passProductId, body.paymentMethod);
    const range = (await ranges([order.range_id])).get(order.range_id)!;
    return c.json(
      {
        order: await orderOut(deps, order),
        pass: pass ? passOut(pass, range) : null,
        ballCredit: pass ? null : await creditBalance(deps, account.id, order.range_id),
      },
      201,
    );
  });

  app.openapi(wallet, async (c) => {
    const account = await requireAccount(c, deps);
    const now = deps.now();
    const [passes, credit, codes] = await Promise.all([
      deps.db.many<PassRow>('select * from passes where account_id = $1 and valid_to > $2 order by valid_from', [account.id, now]),
      deps.db.many<{ range_id: string; balls: number }>(
        `select range_id, sum(balls)::int as balls from ball_credit_entries where account_id = $1
         group by range_id having sum(balls) <> 0`,
        [account.id],
      ),
      deps.db.many<BucketCodeRow>('select * from bucket_codes where account_id = $1 and redeemed_at is null order by created_at desc', [account.id]),
    ]);
    const byId = await ranges([...passes.map((p) => p.range_id), ...credit.map((r) => r.range_id)]);
    return c.json(
      {
        passes: passes.map((p) => passOut(p, byId.get(p.range_id)!)),
        ballCredit: credit.map((r) => ({ range: byId.get(r.range_id)!, balls: r.balls })),
        bucketCodes: codes.map(bucketCodeOut),
      },
      200,
    );
  });

  app.openapi(buy, async (c) => {
    const account = await requireAccount(c, deps);
    const body = c.req.valid('json');
    const { order, code } = await buyBucket(deps, account.id, body.rangeId, body.bucketProductId, body.payWith);
    return c.json({ order: await orderOut(deps, order), bucketCode: bucketCodeOut(code) }, 201);
  });

  app.openapi(myOrders, async (c) => {
    const account = await requireAccount(c, deps);
    const rows = await deps.db.many<OrderRow>(
      "select * from orders where account_id = $1 and status <> 'pending' order by created_at desc",
      [account.id],
    );
    return c.json({ orders: await Promise.all(rows.map((o) => orderOut(deps, o))) }, 200);
  });

  app.openapi(lookUp, async (c) => {
    const { rangeId, code } = c.req.valid('param');
    const range = await findRange(deps.db, rangeId);
    await requireStaff(c, deps, range.id);
    const row = await deps.db.maybeOne<BucketCodeRow>('select * from bucket_codes where range_id = $1 and code = $2', [range.id, normaliseCode(code)]);
    if (!row) throw notFound('No such bucket code at this range.', 'unknown_code');
    return c.json(bucketCodeOut(row), 200);
  });

  app.openapi(redeem, async (c) => {
    const { rangeId, code } = c.req.valid('param');
    const range = await findRange(deps.db, rangeId);
    const staff = await requireStaff(c, deps, range.id);
    return c.json(bucketCodeOut(await redeemBucketCode(deps, range.id, code, staff.id)), 200);
  });
}
