# 03: UWB ranging and the EKF with one or two dock anchors

Status: resolved
Blocked by: 02

## Parent

`.scratch/lane-limit-sim/spec.md`

## What to build

Add UWB ranging to one or two anchors at the dock (10 Hz, white plus correlated noise of about ±10 cm, positive multipath outliers, dropouts). Add an EKF on (x, y, heading, gyro bias, odometry scale) predicting from encoder distance and gyro rate and correcting with each range behind an innovation gate. Small fixed-size matrix helpers written as plain loops so the filter ports to C++.

## Acceptance criteria

- [x] Range noise and outlier rate match the configuration over many samples.
- [x] With perfect sensors the EKF tracks truth.
- [x] A gross outlier is rejected by the gate.
- [x] With a gyro bias present and two anchors, the EKF's bias estimate moves toward the true bias (and, more usefully, heading error stays well below the gyro's).
- [x] EKF step functions use only scalars, `math` and fixed-size lists.

## Blocked by

- `02-gyro-odometry-gyro.md`

## Comments

- Bias is only weakly observable in a minute or two of driving with the tight dock prior: the estimate moves the right way but only a few per cent. The test checks heading hold instead, which is what the lane needs.
- A tuning sweep (R 0.15-0.3 m, side noise, turn noise) moved the two-anchor 95th-percentile lateral error at 30 m only between 0.37 and 0.40 m. The limit is the anchors' 2.8 m baseline seen from 30 m, not the filter. Added a 6 m-baseline layout (`uwb2_wide`) as a sensitivity case.
