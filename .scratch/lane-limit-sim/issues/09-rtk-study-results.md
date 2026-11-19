# 09: Re-run the comparison with RTK and update RESULTS.md

Status: ready-for-agent
Blocked by: 08

## Parent

`.scratch/lane-limit-sim/spec.md` (addendum: RTK GNSS)

## What to build

Add RTK to the ten standard runs, the Monte Carlo, the sensitivity cases (plus RTK-specific ones: poor sky near nets and poles, no corrections, slow first fix) and the margin study. Update plots and `robot/sim/RESULTS.md` with a recommendation between odometry + gyro alone, RTK and UWB, noting UWB's licensing problem in Australia.

## Acceptance criteria

- [ ] RTK rows in every table and a series in every plot.
- [ ] RTK-specific sensitivity cases reported.
- [ ] RESULTS.md recommends between odometry + gyro, RTK and UWB, with the licensing note.

## Blocked by

- `08-rtk-ekf.md`
