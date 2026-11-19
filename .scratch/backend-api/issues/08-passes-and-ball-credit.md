# 08. Passes and ball credit

Status: ready-for-agent
Blocked by: 07
Spec: [../spec.md](../spec.md) (Balls, passes and ball credit)

## What

Pass, pass product and ball credit tables (idea 8). `POST /orders/passes` for monthly passes and ball credit packs. Buckets payable with ball credit. An active pass discounts bay-hours and card-paid buckets. `GET /me/wallet`.

## Acceptance

- [ ] Buying a second pass extends from the first one's end
- [ ] Paying a bucket with too little credit gets 409 and changes nothing
- [ ] Pass discount shows in booking and bucket prices
- [ ] Wallet lists passes, credit per range and unredeemed codes
