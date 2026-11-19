// Passes and ball credits, held on a player's account.
// A monthly pass gives an allowance of buckets and bay-hours each calendar month until its last day.
// A credit pack is prepaid buckets that never expire.
import { addDays, dateOf, monthOf } from './time';
import type { CreditPackProduct, IsoDate, LocalDateTime, MonthlyPassProduct, Pass, PassKind, Result } from './types';

export interface PassBalance {
  active: boolean;
  /** Why the pass can't be used today, when it can't. */
  reason: string | null;
  /** Buckets that can be handed over against it now. */
  bucketsLeft: number;
  bayHoursLeft: number;
  /** What the pass gives now, in words, whichever model it follows. */
  summary: string;
  /** Nothing left to use, though the pass hasn't ended. */
  usedUp: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function passBalance(pass: Pass, date: IsoDate): PassBalance {
  const used = (what: 'bucket' | 'bay-hour', inMonth?: string) =>
    pass.redemptions.filter((r) => r.what === what && (!inMonth || monthOf(r.at) === inMonth)).length;

  if (pass.kind === 'credits') {
    if (pass.ballsLeft !== undefined) {
      const balls = Math.max(0, pass.ballsLeft);
      return { active: true, reason: null, bucketsLeft: 0, bayHoursLeft: 0, summary: `${plural(balls, 'ball')} of credit`, usedUp: balls === 0 };
    }
    const bucketsLeft = Math.max(0, pass.creditsBought - used('bucket'));
    return { active: true, reason: null, bucketsLeft, bayHoursLeft: 0, summary: `${plural(bucketsLeft, 'bucket credit')} left`, usedUp: bucketsLeft === 0 };
  }

  const month = monthOf(date);
  const bucketsLeft = Math.max(0, pass.bucketsPerMonth - used('bucket', month));
  const bayHoursLeft = Math.max(0, pass.bayHoursPerMonth - used('bay-hour', month));
  const discount = pass.discountPercent ?? 0;
  const summary =
    discount > 0 && pass.bucketsPerMonth === 0 && pass.bayHoursPerMonth === 0
      ? `${discount}% off bay-hours and buckets`
      : `${plural(bucketsLeft, 'bucket')} and ${plural(bayHoursLeft, 'bay-hour')} left this month`;
  const usedUp = discount === 0 && bucketsLeft === 0 && bayHoursLeft === 0;
  if (date < dateOf(pass.soldAt)) return { active: false, reason: 'Not started yet.', bucketsLeft, bayHoursLeft, summary: 'Not started yet', usedUp: false };
  if (pass.validUntil && date > pass.validUntil) {
    return { active: false, reason: `Ended on ${pass.validUntil}.`, bucketsLeft: 0, bayHoursLeft: 0, summary: `Ended on ${pass.validUntil}`, usedUp: false };
  }
  return { active: true, reason: null, bucketsLeft, bayHoursLeft, summary, usedUp };
}

/** Use one bucket from a pass. Returns the pass as it should be afterwards. */
export function redeemBucket(pass: Pass, at: LocalDateTime): Result<Pass> {
  const balance = passBalance(pass, dateOf(at));
  if (!balance.active) return { ok: false, errors: [`${pass.player}'s pass can't be used. ${balance.reason}`] };
  if (balance.bucketsLeft < 1) {
    return {
      ok: false,
      errors: [pass.kind === 'monthly' ? `${pass.player} has used this month's buckets.` : `${pass.player} has no ball credits left.`],
    };
  }
  return { ok: true, value: { ...pass, redemptions: [...pass.redemptions, { at, what: 'bucket' }] } };
}

export interface PassProducts {
  monthlyPass: MonthlyPassProduct;
  creditPack: CreditPackProduct;
}

/** A new pass sold now, from the range's current products. */
export function newPass(id: string, player: string, kind: PassKind, products: PassProducts, soldAt: LocalDateTime): Result<{ pass: Pass; price: number }> {
  const name = player.trim();
  if (!name) return { ok: false, errors: ['A pass needs the player’s name.'] };
  if (kind === 'monthly') {
    const { months, bucketsPerMonth, bayHoursPerMonth, price } = products.monthlyPass;
    const pass: Pass = {
      id,
      player: name,
      kind,
      soldAt,
      validUntil: addDays(addMonths(dateOf(soldAt), months), -1),
      bucketsPerMonth,
      bayHoursPerMonth,
      creditsBought: 0,
      redemptions: [],
    };
    return { ok: true, value: { pass, price } };
  }
  const { credits, price } = products.creditPack;
  const pass: Pass = { id, player: name, kind, soldAt, validUntil: null, bucketsPerMonth: 0, bayHoursPerMonth: 0, creditsBought: credits, redemptions: [] };
  return { ok: true, value: { pass, price } };
}

/** Same day of the month, `months` later; clamps to the month's last day (31 Jan + 1 is 28 Feb). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
