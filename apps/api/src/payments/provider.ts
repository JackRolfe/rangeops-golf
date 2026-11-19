export interface ChargeRequest {
  amountCents: number;
  currency: string;
  description: string;
  /** A payment method the app got from the provider's own card form, e.g. a Stripe PaymentMethod id. */
  paymentMethod: string;
  /** Repeating a charge with the same key must not charge twice. The order id. */
  idempotencyKey: string;
}

export type ChargeResult = { ok: true; chargeId: string } | { ok: false; reason: string };
export type RefundResult = { ok: true } | { ok: false; reason: string };

/**
 * Whatever takes the money. Only the fake exists today; Stripe, or a range's own
 * processor, slots in behind this without the routes changing.
 */
export interface PaymentProvider {
  readonly name: string;
  charge(req: ChargeRequest): Promise<ChargeResult>;
  refund(req: { chargeId: string; amountCents: number }): Promise<RefundResult>;
}
