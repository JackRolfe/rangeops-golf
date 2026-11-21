# 04: Ten standard runs and the accuracy report

Status: resolved
Blocked by: 03

## Parent

`.scratch/lane-limit-sim/spec.md`

## What to build

A scenario generator for 30 m out-and-back runs with two or three pickups (some in neighbouring bays), turns on the spot and arcs, dry or wet grass. Run the ten standard runs (seeds 0-9) and a larger Monte-Carlo set with all four estimators side by side and no lane limit. Report lateral error at 30 m, and how often each estimator believes it's inside the 3 m lane while actually outside (per sample and per run). Save trajectory and error plots as PNG.

## Acceptance criteria

- [x] The ten standard runs are reproducible from their seeds and each reaches about 30 m and returns to the dock.
- [x] A table of lateral error at 30 m (per run, and Monte-Carlo median / 95th percentile) for each estimator.
- [x] A table of believed-inside-while-outside rates for each estimator.
- [x] Plots written under `robot/sim/plots/`.

## Blocked by

- `03-uwb-ekf.md`

## Comments

- "How often fooled" is reported three ways: share of out-of-lane time believed inside, runs fooled by more than 25 cm, and the 95th-percentile depth outside while believed inside. A plain "any sample" count flags every run that grazes the line by a centimetre, so it says little.
- Plots and tables from the full run are committed with ticket 06; this ticket commits the code.
