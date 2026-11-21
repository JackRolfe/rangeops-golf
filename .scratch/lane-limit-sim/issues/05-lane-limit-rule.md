# 05: The lane-limit rule

Status: resolved
Blocked by: 01

## Parent

`.scratch/lane-limit-sim/spec.md`

## What to build

The portable lane-limit rule: from the estimated pose, the stick command and a margin, cap the outward component of motion in a slow zone before the stop line (|ŷ| = 1.5 − margin, x̂ = 30 − margin), stop outward motion at the line, and always obey commands that take the robot back inside and turns on the spot. Wire it into the run loop so a run can enforce it from any estimator.

## Acceptance criteria

- [x] Well inside, the command passes unchanged.
- [x] In the slow zone, outward speed is capped and falls toward the line.
- [x] At or past the line, outward motion is zero; inward commands and spins pass.
- [x] In a seeded run with perfect sensors and a driver chasing a ball in the next bay, the true robot stops near the stop line.
- [x] Scalar-only step function.

## Blocked by

- `01-world-encoders-odometry.md`

## Comments

- Slow zone 0.6 m, creep 0.25 m/s at the line (braking from top speed at 2.5 m/s² takes 0.25 m, so the zone has room).
- With perfect sensing the robot still runs about 4 cm past the stop line: braking from creep speed, one tick of latency, and the two sides ramping separately while it turns at the line. The margin has to cover this too.
