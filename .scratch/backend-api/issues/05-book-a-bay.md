# 05. Book a bay with club and lesson add-ons

Status: ready-for-agent
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
