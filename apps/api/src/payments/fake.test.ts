import { describe, expect, it } from 'vitest';
import { FAKE_DECLINED, FAKE_OK, FakePaymentProvider } from './fake.js';

const req = (paymentMethod: string, idempotencyKey = 'o1') => ({
  amountCents: 1800, currency: 'AUD', description: 'Bay 1', paymentMethod, idempotencyKey,
});

describe('fake payment provider', () => {
  it('succeeds for the ok test method and declines the declined one', async () => {
    const p = new FakePaymentProvider();
    const ok = await p.charge(req(FAKE_OK));
    expect(ok.ok).toBe(true);
    expect(await p.charge(req(FAKE_DECLINED, 'o2'))).toEqual({ ok: false, reason: 'Your card was declined.' });
    expect((await p.charge(req('pm_card_visa', 'o3'))).ok).toBe(false);
  });

  it('charges once per idempotency key', async () => {
    const p = new FakePaymentProvider();
    const a = await p.charge(req(FAKE_OK));
    const b = await p.charge(req(FAKE_OK));
    expect(a).toEqual(b);
    expect(p.charges.size).toBe(1);
  });

  it('declines everything when told to', async () => {
    const p = new FakePaymentProvider(true);
    expect((await p.charge(req(FAKE_OK))).ok).toBe(false);
  });

  it('refunds up to the charge', async () => {
    const p = new FakePaymentProvider();
    const c = await p.charge(req(FAKE_OK));
    if (!c.ok) throw new Error();
    expect(await p.refund({ chargeId: c.chargeId, amountCents: 1800 })).toEqual({ ok: true });
    expect((await p.refund({ chargeId: c.chargeId, amountCents: 1 })).ok).toBe(false);
    expect((await p.refund({ chargeId: 'nope', amountCents: 1 })).ok).toBe(false);
  });
});
