import { createRoute, z } from '@hono/zod-openapi';
import type { Api } from '../app.js';
import { requireAccount, requireStaff } from '../auth/auth.js';
import { bearer } from '../auth/schemas.js';
import type { Deps } from '../deps.js';
import { errors, notFound } from '../errors.js';
import { OrderSchema, orderOut, PaymentMethod, type OrderRow } from '../orders/service.js';
import { findRange } from '../ranges/repo.js';
import { RangeIdParam } from '../ranges/schemas.js';
import { normaliseCode } from './codes.js';
import { BucketCodeSchema, bucketCodeOut, type BucketCodeRow } from './schemas.js';
import { buyBucket, redeemBucketCode } from './service.js';

export const PayWithCard = z
  .object({ method: z.literal('card'), paymentMethod: PaymentMethod })
  .openapi('PayWithCard');

const buy = createRoute({
  method: 'post',
  path: '/orders/buckets',
  tags: ['Balls'],
  summary: 'Buy a bucket and get its code',
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
              payWith: PayWithCard,
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

export function ballRoutes(app: Api, deps: Deps) {
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
