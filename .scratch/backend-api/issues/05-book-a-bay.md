# 05. Book a bay with club and lesson add-ons

Status: resolved
Blocked by: 02, 03, 04
Spec: [../spec.md](../spec.md) (Booking a bay)

## What

Booking and booking add-on tables. `POST /bookings` with validation (on the hour, not past, inside opening hours, bay active, 1–4 hours), overlap check, pricing with add-ons (idea 2), charge, confirm. `GET /me/bookings`, `GET /bookings/{bookingId}`, `POST /bookings/{bookingId}/cancel` with refund.

## Acceptance

- [ ] Double-booking a bay gets 409
- [ ] A declined card gets 402 and leaves the slot free
- [ ] Price = bay-hours (peak/off-peak) + club hire + lesson, checked in tests
- [ ] Owners see their bookings across ranges; other accounts get 404/403
- [ ] Cancel refunds and frees the slot

## Comments

Done. Double booking is refused by a Postgres exclusion constraint (`bookings_no_overlap`), not only a check in code. A booking is inserted as `pending_payment` (holding the slot), charged outside the transaction, then confirmed or cancelled. Order lines name each bay-hour with its local time and band. Other accounts get 404 for a booking they cannot see, so ids do not leak.
