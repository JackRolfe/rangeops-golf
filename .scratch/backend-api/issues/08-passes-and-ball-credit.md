# 08. Passes and ball credit

Status: resolved
Blocked by: 07
Spec: [../spec.md](../spec.md) (Balls, passes and ball credit)

## What

Pass, pass product and ball credit tables (idea 8). `POST /orders/passes` for monthly passes and ball credit packs. Buckets payable with ball credit. An active pass discounts bay-hours and card-paid buckets. `GET /me/wallet`.

## Acceptance

- [ ] Buying a second pass extends from the first one's end
- [ ] Paying a bucket with too little credit gets 409 and changes nothing
- [ ] Pass discount shows in booking and bucket prices
- [ ] Wallet lists passes, credit per range and unredeemed codes

## Comments

Done. Decisions: a monthly pass gives a percent off bay-hours (not add-ons) and card-paid buckets, valid at the hour being played for bookings and at purchase for buckets. Ball credit is counted in balls (a 150-ball bucket costs 150 credit), kept as a ledger per account per range, and spent inside one transaction so it cannot go negative. Credit-paid buckets are zero-total orders with provider `ball_credit`. Range detail now lists `passProducts`.
