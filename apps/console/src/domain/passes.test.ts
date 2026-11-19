import { describe, expect, it } from 'vitest';
import { addMonths, newPass, passBalance, redeemBucket } from './passes';
import type { Pass } from './types';

const products = {
  monthlyPass: { price: 9900, bucketsPerMonth: 2, bayHoursPerMonth: 4, months: 3 },
  creditPack: { price: 6000, credits: 2 },
};

function sold(kind: Pass['kind'], at = '2026-10-20T10:00'): Pass {
  const result = newPass('p1', 'Grace Tan', kind, products, at);
  if (!result.ok) throw new Error(result.errors.join());
  return result.value.pass;
}

describe('newPass', () => {
  it('runs a monthly pass for its months, to the day before', () => {
    expect(sold('monthly')).toMatchObject({ validUntil: '2027-01-19', bucketsPerMonth: 2, creditsBought: 0 });
  });

  it('makes a credit pack that never expires', () => {
    expect(sold('credits')).toMatchObject({ validUntil: null, creditsBought: 2 });
  });

  it('needs a name', () => {
    expect(newPass('p', '  ', 'credits', products, '2026-10-20T10:00').ok).toBe(false);
  });

  it('charges the product price', () => {
    const result = newPass('p', 'Sam', 'monthly', products, '2026-10-20T10:00');
    expect(result.ok && result.value.price).toBe(9900);
  });
});

describe('monthly pass', () => {
  it('resets its allowance on the 1st', () => {
    let pass = sold('monthly');
    for (const at of ['2026-10-25T09:00', '2026-10-31T18:00']) {
      const r = redeemBucket(pass, at);
      if (!r.ok) throw new Error(r.errors.join());
      pass = r.value;
    }
    expect(passBalance(pass, '2026-10-31').bucketsLeft).toBe(0);
    expect(redeemBucket(pass, '2026-10-31T19:00')).toEqual({ ok: false, errors: ["Grace Tan has used this month's buckets."] });
    expect(passBalance(pass, '2026-11-01')).toEqual({ active: true, reason: null, bucketsLeft: 2, bayHoursLeft: 4 });
    expect(redeemBucket(pass, '2026-11-01T08:00').ok).toBe(true);
  });

  it('refuses after its last day', () => {
    const pass = sold('monthly');
    expect(passBalance(pass, '2027-01-19').active).toBe(true);
    expect(passBalance(pass, '2027-01-20')).toMatchObject({ active: false, reason: 'Ended on 2027-01-19.' });
    expect(redeemBucket(pass, '2027-01-20T10:00')).toEqual({ ok: false, errors: ["Grace Tan's pass can't be used. Ended on 2027-01-19."] });
  });

  it('counts bay-hours separately from buckets', () => {
    const pass = { ...sold('monthly'), redemptions: [{ at: '2026-10-21T10:00', what: 'bay-hour' as const }] };
    expect(passBalance(pass, '2026-10-21')).toMatchObject({ bucketsLeft: 2, bayHoursLeft: 3 });
  });
});

describe('credit pack', () => {
  it('never expires and refuses when empty', () => {
    let pass = sold('credits');
    for (const at of ['2026-10-21T10:00', '2028-05-01T10:00']) {
      const r = redeemBucket(pass, at);
      if (!r.ok) throw new Error(r.errors.join());
      pass = r.value;
    }
    expect(passBalance(pass, '2030-01-01')).toEqual({ active: true, reason: null, bucketsLeft: 0, bayHoursLeft: 0 });
    expect(redeemBucket(pass, '2030-01-01T10:00')).toEqual({ ok: false, errors: ['Grace Tan has no ball credits left.'] });
  });

  it('does not change the pass it was given', () => {
    const pass = sold('credits');
    redeemBucket(pass, '2026-10-21T10:00');
    expect(pass.redemptions).toEqual([]);
  });
});

describe('addMonths', () => {
  it('clamps to the end of a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-19', 2)).toBe('2027-01-19');
  });
});
