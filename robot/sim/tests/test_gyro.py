import math
import random
import statistics

import pytest

from mulligan_sim import params as P
from mulligan_sim.estimators import OdometryGyro, SensorFrame
from mulligan_sim.runner import simulate
from mulligan_sim.scenarios import out_and_back
from mulligan_sim.sensors import DEG, PERFECT_GYRO, Encoders, Gyro, GyroSpec
from mulligan_sim.world import DRY, IDEAL, WET, World


def test_perfect_gyro_reports_true_rate():
    w = World(DRY, random.Random(0))
    g = Gyro(PERFECT_GYRO, random.Random(1))
    for _ in range(200):
        w.step(0.7, 0.9, P.DT_S)
        assert g.read(w, P.DT_S) == w.omega


def test_stationary_drift_matches_configured_bias():
    """At rest, a minute of integration drifts by the residual bias: 0.5 deg/min, 1 sd."""
    spec = GyroSpec(scale_sd=0.0)
    drifts = []
    for seed in range(300):
        w = World(IDEAL, random.Random(seed))
        g = Gyro(spec, random.Random(10_000 + seed))
        heading = 0.0
        for _ in range(int(60 / P.DT_S)):
            heading += g.read(w, P.DT_S) * P.DT_S
        drifts.append(heading / DEG)
    sd = statistics.pstdev(drifts)
    assert 0.42 < sd < 0.62  # 0.5 deg/min plus a little noise and bias walk
    assert abs(statistics.fmean(drifts)) < 0.1


def test_odometry_gyro_tracks_truth_with_perfect_sensors():
    w = World(IDEAL, random.Random(3))
    enc, g, est = Encoders(), Gyro(PERFECT_GYRO, random.Random(4)), OdometryGyro()
    for v, om, secs in [(0.8, 0.0, 5), (0.5, 0.6, 4), (0.0, -1.2, 2), (1.0, 0.0, 5)]:
        for _ in range(int(secs / P.DT_S)):
            w.step(v, om, P.DT_S)
            dl, dr = enc.read(w)
            est.step(SensorFrame(P.DT_S, dl, dr, gyro_z=g.read(w, P.DT_S)))
    assert est.x == pytest.approx(w.x, abs=0.01)
    assert est.y == pytest.approx(w.y, abs=0.01)
    assert est.theta == pytest.approx(w.theta, abs=1e-6)


def test_gyro_beats_odometry_on_lateral_error_at_30_m():
    odo, gyro = [], []
    for seed in range(10):
        r = simulate(out_and_back(seed=seed, ground=WET if seed % 2 else DRY), ["odometry", "odo_gyro"])
        odo.append(abs(r.lateral_error_at_far("odometry")))
        gyro.append(abs(r.lateral_error_at_far("odo_gyro")))
    assert statistics.median(gyro) < statistics.median(odo) / 3
