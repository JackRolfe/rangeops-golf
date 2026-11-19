# 06: Margin study, plots and RESULTS.md

Status: ready-for-agent
Blocked by: 04, 05

## Parent

`.scratch/lane-limit-sim/spec.md`

## What to build

With the lane limit enforced from each estimator and a driver who chases balls into neighbouring bays, sweep the margin and find, for each estimator, the smallest margin that keeps the true robot centre inside |y| ≤ 1.5 m in at least 95% of runs (19 in 20). Write `robot/sim/RESULTS.md` with the assumptions, the ten-run and Monte-Carlo tables, the margin results and plots, and a recommendation for R2: estimator, margin, and one or two anchors.

## Acceptance criteria

- [ ] A margin-versus-inside-rate plot per estimator.
- [ ] Required margin per estimator, or "not achievable" with the reason.
- [ ] `RESULTS.md` written with every assumption marked as cited or assumed.
- [ ] A single command regenerates the results and plots.

## Blocked by

- `04-ten-runs-accuracy.md`
- `05-lane-limit-rule.md`
