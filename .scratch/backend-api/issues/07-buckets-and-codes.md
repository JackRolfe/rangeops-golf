# 07. Buy a bucket, get a code, staff redeem it

Status: ready-for-agent
Blocked by: 02, 03, 04
Spec: [../spec.md](../spec.md) (Balls, passes and ball credit)

## What

Bucket code table. `POST /orders/buckets` paying by card, returning a `XXXX-XXXX` code. `GET /me/orders`. Staff `POST /ranges/{rangeId}/bucket-codes/{code}/redeem`.

## Acceptance

- [ ] Codes use an unambiguous alphabet and are unique per range
- [ ] Redeeming twice gets 409; unknown code 404; non-staff 403
- [ ] Redemption accepts codes with or without the dash, any case
