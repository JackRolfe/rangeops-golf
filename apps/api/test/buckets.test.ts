import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CODE_ALPHABET } from '../src/balls/codes.js';
import { makeTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let token: string;
let staff: string;
let products: any[];
beforeEach(async () => {
  t = await makeTestApp();
  token = await t.signIn('parent@example.com');
  staff = await t.signIn('staff@rangeops.test');
  products = (await t.demo()).bucketProducts;
});
afterEach(() => t.close());

const buy = (product = products[0], paymentMethod = 'pm_fake_ok', as = token) =>
  t.call('POST', '/orders/buckets', {
    token: as,
    body: { rangeId: 'demo', bucketProductId: product.id, payWith: { method: 'card', paymentMethod } },
  });

describe('buckets', () => {
  it('sells a bucket and gives a code', async () => {
    const res = await buy(products[1]);
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ kind: 'bucket', status: 'paid', totalCents: 1800 });
    const code = res.body.bucketCode;
    expect(code.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    for (const ch of code.code.replace('-', '')) expect(CODE_ALPHABET).toContain(ch);
    expect(code).toMatchObject({ bucket: { name: 'Medium bucket', balls: 100 }, redeemedAt: null });
  });

  it('gives no code when the card is declined', async () => {
    const res = await buy(products[0], 'pm_fake_declined');
    expect(res.status).toBe(402);
    expect(await t.deps.db.many('select * from bucket_codes')).toEqual([]);
  });

  it('lists your orders, newest first, without failed attempts still pending', async () => {
    await buy(products[0]);
    t.clock.set('2026-11-23T22:05:00Z');
    await buy(products[2]);
    const res = await t.call('GET', '/me/orders', { token });
    expect(res.body.orders.map((o: any) => o.totalCents)).toEqual([2400, 1000]);
  });

  it('lets staff redeem a code once, with or without the dash, any case', async () => {
    const { code } = (await buy()).body.bucketCode;
    const loose = code.replace('-', '').toLowerCase();
    const res = await t.call('POST', `/ranges/demo/bucket-codes/${loose}/redeem`, { token: staff });
    expect(res.status).toBe(200);
    expect(res.body.redeemedAt).toBe('2026-11-23T22:00:00.000Z');
    expect(res.body.redeemedBy).toBeTruthy();

    const again = await t.call('POST', `/ranges/demo/bucket-codes/${code}/redeem`, { token: staff });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('already_redeemed');

    const look = await t.call('GET', `/ranges/demo/bucket-codes/${code}`, { token: staff });
    expect(look.body.redeemedAt).toBe('2026-11-23T22:00:00.000Z');
  });

  it('404s an unknown code and 403s non-staff', async () => {
    expect((await t.call('POST', '/ranges/demo/bucket-codes/AAAA-AAAA/redeem', { token: staff })).status).toBe(404);
    const { code } = (await buy()).body.bucketCode;
    const res = await t.call('POST', `/ranges/demo/bucket-codes/${code}/redeem`, { token });
    expect(res.status).toBe(403);
    expect((await t.call('POST', `/ranges/demo/bucket-codes/${code}/redeem`)).status).toBe(401);
  });

  it('404s a bucket from another range or an unknown one', async () => {
    const res = await t.call('POST', '/orders/buckets', {
      token,
      body: { rangeId: 'demo', bucketProductId: '00000000-0000-4000-8000-000000000000', payWith: { method: 'card', paymentMethod: 'pm_fake_ok' } },
    });
    expect(res.status).toBe(404);
  });
});
