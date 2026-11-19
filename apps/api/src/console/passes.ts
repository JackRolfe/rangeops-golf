import { createRoute, z } from '@hono/zod-openapi';
import type { Api } from '../app.js';
import { requireStaff } from '../auth/auth.js';
import { bearer } from '../auth/schemas.js';
import type { Deps } from '../deps.js';
import { errors } from '../errors.js';
import { findRange } from '../ranges/repo.js';
import { Instant, RangeIdParam } from '../ranges/schemas.js';

const Holder = z.object({ id: z.string().uuid(), email: z.string(), name: z.string().nullable() }).openapi('PassHolder');

const StaffPassesSchema = z
  .object({
    passes: z.array(
      z
        .object({
          id: z.string().uuid(),
          account: Holder,
          name: z.string(),
          discountPercent: z.number().int(),
          validFrom: Instant,
          validTo: Instant,
          createdAt: Instant,
        })
        .openapi('StaffPass'),
    ),
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

export function staffPassRoutes(app: Api, deps: Deps) {
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
