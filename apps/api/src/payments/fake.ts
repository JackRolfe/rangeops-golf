import { randomUUID } from 'node:crypto';
import type { ChargeRequest, ChargeResult, PaymentProvider, RefundResult } from './provider.js';

/** Succeeds, like a processor's test card. */
export const FAKE_OK = 'pm_fake_ok';
/** Declines, like a processor's declined test card. */
export const FAKE_DECLINED = 'pm_fake_declined';

/**
 * A payment provider that never leaves the process. `pm_fake_ok` succeeds,
 * `pm_fake_declined` (or anything else unknown) declines, and `declineAll`
 * (`FAKE_PAYMENTS=decline`) declines everything.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';
  readonly charges = new Map<string, { amountCents: number; currency: string; description: string; refundedCents: number }>();
  private byIdempotencyKey = new Map<string, string>();

  constructor(public declineAll = false) {}

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    const seen = this.byIdempotencyKey.get(req.idempotencyKey);
    if (seen) return { ok: true, chargeId: seen };
    if (this.declineAll) return { ok: false, reason: 'Declined: the fake provider is set to decline everything.' };
    if (req.paymentMethod !== FAKE_OK) {
      return { ok: false, reason: req.paymentMethod === FAKE_DECLINED ? 'Your card was declined.' : 'Unknown payment method.' };
    }
    if (!Number.isInteger(req.amountCents) || req.amountCents <= 0) return { ok: false, reason: 'Amount must be positive.' };
    const chargeId = `ch_fake_${randomUUID()}`;
    this.charges.set(chargeId, { amountCents: req.amountCents, currency: req.currency, description: req.description, refundedCents: 0 });
    this.byIdempotencyKey.set(req.idempotencyKey, chargeId);
    return { ok: true, chargeId };
  }

  async refund(req: { chargeId: string; amountCents: number }): Promise<RefundResult> {
    const charge = this.charges.get(req.chargeId);
    if (!charge) return { ok: false, reason: 'No such charge.' };
    if (charge.refundedCents + req.amountCents > charge.amountCents) return { ok: false, reason: 'Refund is more than the charge.' };
    charge.refundedCents += req.amountCents;
    return { ok: true };
  }
}
