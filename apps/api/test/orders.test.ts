import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chargeOrder, createOrder, orderOut, refundOrder } from '../src/orders/service.js';
import { makeTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let rangeId: string;
beforeEach(async () => {
  t = await makeTestApp();
  rangeId = (await t.deps.db.one<{ id: string }>("select id from ranges where slug = 'demo'")).id;
});
afterEach(() => t.close());

const newOrder = (unit: number) =>
  createOrder(t.deps, {
    accountId: null, rangeId, kind: 'bucket', currency: 'AUD',
    lines: [{ description: 'Small bucket', quantity: 2, unit_cents: unit }],
  });

describe('orders', () => {
  it('charges a pending order and records the charge', async () => {
    const o = await newOrder(1000);
    expect(o).toMatchObject({ status: 'pending', total_cents: 2000 });
    const paid = await chargeOrder(t.deps, o, 'pm_fake_ok', 'test');
    expect(paid).toMatchObject({ status: 'paid', payment_provider: 'fake' });
    expect(t.payments.charges.get(paid.charge_id!)?.amountCents).toBe(2000);
    expect((await orderOut(t.deps, paid)).lines).toEqual([{ description: 'Small bucket', quantity: 2, unitCents: 1000 }]);
  });

  it('marks a declined order failed with the reason', async () => {
    const failed = await chargeOrder(t.deps, await newOrder(1000), 'pm_fake_declined', 'test');
    expect(failed).toMatchObject({ status: 'failed', failure_reason: 'Your card was declined.', charge_id: null });
  });

  it('skips the charge for a zero total', async () => {
    const paid = await chargeOrder(t.deps, await newOrder(0), undefined, 'test');
    expect(paid).toMatchObject({ status: 'paid', payment_provider: 'none' });
    expect(t.payments.charges.size).toBe(0);
  });

  it('refunds a paid order in full', async () => {
    const paid = await chargeOrder(t.deps, await newOrder(1000), 'pm_fake_ok', 'test');
    const refunded = await refundOrder(t.deps, paid);
    expect(refunded.status).toBe('refunded');
    expect(t.payments.charges.get(paid.charge_id!)?.refundedCents).toBe(2000);
  });
});
