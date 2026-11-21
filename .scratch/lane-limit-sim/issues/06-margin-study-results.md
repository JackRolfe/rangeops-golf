# 06: Margin study, plots and RESULTS.md

Status: resolved
Blocked by: 04, 05

## Parent

`.scratch/lane-limit-sim/spec.md`

## What to build

With the lane limit enforced from each estimator and a driver who chases balls into neighbouring bays, sweep the margin and find, for each estimator, the smallest margin that keeps the true robot centre inside |y| ≤ 1.5 m in at least 95% of runs (19 in 20). Write `robot/sim/RESULTS.md` with the assumptions, the ten-run and Monte-Carlo tables, the margin results and plots, and a recommendation for R2: estimator, margin, and one or two anchors.

## Acceptance criteria

- [x] A margin-versus-inside-rate plot per estimator.
- [x] Required margin per estimator, or "not achievable" with the reason.
- [x] `RESULTS.md` written with every assumption marked as cited or assumed.
- [x] A single command regenerates the results and plots.

## Blocked by

- `04-ten-runs-accuracy.md`
- `05-lane-limit-rule.md`

## Comments

- The chasing child also goes after one ball on the way home, after the turn; without it the margin study never tested the return leg, where the gyro estimators are worst.
- Added "in-lane balls reached", so an estimator can't look safe just by freezing the robot. Odometry alone reaches 19 in 20 inside only at a 1.4 m margin, with 5% of in-lane balls reachable.
- Result: two UWB anchors, margin 0.5 m, anchors as wide apart as possible. See `robot/sim/RESULTS.md`.
