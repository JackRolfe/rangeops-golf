# 03: UWB ranging and the EKF with one or two dock anchors

Status: ready-for-agent
Blocked by: 02

## Parent

`.scratch/lane-limit-sim/spec.md`

## What to build

Add UWB ranging to one or two anchors at the dock (10 Hz, white plus correlated noise of about ±10 cm, positive multipath outliers, dropouts). Add an EKF on (x, y, heading, gyro bias, odometry scale) predicting from encoder distance and gyro rate and correcting with each range behind an innovation gate. Small fixed-size matrix helpers written as plain loops so the filter ports to C++.

## Acceptance criteria

- [ ] Range noise and outlier rate match the configuration over many samples.
- [ ] With perfect sensors the EKF tracks truth.
- [ ] A gross outlier is rejected by the gate.
- [ ] With a gyro bias present and two anchors, the EKF's bias estimate moves toward the true bias.
- [ ] EKF step functions use only scalars, `math` and fixed-size lists.

## Blocked by

- `02-gyro-odometry-gyro.md`
