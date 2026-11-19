# Spec: can Mulligan hold its lane? (simulation)

Status: ready-for-agent

## Problem statement

Mulligan promises to stay in front of its own bay: about 3 m wide, out to 30 m. The firmware
enforces this with a **lane limit** that works from the robot's own estimate of where it is.
A three-degree heading error is already a metre and a half sideways at 30 m, so the estimate,
not the motors, decides whether the promise holds. The plan (`robot/README.md`, "Knowing where
it is", and `docs/PLAN.md` open question 3) guesses that wheel odometry and a gyro won't be
enough and that ultra-wideband (UWB) ranging to the dock will be needed for R2. Nothing is
built yet, so we want an answer, with numbers, before any hardware is bought.

## Solution

A small 2D Monte-Carlo simulation in `robot/sim/` (Python 3.13, numpy, matplotlib for plots,
pytest, managed with `uv`). It simulates the true motion of a four-wheel skid-steer robot on
grass, the sensors it will carry, several position estimators, and the lane-limit rule, then
answers:

1. How far off sideways is each estimator when the robot is 30 m out?
2. How often does the robot believe it's inside its 3 m lane while it's actually outside?
3. With the lane-limit rule enforced from each estimator, how big must the margin be to keep
   the robot inside its lane in nineteen runs out of twenty?
4. Which estimator should R2 use, with what margin, and are one or two dock anchors needed?

Results go in `robot/sim/RESULTS.md` with PNG plots.

## User stories

1. As the robot designer, I want the lateral error at 30 m for each estimator, so that I know whether odometry and a gyro can hold a single bay.
2. As the robot designer, I want the rate at which the robot wrongly believes it's inside its lane, so that I know how often the lane limit would fail silently.
3. As the robot designer, I want the lane-limit margin each estimator needs for 19 runs in 20, so that I can choose an estimator by how much lane it leaves the child.
4. As the robot designer, I want a recommendation on one versus two UWB anchors, so that I can design the dock.
5. As the firmware author, I want the estimator and lane-limit step functions written in plain scalar code, so that I can port them to the ESP32's C++ line for line.
6. As the firmware author, I want the lane-limit rule to slow, then stop, and always let the child drive back inside, so that a stopped robot can always come home.
7. As anyone reading the results, I want every modelling assumption stated with its source or marked as assumed, so that R0's measurements can replace them.

## Implementation decisions

### Frame and geometry
- Dock frame: origin at the robot's centre when docked, x forward out along the range, y to the left. The lane is |y| ≤ 1.5 m, 0 ≤ x ≤ 30 m.
- Robot numbers mirror `robot/design/params.mjs`: wheel diameter 144 mm, track 370 mm, wheelbase 240 mm, 28 encoder counts per motor turn through 26.9:1 (753.2 counts per wheel turn), top speed 4 km/h, acceleration 1.0 m/s², braking 2.5 m/s².
- "Inside the lane" is judged on the robot's centre. The body reaches 0.21 m further (track plus half a wheel); RESULTS states this.

### True motion (the "world")
- Skid-steer kinematics with an instantaneous-centre-of-rotation model: the effective track is χ·B with χ > 1 because the wheels scrub sideways in a turn. χ, per-side longitudinal slip and a sideslip term vary per run and slowly along the run, and all are worse on wet grass and in tighter turns.
- A small unmeasured yaw disturbance (tussocks, divots) that the gyro sees and the encoders don't.
- Motor-side acceleration and braking limits from the design parameters.

### Sensors
- Encoders: one per side on the rear wheel, integer counts (quantised), at 50 Hz.
- Gyro: BNO085-like yaw rate = (1 + scale error)·true rate + bias + white noise, bias wandering as a random walk. Figures from the CEVA BNO08X datasheet (1000-3927 v1.17, §6.7, Figure 6-14) where published; the rest assumed and marked.
- UWB: range to one or two anchors at the dock at 10 Hz, about ±10 cm of noise (white plus a slowly varying correlated part), occasional positive outliers (multipath) and dropouts.
- The dock zeroes the pose with a small residual error (heading included) and calibrates the gyro bias while stationary, leaving a residual.

### Estimators (portable core)
- **Odometry**: distance and heading from the encoders, with a nominal effective-track factor calibrated on dry grass.
- **Odometry + gyro**: distance from the encoders, heading from the bias-corrected gyro.
- **UWB EKF (1 anchor)** and **UWB EKF (2 anchors)**: an extended Kalman filter on state (x, y, heading, gyro bias, odometry scale), predicting with encoder distance and gyro rate, correcting with each range, with an innovation gate to reject outliers.
- Core step functions use only scalar floats, `math`, and fixed-size lists (small hand-written matrix helpers). No numpy in the step functions, no allocation-heavy tricks: each step maps to a C++ function on fixed arrays.

### Lane-limit rule (portable core)
- Input: estimated pose, the driver's stick command (forward speed, turn rate), the margin.
- Stop line at |ŷ| = 1.5 − margin (and x̂ = 30 − margin for reach). Inside a slow zone before the stop line, the outward component of velocity is capped, falling linearly to a creep speed at the line; at or past the line the outward component is zero. Any part of the command that takes the robot back inside, and turning on the spot, is always obeyed.

### Driver and scenarios
- The driver is a person watching the robot, so they steer on the **true** pose: a pursuit controller with wobble that drives out to two or three balls, picks each up (drive over, pause, small turns), goes out to about 30 m, turns round (sometimes on the spot) and comes back to the dock.
- **Ten standard runs**: seeds 0–9, half on dry and half on wet grass, some balls placed in the next bay so that the robot really does leave its lane (needed to measure question 2). No lane limit enforced.
- **Monte Carlo**: the same generator over many seeds for distributions.
- **Margin study**: lane limit enforced from each estimator, with a driver who chases balls into neighbouring bays; for each margin on a grid, the fraction of runs in which the true centre never leaves |y| ≤ 1.5 m. The required margin is the smallest with ≥ 95%.

### Deliverables
- `robot/sim/` package, tests, a `study` entry point that writes `RESULTS.md` data and PNG plots under `robot/sim/plots/`.
- `robot/sim/RESULTS.md`: assumptions, results tables, plots, recommendation.

## Testing decisions

- Test external behaviour of each module, not internals:
  - World: straight drive with no slip goes straight; a no-slip spin turns by the commanded angle; slip makes the robot travel less than the wheels say.
  - Sensors: encoder counts are integers matching distance / (0.6006 mm); gyro with zero noise and bias reports the true rate; UWB range statistics match the configured σ and outlier rate.
  - Estimators: with perfect sensors each one tracks truth; the EKF rejects a gross outlier; with bias present the EKF estimates it.
  - Lane limit: unchanged command well inside; outward speed capped in the slow zone; zero outward motion at the line; inward command and spin always obeyed.
  - End to end: a short seeded run is reproducible, and the EKF beats odometry on lateral error at 30 m.
- pytest, run from `robot/sim` with `uv run pytest`.

## Out of scope

- Hardware, firmware C++ (porting comes later in `robot/firmware`), BLE link, the app.
- 3D terrain, slopes beyond folding tilt into gyro scale error, ball physics, collisions.
- RSSI ranging, satellite positioning.
- Charging, docking manoeuvres.

## Further notes

- The `/to-spec`, `/to-tickets` and `/implement` skills were not installed in this session; this spec and the tickets follow `docs/agents/issue-tracker.md` by hand.
- Every number that R0 will measure is marked "assumed" in `RESULTS.md` so it can be replaced.
