# 11. Console set-up, day views and external bookings

Status: ready-for-agent
Blocked by: 06, 07
Spec: [../spec.md](../spec.md) (Console set-up and views)

## What

Staff endpoints: `PATCH /ranges/{rangeId}`, `PUT .../hours`, `PUT .../peak-windows`, `POST .../bays`, `PATCH /bays/{bayId}`, `POST /bays/{bayId}/check-in-code`, `GET .../bookings?date=`, `GET .../orders?date=`, and `POST .../external-bookings` (a booking from another source; no payment; a robot add-on still becomes a hire key). This is the "Booking and payment" boundary in Built to swap.

## Acceptance

- [ ] Changing prices changes availability prices
- [ ] External booking with a robot returns a hire link and blocks the slot
- [ ] Day views use the range's local date
- [ ] Every console endpoint refuses non-staff with 403
