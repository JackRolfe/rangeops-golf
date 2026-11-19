# 02. Ranges, bays, hours, prices and availability

Status: ready-for-agent
Blocked by: 01
Spec: [../spec.md](../spec.md) (Ranges, prices and availability; Demo data)

## What

Schema for range, bay, opening hours, peak windows, add-on prices, bucket and pass products. Demo seed. Public `GET /ranges`, `GET /ranges/{rangeId}` and `GET /ranges/{rangeId}/availability?date=`. Time-zone helpers (local date and hour to instant, instant to local weekday and time). Bay-hour pricing: bay override beats range, peak if the hour starts in a peak window (idea 7).

## Acceptance

- [ ] Demo range seeded on first dev start, exactly as the spec's Demo data
- [ ] Availability lists each open hour per active bay with price, peak flag and free flag, in the range's time zone, across a DST change
- [ ] Unit tests for pricing and time-zone maths
