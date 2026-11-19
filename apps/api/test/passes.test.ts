import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let token: string;
let demo: any;
beforeEach(async () => {
  t = await makeTestApp(); // Tue 24 Nov 2026, 09:00 Sydney
  token = await t.signIn('parent@example.com');
  demo = await t.demo();
});
afterEach(() => t.close());

const monthly = () => demo.passProducts.find((p: any) => p.kind === 'monthly_pass');
const credit = () => demo.passProducts.find((p: any) => p.kind === 'ball_credit');
const buyPass = (product: any, paymentMethod = 'pm_fake_ok') =>
  t.call('POST', '/orders/passes', { token, body: { rangeId: 'demo', passProductId: product.id, paymentMethod } });
const buyBucket = (i: number, payWith: any) =>
  t.call('POST', '/orders/buckets', { token, body: { rangeId: 'demo', bucketProductId: demo.bucketProducts[i].id, payWith } });

describe('pass products', () => {
  it('are listed on the range', () => {
    expect(monthly()).toMatchObject({ name: 'Monthly pass', priceCents: 4900, days: 30, discountPercent: 10, balls: null });
    expect(credit()).toMatchObject({ name: '500 balls of credit', priceCents: 8000, balls: 500, days: null });
  });
});

describe('monthly pass', () => {
  it('lasts 30 days, and a second one extends from the first', async () => {
    const first = await buyPass(monthly());
    expect(first.status).toBe(201);
    expect(first.body.order).toMatchObject({ kind: 'pass', status: 'paid', totalCents: 4900 });
    expect(first.body.pass).toMatchObject({ validFrom: '2026-11-23T22:00:00.000Z', validTo: '2026-12-23T22:00:00.000Z', discountPercent: 10 });
    const second = await buyPass(monthly());
    expect(second.body.pass).toMatchObject({ validFrom: '2026-12-23T22:00:00.000Z', validTo: '2027-01-22T22:00:00.000Z' });
  });

  it('takes 10% off bay-hours but not add-ons', async () => {
    await buyPass(monthly());
    const res = await t.call('POST', '/bookings', {
      token,
      body: { bayId: demo.bays[0].id, startsAt: '2026-11-24T05:00:00.000Z', hours: 2, addOns: [{ kind: 'lesson' }], paymentMethod: 'pm_fake_ok' },
    });
    expect(res.body.totalCents).toBe(5600 - 560 + 7000);
    expect(res.body.order.lines).toContainEqual({ description: 'Monthly pass: 10% off bay-hours', quantity: 1, unitCents: -560 });
  });

  it('takes 10% off card-paid buckets', async () => {
    await buyPass(monthly());
    const res = await buyBucket(1, { method: 'card', paymentMethod: 'pm_fake_ok' });
    expect(res.body.order.totalCents).toBe(1800 - 180);
  });

  it('does not discount a booking for a day after it ends', async () => {
    await buyPass(monthly());
    const res = await t.call('POST', '/bookings', {
      token,
      body: { bayId: demo.bays[0].id, startsAt: '2026-12-24T00:00:00.000Z', paymentMethod: 'pm_fake_ok' }, // 25 Dec 11:00 Sydney
    });
    expect(res.body.totalCents).toBe(1800);
  });

  it('is not given when the card is declined', async () => {
    expect((await buyPass(monthly(), 'pm_fake_declined')).status).toBe(402);
    expect((await t.call('GET', '/me/wallet', { token })).body.passes).toEqual([]);
  });
});

describe('ball credit', () => {
  it('pays for buckets until it runs out, then refuses without changing anything', async () => {
    const pack = await buyPass(credit());
    expect(pack.body).toMatchObject({ pass: null, ballCredit: 500 });

    for (let i = 0; i < 3; i++) {
      const b = await buyBucket(2, { method: 'ball_credit' }); // 150 balls
      expect(b.status).toBe(201);
      expect(b.body.order).toMatchObject({ totalCents: 0, paymentProvider: 'ball_credit', status: 'paid' });
    }
    const short = await buyBucket(2, { method: 'ball_credit' });
    expect(short.status).toBe(409);
    expect(short.body.error.code).toBe('not_enough_credit');
    expect(t.payments.charges.size).toBe(1);

    const wallet = (await t.call('GET', '/me/wallet', { token })).body;
    expect(wallet.ballCredit).toEqual([{ range: expect.objectContaining({ slug: 'demo' }), balls: 50 }]);
    expect(wallet.bucketCodes).toHaveLength(3);
    expect((await buyBucket(0, { method: 'ball_credit' })).status).toBe(201); // 50 balls
    expect((await t.call('GET', '/me/wallet', { token })).body.ballCredit).toEqual([]);
  });

  it('starts at nothing', async () => {
    expect((await buyBucket(0, { method: 'ball_credit' })).status).toBe(409);
  });
});

describe('wallet', () => {
  it('lists passes, credit per range, and only unredeemed codes', async () => {
    await buyPass(monthly());
    await buyPass(credit());
    const a = await buyBucket(0, { method: 'card', paymentMethod: 'pm_fake_ok' });
    await buyBucket(0, { method: 'card', paymentMethod: 'pm_fake_ok' });
    const staff = await t.signIn('staff@rangeops.test');
    await t.call('POST', `/ranges/demo/bucket-codes/${a.body.bucketCode.code}/redeem`, { token: staff });

    const w = (await t.call('GET', '/me/wallet', { token })).body;
    expect(w.passes).toHaveLength(1);
    expect(w.passes[0]).toMatchObject({ name: 'Monthly pass', range: { slug: 'demo' } });
    expect(w.ballCredit[0].balls).toBe(500);
    expect(w.bucketCodes).toHaveLength(1);
    expect(w.bucketCodes[0].code).not.toBe(a.body.bucketCode.code);
  });
});
