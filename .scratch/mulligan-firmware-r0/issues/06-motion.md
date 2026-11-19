# 06. Encoders, speed controller and odometry

Status: resolved
Type: task
Blocked by: 01
Spec: [spec.md](../spec.md#hardware-layer)

## What

Plain C++ in `lib/mulligan_core/`:

- Quadrature decoder: a state table that turns A/B edges into ±1 counts, ignoring invalid transitions.
- Counts to metres and metres per second (751.8 counts a wheel turn, 144 mm wheel).
- Per-side speed controller: feed-forward from the motor's free speed (6.1 km/h at full duty) plus PI on the encoder speed, output clamped to −1…1, integrator clamped and reset at zero target.
- Odometry: x, y from side distances and the IMU's heading; distance from zero in decimetres for telemetry.
- Tilt angle from the gravity vector.

## Acceptance

- [x] Tests for both directions of rotation, invalid transitions, controller saturation and windup, odometry on a straight run and a square, tilt at 0°, 35° and upside down.

## Comments

Done in lib/mulligan_core/src/motion.{h,cpp}. The speed controller never gives more than 0.8 duty (about 1.36 m/s unloaded), so a dead encoder cannot run the wheels flat out; the stall rule in the safety core then stops it. Gains are first guesses for the bench. Odometry takes heading from the motion sensor when valid and from the wheels otherwise.
