# 02: BNO085-like gyro and odometry + gyro estimator

Status: ready-for-agent
Blocked by: 01

## Parent

`.scratch/lane-limit-sim/spec.md`

## What to build

Add the gyro model (scale error, residual bias after dock calibration, bias random walk, white noise), with the BNO08X datasheet figure (0.5°/min game-rotation-vector heading drift) cited and the rest marked as assumed. Add the dock's residual pose error. Add the odometry + gyro estimator (encoder distance, gyro heading) and run it alongside odometry in the end-to-end run.

## Acceptance criteria

- [ ] With noise, bias and scale error zeroed, the gyro reports the true yaw rate.
- [ ] Over many seeds, stationary heading drift matches the configured bias.
- [ ] The odometry + gyro estimator tracks truth with perfect sensors and beats odometry on lateral error in a seeded run.
- [ ] Step function is scalar-only.

## Blocked by

- `01-world-encoders-odometry.md`
