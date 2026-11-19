import { describe, expect, it } from 'vitest';
import { passBalance, redeemBucket, sellPass } from './passes';
import type { Pass } from './types';

const products = {
  monthlyPass: { price: 4900, days: 30, discountPercent: 10 },
  creditPack: { price: 8000, balls: 500 },
};

let n = 0;
const newId = () => `p${++n}`;

function sold(passes: Pass[], kind: Pass['kind'], at = '2026-10-20T10:00', email = 'grace@example.com', name = 'Grace Tan') {
  const result = sellPass(passes, { email, name, kind }, products, at, newId);
  if (!result.ok) throw new Error(result.errors.join());
  const { pass, replaces } = result.value;
  return [...passes.filter((p) => p.id !== replaces), pass];
}

describe('selling a monthly pass', () => {
  it('gives a discount from today for its days', () => {
    const [pass] = sold([], 'monthly');
    expect(pass).toMatchObject({ kind: 'monthly', player: 'Grace Tan', email: 'grace@example.com', validUntil: '2026-11-19', discountPercent: 10 });
    expect(passBalance(pass!, '2026-11-19')).toEqual({ active: true, reason: null, summary: '10% off bay-hours and buckets', usedUp: false });
    expect(passBalance(pass!, '2026-11-20')).toMatchObject({ active: false, reason: 'Ended on 2026-11-19.' });
  });

  it('starts a second pass when the current one ends', () => {
    const passes = sold(sold([], 'monthly'), 'monthly', '2026-11-01T09:00');
    expect(passes.map((p) => p.validUntil)).toEqual(['2026-11-19', '2026-12-19']);
  });

  it('starts afresh once the last pass has ended', () => {
    const passes = sold(sold([], 'monthly'), 'monthly', '2026-12-01T09:00');
    expect(passes[1]!.validUntil).toBe('2026-12-31');
  });

  it('needs an email, because passes are held on an account', () => {
    expect(sellPass([], { email: 'Grace', kind: 'monthly' }, products, '2026-10-20T10:00', newId)).toEqual({
      ok: false,
      errors: ['Passes are held on an account: enter the player’s email.'],
    });
  });

  it('charges the product price', () => {
    const result = sellPass([], { email: 'sam@example.com', kind: 'monthly' }, products, '2026-10-20T10:00', newId);
    expect(result.ok && result.value.price).toBe(4900);
    expect(result.ok && result.value.pass.player).toBe('sam@example.com');
  });
});

describe('ball credit', () => {
  it('tops up one balance per player, which never expires', () => {
    const passes = sold(sold([], 'credits'), 'credits', '2027-03-01T09:00', ' GRACE@example.com ');
    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({ kind: 'credits', ballsLeft: 1000, validUntil: null, player: 'Grace Tan' });
    expect(passBalance(passes[0]!, '2030-01-01')).toEqual({ active: true, reason: null, summary: '1000 balls of credit', usedUp: false });
  });

  it("hands out buckets until the balls run out, and doesn't change the credit it was given", () => {
    let [credit] = sold([], 'credits');
    const before = credit!;
    for (const balls of [150, 150, 150]) {
      const result = redeemBucket(credit!, balls);
      if (!result.ok) throw new Error(result.errors.join());
      credit = result.value;
    }
    expect(credit!.ballsLeft).toBe(50);
    expect(before.ballsLeft).toBe(500);
    expect(redeemBucket(credit!, 100)).toEqual({ ok: false, errors: ['Grace Tan has 50 balls of credit, not enough for a 100-ball bucket.'] });
    const last = redeemBucket(credit!, 50);
    expect(last.ok && passBalance(last.value, '2026-10-20')).toMatchObject({ summary: '0 balls of credit', usedUp: true });
  });

  it('has nothing to hand out from a monthly pass', () => {
    const [pass] = sold([], 'monthly');
    expect(redeemBucket(pass!, 50).ok).toBe(false);
  });
});
