import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let player: string;
let staff: string;
let demo: any;
beforeEach(async () => {
  t = await makeTestApp(); // Tue 24 Nov 2026, 09:00 Sydney
  player = await t.signIn('parent@example.com');
  staff = await t.signIn('staff@rangeops.test');
  demo = await t.demo();
});
afterEach(() => t.close());

const buy = (kind: string) =>
  t.call('POST', '/orders/passes', {
    token: player,
    body: { rangeId: 'demo', passProductId: demo.passProducts.find((p: any) => p.kind === kind).id, paymentMethod: 'pm_fake_ok' },
  });

describe('GET /ranges/{id}/passes', () => {
  it('lists monthly passes and ball credit with who holds them', async () => {
    expect((await buy('monthly_pass')).status).toBe(201);
    expect((await buy('ball_credit')).status).toBe(201);
    const res = await t.call('GET', '/ranges/demo/passes', { token: staff });
    expect(res.status).toBe(200);
    expect(res.body.passes).toHaveLength(1);
    expect(res.body.passes[0]).toMatchObject({
      account: { email: 'parent@example.com' },
      name: 'Monthly pass',
      discountPercent: 10,
      validFrom: '2026-11-23T22:00:00.000Z',
      validTo: '2026-12-23T22:00:00.000Z',
    });
    expect(res.body.ballCredit).toEqual([{ account: expect.objectContaining({ email: 'parent@example.com' }), balls: 500 }]);
  });

  it('is empty at a range with none, and for staff only', async () => {
    expect((await t.call('GET', '/ranges/demo/passes', { token: staff })).body).toEqual({ passes: [], ballCredit: [] });
    expect((await t.call('GET', '/ranges/demo/passes', { token: player })).status).toBe(403);
    expect((await t.call('GET', '/ranges/demo/passes')).status).toBe(401);
  });
});
