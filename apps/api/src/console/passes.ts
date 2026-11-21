import { createRoute, z } from '@hono/zod-openapi';
import type { Api } from '../app.js';
import { requireStaff } from '../auth/auth.js';
import { bearer } from '../auth/schemas.js';
import type { Deps } from '../deps.js';
import { BucketCodeSchema, bucketCodeOut } from '../balls/schemas.js';
import { creditBalance, sellPassAtCounter, buyBucketWithCredit, type PassRow } from '../balls/passes.js';
import { findBucketProduct, redeemBucketCode } from '../balls/service.js';
import { errors, notFound } from '../errors.js';
import { OrderSchema, orderOut } from '../orders/service.js';
import { findRange } from '../ranges/repo.js';
import { Instant, RangeIdParam } from '../ranges/schemas.js';

const Holder = z.object({ id: z.string().uuid(), email: z.string(), name: z.string().nullable() }).openapi('PassHolder');

const StaffPassSchema = z
  .object({
    id: z.string().uuid(),
    account: Holder,
    name: z.string(),
    discountPercent: z.number().int(),
    validFrom: Instant,
    validTo: Instant,
    createdAt: Instant,
  })
  .openapi('StaffPass');

const StaffPassesSchema = z
  .object({
    passes: z.array(StaffPassSchema),
    ballCredit: z.array(z.object({ account: Holder, balls: z.number().int() }).openapi('StaffBallCredit')),
  })
  .openapi('StaffPasses');

const listPasses = createRoute({
  method: 'get',
  path: '/ranges/{rangeId}/passes',
  tags: ['Console'],
  summary: 'Passes and ball credit held at a range (staff)',
  description: 'Monthly passes, newest first, and every account with ball credit left at the range.',
  security: bearer,
  request: { params: RangeIdParam },
  responses: {
    200: { description: 'Passes and ball credit', content: { 'application/json': { schema: StaffPassesSchema } } },
    ...errors(401, 403, 404),
  },
});

const counterSale = createRoute({
  method: 'post',
  path: '/ranges/{rangeId}/counter/passes',
  tags: ['Console'],
  summary: 'Sell a monthly pass or ball credit at the counter (staff)',
  description:
    'Paid at the counter, so recorded as a paid order with payment provider "counter", which shows in the day\'s takings. ' +
    'Passes are held on an account: one is made for the email if it has none, so the player can sign in later and find it. ' +
    'A second monthly pass starts when the current one ends.',
  security: bearer,
  request: {
    params: RangeIdParam,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z
            .object({
              email: z.string().trim().toLowerCase().email().max(200),
              name: z.string().trim().min(1).max(100).optional().openapi({ description: "The player's name, if the account has none yet" }),
              passProductId: z.string().uuid(),
            })
            .openapi('CounterPassSale'),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Sold',
      content: {
        'application/json': {
          schema: z
            .object({
              order: OrderSchema,
              account: Holder,
              pass: StaffPassSchema.nullable().openapi({ description: 'For a monthly pass' }),
              ballCredit: z.number().int().nullable().openapi({ description: 'The new ball credit at this range, for a credit pack' }),
            })
            .openapi('CounterPassSaleResult'),
        },
      },
    },
    ...errors(400, 401, 403, 404, 422),
  },
});

const redeemCredit = createRoute({
  method: 'post',
  path: '/ranges/{rangeId}/counter/ball-credit/redeem',
  tags: ['Console'],
  summary: "Hand over a bucket from a player's ball credit (staff)",
  description:
    "Takes the bucket's balls off the account's credit at this range and hands it over: the bucket code comes back already redeemed, " +
    'and the bucket order (paid by ball credit, 0 cents) shows in the day\'s orders. 409 not_enough_credit changes nothing.',
  security: bearer,
  request: {
    params: RangeIdParam,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({ accountId: z.string().uuid(), bucketProductId: z.string().uuid() }).openapi('CounterCreditRedemption'),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Handed over',
      content: {
        'application/json': {
          schema: z
            .object({ order: OrderSchema, bucketCode: BucketCodeSchema, ballCredit: z.number().int().openapi({ description: 'Balls left at this range' }) })
            .openapi('CounterCreditRedemptionResult'),
        },
      },
    },
    ...errors(400, 401, 403, 404, 409, 422),
  },
});

