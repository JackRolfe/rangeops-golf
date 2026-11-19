import { createRoute, z } from '@hono/zod-openapi';
import type { Api } from '../app.js';
import type { Deps } from '../deps.js';
import { errors, unauthorized } from '../errors.js';
import { RangeSummarySchema, rangeSummary } from '../ranges/schemas.js';
import type { RangeRow } from '../ranges/repo.js';
import { requireAccount, type AccountRow } from './auth.js';
import { AccountSchema, accountOut, bearer } from './schemas.js';
import { hashToken, newToken } from './tokens.js';

export const LINK_MINUTES = 15;
export const SESSION_DAYS = 30;

const requestLink = createRoute({
  method: 'post',
  path: '/auth/email-link',
  tags: ['Accounts'],
  summary: 'Email a sign-in link',
  description:
    'Locally the link is written to the server log instead of being emailed. Always 202, whether or not the email has an account.',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ email: z.string().trim().toLowerCase().pipe(z.email().max(254)) }) } },
    },
  },
  responses: {
    202: { description: 'A link is on its way', content: { 'application/json': { schema: z.object({ sent: z.literal(true) }) } } },
    ...errors(400),
  },
});

const SessionSchema = z
  .object({ sessionToken: z.string(), expiresAt: z.string().datetime({ offset: true }), account: AccountSchema })
  .openapi('Session');

const verify = createRoute({
  method: 'post',
  path: '/auth/verify',
  tags: ['Accounts'],
  summary: 'Sign in with the token from a link',
  description: 'Creates the account on first sign-in. One account works at every RangeOps range.',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({ token: z.string().min(1), name: z.string().trim().min(1).max(100).optional() }),
        },
      },
    },
  },
  responses: {
    200: { description: 'Signed in', content: { 'application/json': { schema: SessionSchema } } },
    ...errors(400, 401),
  },
});

const MeSchema = z
  .object({ account: AccountSchema, staffAt: z.array(RangeSummarySchema).openapi({ description: 'Ranges this account can run from the console' }) })
  .openapi('Me');

const me = createRoute({
  method: 'get',
  path: '/me',
  tags: ['Accounts'],
  summary: 'The signed-in account',
  security: bearer,
  responses: {
    200: { description: 'The account', content: { 'application/json': { schema: MeSchema } } },
    ...errors(401),
  },
});

const updateMe = createRoute({
  method: 'patch',
  path: '/me',
  tags: ['Accounts'],
  summary: 'Change your name',
  security: bearer,
  request: {
    body: { required: true, content: { 'application/json': { schema: z.object({ name: z.string().trim().min(1).max(100) }) } } },
  },
  responses: {
    200: { description: 'The account', content: { 'application/json': { schema: MeSchema } } },
    ...errors(400, 401),
  },
});

const signOut = createRoute({
  method: 'post',
  path: '/auth/sign-out',
  tags: ['Accounts'],
  summary: 'End this session',
  security: bearer,
  responses: {
    204: { description: 'Signed out' },
    ...errors(401),
  },
});

export function authRoutes(app: Api, deps: Deps) {
  const { db } = deps;

  const meOut = async (account: AccountRow) => {
    const ranges = await db.many<RangeRow>(
      'select r.* from range_staff s join ranges r on r.id = s.range_id where s.account_id = $1 order by r.name',
      [account.id],
    );
    return { account: accountOut(account), staffAt: ranges.map(rangeSummary) };
  };

  app.openapi(requestLink, async (c) => {
    const email = c.req.valid('json').email;
    const token = newToken();
    const expires = new Date(deps.now().getTime() + LINK_MINUTES * 60_000);
    await db.many('insert into sign_in_links (token_hash, email, expires_at) values ($1, $2, $3)', [hashToken(token), email, expires]);
    const link = `${deps.config.appUrl}/signin?token=${encodeURIComponent(token)}`;
    await deps.mailer.send({
      to: email,
      subject: 'Your RangeOps sign-in link',
      text: `Tap to sign in to RangeOps. The link works once, for ${LINK_MINUTES} minutes.\n\n${link}`,
    });
    return c.json({ sent: true as const }, 202);
  });

  app.openapi(verify, async (c) => {
    const { token, name } = c.req.valid('json');
    const now = deps.now();
    const session = await db.tx(async (tx) => {
      const link = await db.maybeOne<{ email: string }>(
        `update sign_in_links set used_at = $2
         where token_hash = $1 and used_at is null and expires_at > $2
         returning email`,
        [hashToken(token), now],
        tx,
      );
      if (!link) return undefined;
      let account = await db.one<AccountRow>(
        `insert into accounts (email) values ($1)
         on conflict (email) do update set email = excluded.email returning *`,
        [link.email],
        tx,
      );
      if (name && !account.name) {
        account = await db.one<AccountRow>('update accounts set name = $2 where id = $1 returning *', [account.id, name], tx);
      }
      const sessionToken = newToken();
      const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
      await db.many('insert into sessions (token_hash, account_id, expires_at) values ($1, $2, $3)', [hashToken(sessionToken), account.id, expiresAt], tx);
      return { sessionToken, expiresAt, account };
    });
    if (!session) throw unauthorized('That sign-in link is unknown, used or expired. Ask for a new one.');
    return c.json(
      { sessionToken: session.sessionToken, expiresAt: session.expiresAt.toISOString(), account: accountOut(session.account) },
      200,
    );
  });

  app.openapi(me, async (c) => {
    const account = await requireAccount(c, deps);
    return c.json(await meOut(account), 200);
  });

  app.openapi(updateMe, async (c) => {
    const account = await requireAccount(c, deps);
    const updated = await db.one<AccountRow>('update accounts set name = $2 where id = $1 returning *', [account.id, c.req.valid('json').name]);
    return c.json(await meOut(updated), 200);
  });

  app.openapi(signOut, async (c) => {
    await requireAccount(c, deps);
    const token = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '')![1]!;
    await db.many('delete from sessions where token_hash = $1', [hashToken(token)]);
    return c.body(null, 204);
  });
}
