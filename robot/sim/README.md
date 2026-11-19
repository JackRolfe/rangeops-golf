# Mulligan lane-holding simulation

Can Mulligan hold its 3 m lane out to 30 m? A 2D Monte-Carlo simulation of the skid-steer
robot on grass, its encoders, a BNO085-like gyro and UWB ranging to dock anchors, four
position estimators, and the firmware's lane-limit rule. Results: [RESULTS.md](RESULTS.md).
Spec and tickets: `.scratch/lane-limit-sim/` at the repo root.

```bash
cd robot/sim
uv sync
uv run pytest
uv run python -m mulligan_sim.study          # full study, ~7 min on 10 cores
uv run python -m mulligan_sim.study --quick  # smoke test, ~1 min
```

The study writes `results/summary.md` (tables), `results/*.json` (raw numbers) and `plots/*.png`.

| Module | What it is |
| --- | --- |
| `params.py` | The robot's numbers, mirroring `robot/design/params.mjs`, and the assumptions R0 will replace |
| `world.py` | True motion: skid steer with slip, turn scrub, sideslip and yaw kicks, on dry or wet grass |
| `sensors.py` | Quantised encoders, the BNO085-like gyro, UWB ranging, anchor layouts |
| `estimators.py` | Odometry, odometry + gyro, and the UWB EKF. **Portable**: scalars and fixed-size lists only |
| `lane_limit.py` | The lane-limit rule. **Portable** |
| `driver.py` | The child on the stick, steering on the true pose |
| `scenarios.py` | Runs: the ten standard runs and the Monte-Carlo generator |
| `runner.py` | One run: driver, lane limit, world, sensors, estimators |
| `metrics.py`, `study.py` | What we measure, and the study behind RESULTS.md |

## Porting to the firmware

`estimators.py` and `lane_limit.py` are written to go to C++ line for line: each class is a
struct plus a `step()`; the EKF's matrices are `float[5][5]` with the helpers as plain loops;
no numpy anywhere in them. The firmware runs them at 50 Hz with UWB ranges at 10 Hz.
