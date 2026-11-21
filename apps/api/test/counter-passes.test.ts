import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let staff: string;
let demo: any;
beforeEach(async () => {
  t = await makeTestApp(); // Tue 24 Nov 2026, 09:00 Sydney
  staff = await t.signIn('staff@rangeops.test');
  demo = await t.demo();
});
afterEach(() => t.close());

const product = (kind: string) => demo.passProducts.find((p: any) => p.kind === kind).id;
const bucket = (balls: number) => demo.bucketProducts.find((b: any) => b.balls === balls).id;
const sell = (body: Record<string, unknown>, token = staff) => t.call('POST', '/ranges/demo/counter/passes', { token, body });
const redeem = (body: Record<string, unknown>, token = staff) => t.call('POST', '/ranges/demo/counter/ball-credit/redeem', { token, body });

describe('selling at the counter', () => {
  it('sells a monthly pass to a new player, recorded as paid at the counter', async () => {
    const res = await sell({ email: ' Walker.Family@Example.com ', name: 'The Walkers', passProductId: product('monthly_pass') });
    expect(res.status).toBe(201);
    expect(res.body.account).toMatchObject({ email: 'walker.family@example.com', name: 'The Walkers' });
    expect(res.body.order).toMatchObject({ kind: 'pass', status: 'paid', totalCents: 4900, paymentProvider: 'counter' });
    expect(res.body.pass).toMatchObject({ name: 'Monthly pass', discountPercent: 10, validFrom: '2026-11-23T22:00:00.000Z', validTo: '2026-12-23T22:00:00.000Z' });
    expect(res.body.ballCredit).toBeNull();
    expect(t.payments.charges.size).toBe(0);

    const takings = (await t.call('GET', '/ranges/demo/orders', { token: staff })).body.totals;
    expect(takings).toMatchObject({ paidCents: 4900 });
  });

  it('extends a current monthly pass, and keeps the name the account already has', async () => {
    await sell({ email: 'sam@example.com', name: 'Sam', passProductId: product('monthly_pass') });
    const again = await sell({ email: 'sam@example.com', name: 'Someone else', passProductId: product('monthly_pass') });
    expect(again.body.account.name).toBe('Sam');
    expect(again.body.pass).toMatchObject({ validFrom: '2026-12-23T22:00:00.000Z', validTo: '2027-01-22T22:00:00.000Z' });
  });

  it('sells ball credit, which the player finds in the app after signing in with that email', async () => {
    const res = await sell({ email: 'grace@example.com', passProductId: product('ball_credit') });
    expect(res.body).toMatchObject({ pass: null, ballCredit: 500, order: { kind: 'ball_credit', paymentProvider: 'counter' } });
    const player = await t.signIn('grace@example.com');
    const wallet = (await t.call('GET', '/me/wallet', { token: player })).body;
    expect(wallet.ballCredit).toEqual([{ range: expect.objectContaining({ slug: 'demo' }), balls: 500 }]);
  });

  it('refuses a bad email, an unknown product and anyone but staff', async () => {
    expect((await sell({ email: 'not-an-email', passProductId: product('ball_credit') })).status).toBe(400);
    expect((await sell({ email: 'a@example.com', passProductId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    const player = await t.signIn('parent@example.com');
    expect((await sell({ email: 'a@example.com', passProductId: product('ball_credit') }, player)).status).toBe(403);
    expect((await t.call('POST', '/ranges/demo/counter/passes', { body: { email: 'a@example.com', passProductId: product('ball_credit') } })).status).toBe(401);
  });
});

describe('redeeming ball credit at the counter', () => {
  it("hands over a bucket and takes its balls off the player's credit", async () => {
    const { account } = (await sell({ email: 'grace@example.com', passProductId: product('ball_credit') })).body;
    const res = await redeem({ accountId: account.id, bucketProductId: bucket(150) });
    expect(res.status).toBe(201);
    expect(res.body.ballCredit).toBe(350);
    expect(res.body.order).toMatchObject({ kind: 'bucket', status: 'paid', totalCents: 0, paymentProvider: 'ball_credit' });
    expect(res.body.bucketCode).toMatchObject({ bucket: { balls: 150 }, redeemedAt: '2026-11-23T22:00:00.000Z' });

    const orders = (await t.call('GET', '/ranges/demo/orders', { token: staff })).body.orders;
    expect(orders.find((o: any) => o.id === res.body.order.id).bucketCode.redeemedAt).not.toBeNull();
  });

  it('refuses a bucket bigger than the credit left, and changes nothing', async () => {
    const { account } = (await sell({ email: 'grace@example.com', passProductId: product('ball_credit') })).body;
    for (let i = 0; i < 3; i++) expect((await redeem({ accountId: account.id, bucketProductId: bucket(150) })).status).toBe(201);
    const short = await redeem({ accountId: account.id, bucketProductId: bucket(100) });
    expect(short.status).toBe(409);
    expect(short.body.error.code).toBe('not_enough_credit');
    expect((await redeem({ accountId: account.id, bucketProductId: bucket(50) })).body.ballCredit).toBe(0);
  });

  it('refuses an unknown account, and anyone but staff', async () => {
    expect((await redeem({ accountId: '00000000-0000-4000-8000-000000000000', bucketProductId: bucket(50) })).status).toBe(404);
    const player = await t.signIn('parent@example.com');
    const me = (await t.call('GET', '/me', { token: player })).body.account;
    expect((await redeem({ accountId: me.id, bucketProductId: bucket(50) }, player)).status).toBe(403);
  });
});
