# 08: Gyro + RTK GNSS estimator

Status: resolved
Blocked by: 07

## Parent

`.scratch/lane-limit-sim/spec.md` (addendum: RTK GNSS)

## What to build

Generalise the EKF so it can correct with either UWB ranges or GNSS positions, keeping the portable scalar style. Add `rtk`: encoders and gyro predict, RTK fixed positions correct with cm-level noise, float positions with a weak update or none, behind a gate. Register it in the run loop.

## Acceptance criteria

- [x] With a perfect receiver the estimator tracks truth to about a centimetre once outside the roof.
- [x] A wrong fix far from the estimate is gated out; a run of good fixes is accepted.
- [x] Through a fix gap it dead-reckons on gyro and encoders.
- [x] UWB estimator results unchanged by the refactor (same seeds, same numbers).

## Blocked by

- `07-rtk-gnss-sensor.md`
