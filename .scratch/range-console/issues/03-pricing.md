# 03 Pricing by bay-hour, peak and off-peak, floor

Status: resolved
Type: task
Blocked by: 01

Pure functions in `src/domain/pricing.ts`: whether an hour is peak, the price of one bay-hour for a band, a quote for a booking (per-hour lines and total, plus robot hire), validation of a price list against floors and opening hours, and `clampToFloor` for later demand pricing.

## Acceptance

- Vitest covers: off-peak vs peak hours, a booking straddling a peak boundary, weekends, premium band, robot hire, prices below the floor rejected, windows outside opening hours rejected, booking outside opening hours rejected.
