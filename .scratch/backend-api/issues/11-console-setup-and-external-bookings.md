# 11. Console set-up, day views and external bookings

Status: resolved
Blocked by: 06, 07
Spec: [../spec.md](../spec.md) (Console set-up and views)

## What

Staff endpoints: `PATCH /ranges/{rangeId}`, `PUT .../hours`, `PUT .../peak-windows`, `POST .../bays`, `PATCH /bays/{bayId}`, `POST /bays/{bayId}/check-in-code`, `GET .../bookings?date=`, `GET .../orders?date=`, and `POST .../external-bookings` (a booking from another source; no payment; a robot add-on still becomes a hire key). This is the "Booking and payment" boundary in Built to swap.

## Acceptance

- [ ] Changing prices changes availability prices
- [ ] External booking with a robot returns a hire link and blocks the slot
- [ ] Day views use the range's local date
- [ ] Every console endpoint refuses non-staff with 403

## Comments

Done. Also added `GET /ranges/{rangeId}/bays` (staff), which is where the console reads check-in codes and the URL to print as a QR code. External bookings record an order with provider `external` at the range's prices, so takings stay comparable, but charge nothing. `externalRef` is unique per range, so re-sending the same booking from another system gets 409 instead of a double booking. Day views use the range's local date; `/bookings` lists bookings starting that day, `/orders` orders made that day.
