# 05: The lane-limit rule

Status: ready-for-agent
Blocked by: 01

## Parent

`.scratch/lane-limit-sim/spec.md`

## What to build

The portable lane-limit rule: from the estimated pose, the stick command and a margin, cap the outward component of motion in a slow zone before the stop line (|ŷ| = 1.5 − margin, x̂ = 30 − margin), stop outward motion at the line, and always obey commands that take the robot back inside and turns on the spot. Wire it into the run loop so a run can enforce it from any estimator.

## Acceptance criteria

- [ ] Well inside, the command passes unchanged.
- [ ] In the slow zone, outward speed is capped and falls toward the line.
- [ ] At or past the line, outward motion is zero; inward commands and spins pass.
- [ ] In a seeded run with perfect sensors and a driver chasing a ball in the next bay, the true robot stops near the stop line.
- [ ] Scalar-only step function.

## Blocked by

- `01-world-encoders-odometry.md`
