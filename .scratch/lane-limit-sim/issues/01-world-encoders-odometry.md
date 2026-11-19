# 01: Skid-steer world, encoders and odometry-only estimator, end to end

Status: resolved
Blocked by: none

## Parent

`.scratch/lane-limit-sim/spec.md`

## What to build

The tracer bullet. Set up `robot/sim/` as a `uv` project (Python 3.13, numpy, matplotlib, pytest). Model the true motion of the four-wheel skid-steer robot on dry and wet grass (effective-track factor, per-side slip rising in turns and on wet grass, sideslip, unmeasured yaw disturbance, acceleration and braking limits), quantised rear-wheel encoders, and the odometry-only estimator. Add a driver that follows waypoints on the true pose and a single 30 m out-and-back run that reports the odometry estimate's lateral error at 30 m.

## Acceptance criteria

- [x] `uv run pytest` passes in `robot/sim`.
- [x] With slip switched off, straight driving goes straight, a spin turns by the commanded angle, and odometry matches truth to within quantisation.
- [x] With slip on, the robot travels less than its wheels say, more so on wet grass.
- [x] Encoder counts are integers at 753.2 counts per wheel turn.
- [x] A seeded out-and-back run is reproducible and reports a lateral error at 30 m.
- [x] The odometry step function uses only scalars and `math`.

## Blocked by

None - can start immediately
