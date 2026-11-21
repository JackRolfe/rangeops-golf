# 07 Passes and ball credits

Status: resolved
Type: task
Blocked by: 02

`src/domain/passes.ts`: remaining buckets and bay-hours on a pass for a date (monthly allowance resets on the 1st), whether a credit can be redeemed, redeeming. The fake supports listing, selling (records a payment) and redeeming. The Passes screen does all three.

## Acceptance

- Vitest: monthly reset, expired pass refused, credit pack never expires, no credits left refused.
- Screen: sell a credit pack, redeem a credit, counts update.

- 2026-11-19: superseded by ADR 0021. Passes are now percent-off discounts and ball credit is counted in balls, the same as the API. The fake, the screen and the tests follow it.
