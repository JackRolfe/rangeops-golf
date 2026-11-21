# 07. Buy a bucket, get a code, staff redeem it

Status: resolved
Blocked by: 02, 03, 04
Spec: [../spec.md](../spec.md) (Balls, passes and ball credit)

## What

Bucket code table. `POST /orders/buckets` paying by card, returning a `XXXX-XXXX` code. `GET /me/orders`. Staff `POST /ranges/{rangeId}/bucket-codes/{code}/redeem`.

## Acceptance

- [ ] Codes use an unambiguous alphabet and are unique per range
- [ ] Redeeming twice gets 409; unknown code 404; non-staff 403
- [ ] Redemption accepts codes with or without the dash, any case

## Comments

Done. Codes are 8 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no I, L, O, 0, 1), stored without the dash and shown as `XXXX-XXXX`. Redemption is one conditional update, so two staff scanning at once cannot both hand over. Also added `GET /ranges/{rangeId}/bucket-codes/{code}` so the console can show a code before handing over. `/me/orders` leaves out orders still pending.
