// Passes and ball credit, held on a player's account (ADR 0021).
// A monthly pass is a percent off bay-hours and buckets until its last day; buying another extends it.
// Ball credit is a balance of balls at the range that never expires; staff hand buckets out of it.
import { addDays, dateOf } from './time';
import type { CreditPackProduct, IsoDate, LocalDateTime, MonthlyPassProduct, Pass, PassKind, Result } from './types';

export interface PassBalance {
  active: boolean;
  /** Why the pass can't be used today, when it can't. */
  reason: string | null;
  /** What the pass gives now, in words. */
  summary: string;
  /** Ball credit with nothing left. */
  usedUp: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function passBalance(pass: Pass, date: IsoDate): PassBalance {
  if (pass.kind === 'credits') {
    const balls = Math.max(0, pass.ballsLeft);
    return { active: true, reason: null, summary: `${plural(balls, 'ball')} of credit`, usedUp: balls === 0 };
  }
  if (pass.soldAt && date < dateOf(pass.soldAt)) return { active: false, reason: 'Not started yet.', summary: 'Not started yet', usedUp: false };
  if (pass.validUntil && date > pass.validUntil) {
    return { active: false, reason: `Ended on ${pass.validUntil}.`, summary: `Ended on ${pass.validUntil}`, usedUp: false };
  }
  return { active: true, reason: null, summary: `${pass.discountPercent}% off bay-hours and buckets`, usedUp: false };
}

/** Take one bucket's balls off a player's ball credit. Returns the credit as it should be afterwards. */
export function redeemBucket(pass: Pass, balls: number): Result<Pass> {
  if (pass.kind !== 'credits') return { ok: false, errors: ['A monthly pass is a discount; it has no balls to hand out.'] };
  if (pass.ballsLeft < balls) {
    return { ok: false, errors: [`${pass.player} has ${plural(pass.ballsLeft, 'ball')} of credit, not enough for a ${balls}-ball bucket.`] };
  }
  return { ok: true, value: { ...pass, ballsLeft: pass.ballsLeft - balls } };
}

export interface PassProducts {
  monthlyPass: MonthlyPassProduct;
  creditPack: CreditPackProduct;
}

export interface CounterSale {
  email: string;
  name?: string;
  kind: PassKind;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sell a pass or ball credit at the counter, against the passes the range already holds.
 * A monthly pass starts today, or the day after the player's current one ends. Ball credit tops up the
 * player's existing balance. Returns the pass as it is after the sale, whether it replaces an existing
 * one, and the price.
 */
export function sellPass(
  passes: readonly Pass[],
  sale: CounterSale,
  products: PassProducts,
  soldAt: LocalDateTime,
  newId: () => string,
): Result<{ pass: Pass; replaces: string | null; price: number }> {
  const email = sale.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, errors: ['Passes are held on an account: enter the player’s email.'] };
  const mine = passes.filter((p) => p.email === email);
  const accountId = mine[0]?.accountId ?? `acct-${email}`;
  const player = mine[0]?.player ?? (sale.name?.trim() || email);

  if (sale.kind === 'credits') {
    const { balls, price } = products.creditPack;
    const existing = mine.find((p) => p.kind === 'credits');
    const pass: Pass = existing
      ? { ...existing, ballsLeft: existing.ballsLeft + balls }
      : { id: newId(), accountId, player, email, kind: 'credits', soldAt: null, validUntil: null, discountPercent: 0, ballsLeft: balls };
    return { ok: true, value: { pass, replaces: existing?.id ?? null, price } };
  }

  const { days, discountPercent, price } = products.monthlyPass;
  const today = dateOf(soldAt);
  const current = mine
    .filter((p) => p.kind === 'monthly' && p.validUntil && p.validUntil >= today)
    .map((p) => p.validUntil!)
    .sort()
    .at(-1);
  const pass: Pass = {
    id: newId(),
    accountId,
    player,
    email,
    kind: 'monthly',
    soldAt,
    validUntil: addDays(current ?? today, days),
    discountPercent,
    ballsLeft: 0,
  };
  return { ok: true, value: { pass, replaces: null, price } };
}
