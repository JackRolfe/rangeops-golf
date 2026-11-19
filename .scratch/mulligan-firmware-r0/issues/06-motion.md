# 06. Encoders, speed controller and odometry

Status: ready-for-agent
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

- [ ] Tests for both directions of rotation, invalid transitions, controller saturation and windup, odometry on a straight run and a square, tilt at 0°, 35° and upside down.