interface HolderRow {
  id: string;
  email: string;
  name: string | null;
}

const staffPassOut = (p: PassRow, holder: HolderRow): z.infer<typeof StaffPassSchema> => ({
  id: p.id,
  account: holder,
  name: p.name,
  discountPercent: p.discount_pct,
  validFrom: p.valid_from.toISOString(),
  validTo: p.valid_to.toISOString(),
  createdAt: p.created_at.toISOString(),
});

export function staffPassRoutes(app: Api, deps: Deps) {
  app.openapi(counterSale, async (c) => {
    const range = await findRange(deps.db, c.req.valid('param').rangeId);
    await requireStaff(c, deps, range.id);
    const body = c.req.valid('json');
    const holder = await deps.db.one<HolderRow>(
      `insert into accounts (email, name) values ($1, $2)
       on conflict (email) do update set name = coalesce(accounts.name, excluded.name) returning id, email, name`,
      [body.email, body.name ?? null],
    );
    const { order, pass } = await sellPassAtCounter(deps, holder.id, range, body.passProductId);
    return c.json(
      {
        order: await orderOut(deps, order),
        account: holder,
        pass: pass ? staffPassOut(pass, holder) : null,
        ballCredit: pass ? null : await creditBalance(deps, holder.id, range.id),
      },
      201,
    );
  });

  app.openapi(redeemCredit, async (c) => {
    const range = await findRange(deps.db, c.req.valid('param').rangeId);
    const staff = await requireStaff(c, deps, range.id);
    const body = c.req.valid('json');
    const account = await deps.db.maybeOne<HolderRow>('select id, email, name from accounts where id = $1', [body.accountId]);
    if (!account) throw notFound('No such account.');
    const { product } = await findBucketProduct(deps, range.id, body.bucketProductId);
    const { order, code } = await buyBucketWithCredit(deps, account.id, range, product);
    const redeemed = await redeemBucketCode(deps, range.id, code.code, staff.id);
    return c.json(
      { order: await orderOut(deps, order), bucketCode: bucketCodeOut(redeemed), ballCredit: await creditBalance(deps, account.id, range.id) },
      201,
    );
  });

  app.openapi(listPasses, async (c) => {
    const range = await findRange(deps.db, c.req.valid('param').rangeId);
    await requireStaff(c, deps, range.id);
    const passes = await deps.db.many<{
      id: string;
      account_id: string;
      email: string;
      account_name: string | null;
      name: string;
      discount_pct: number;
      valid_from: Date;
      valid_to: Date;
      created_at: Date;
    }>(
      `select p.id, p.account_id, a.email, a.name as account_name, p.name, p.discount_pct, p.valid_from, p.valid_to, p.created_at
       from passes p join accounts a on a.id = p.account_id
       where p.range_id = $1 order by p.created_at desc limit 500`,
      [range.id],
    );
    const credit = await deps.db.many<{ account_id: string; email: string; account_name: string | null; balls: number }>(
      `select e.account_id, a.email, a.name as account_name, sum(e.balls)::int as balls
       from ball_credit_entries e join accounts a on a.id = e.account_id
       where e.range_id = $1 group by e.account_id, a.email, a.name having sum(e.balls) > 0 order by a.email`,
      [range.id],
    );
    return c.json(
      {
        passes: passes.map((p) => ({
          id: p.id,
          account: { id: p.account_id, email: p.email, name: p.account_name },
          name: p.name,
          discountPercent: p.discount_pct,
          validFrom: p.valid_from.toISOString(),
          validTo: p.valid_to.toISOString(),
          createdAt: p.created_at.toISOString(),
        })),
        ballCredit: credit.map((b) => ({ account: { id: b.account_id, email: b.email, name: b.account_name }, balls: b.balls })),
      },
      200,
    );
  });
}
