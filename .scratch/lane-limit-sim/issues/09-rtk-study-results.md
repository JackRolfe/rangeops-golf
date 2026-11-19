# 09: Re-run the comparison with RTK and update RESULTS.md

Status: resolved
Blocked by: 08

## Parent

`.scratch/lane-limit-sim/spec.md` (addendum: RTK GNSS)

## What to build

Add RTK to the ten standard runs, the Monte Carlo, the sensitivity cases (plus RTK-specific ones: poor sky near nets and poles, no corrections, slow first fix) and the margin study. Update plots and `robot/sim/RESULTS.md` with a recommendation between odometry + gyro alone, RTK and UWB, noting UWB's licensing problem in Australia.

## Acceptance criteria

- [x] RTK rows in every table and a series in every plot.
- [x] RTK-specific sensitivity cases reported.
- [x] RESULTS.md recommends between odometry + gyro, RTK and UWB, with the licensing note.

## Blocked by

- `08-rtk-ekf.md`

## Comments

- RTK: 0.08 m at 30 m (95th pct), 0.15 m worst in run; margin 0.1 m centre / 0.4 m whole robot for 19 in 20 (0.2 / 0.4 m in a poor sky).
- Its margin is spent on the dead-reckoned stretch before the first fix outside the roof, and on wrong fixes accepted right after a float spell (standard run 2). Both are firmware follow-ups: a two-level margin (0.4 m with a recent fix, 0.6 m without) and a fix cross-check. Neither is simulated yet.
- Recommendation in RESULTS.md: RTK for R2, odometry + gyro as the fallback, UWB dropped (LIPD 2025 cl. 67(3)).
