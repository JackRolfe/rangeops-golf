# 04. Payments interface, fake provider and orders

Status: resolved
Blocked by: 01
Spec: [../spec.md](../spec.md) (Payments)

## What

`PaymentProvider` interface and the fake provider (`pm_fake_ok` succeeds, `pm_fake_declined` declines, `FAKE_PAYMENTS=decline` declines everything; no network). Order and order line tables, and one service function that creates an order, charges it and marks it paid or failed, and one that refunds it.

## Acceptance

- [ ] Fake provider unit tests: success, decline, global decline, refund
- [ ] Zero totals skip the charge
- [ ] No Stripe keys or network calls anywhere

## Comments

Done. `src/payments/provider.ts` is the seam for Stripe. Charges run outside database transactions (a real provider is a network call) and use the order id as the idempotency key. Unknown payment methods decline.
