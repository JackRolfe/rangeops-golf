import type { Context } from 'hono';
import type { Deps } from '../deps.js';
import { forbidden, unauthorized } from '../errors.js';
import { hashToken } from './tokens.js';

export interface AccountRow {
  id: string;
  email: string;
  name: string | null;
  created_at: Date;
}

/** The signed-in account, from `Authorization: Bearer <session token>`, if any. */
export async function currentAccount(c: Context, deps: Deps): Promise<AccountRow | undefined> {
  const header = c.req.header('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return undefined;
  return deps.db.maybeOne<AccountRow>(
    `select a.* from sessions s join accounts a on a.id = s.account_id
     where s.token_hash = $1 and s.expires_at > $2`,
    [hashToken(match[1]!), deps.now()],
  );
}

export async function requireAccount(c: Context, deps: Deps): Promise<AccountRow> {
  const account = await currentAccount(c, deps);
  if (!account) throw unauthorized();
  return account;
}

export async function isStaff(deps: Deps, accountId: string, rangeId: string): Promise<boolean> {
  const row = await deps.db.maybeOne('select 1 from range_staff where account_id = $1 and range_id = $2', [accountId, rangeId]);
  return !!row;
}

/** The signed-in account, which must be staff at the range. */
export async function requireStaff(c: Context, deps: Deps, rangeId: string): Promise<AccountRow> {
  const account = await requireAccount(c, deps);
  if (!(await isStaff(deps, account.id, rangeId))) throw forbidden('Only staff at this range can do that.');
  return account;
}
