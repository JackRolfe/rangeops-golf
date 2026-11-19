# 07: RTK GNSS receiver model

Status: ready-for-agent
Blocked by: 06

## Parent

`.scratch/lane-limit-sim/spec.md` (addendum: RTK GNSS)

## What to build

A ZED-F9P-like RTK receiver on the robot: position in the lane frame at 5 Hz with a solution flag (none, float, fixed). No solution under the bay roof; float for a few seconds after rolling out, then fixed; random float episodes along the lane, more often near the roof edge; rare wrong fixes; a per-run error in the surveyed lane frame. Cite the research note's figures; mark the rest assumed.

## Acceptance criteria

- [ ] Fixed error matches the configured cm-level sigma; float error is tens of cm.
- [ ] No solution under the roof; the first fix after leaving it arrives within the configured time.
- [ ] Float episodes and wrong fixes occur at the configured rates.
- [ ] Seeded and reproducible; a "perfect" spec reports truth.

## Blocked by

- `06-margin-study-results.md`
