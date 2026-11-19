import math
import random
import statistics

import pytest

from mulligan_sim import params as P
from mulligan_sim.estimators import SensorFrame, UwbEkf
from mulligan_sim.runner import simulate
from mulligan_sim.scenarios import out_and_back
from mulligan_sim.sensors import (
    DEG, PERFECT_GYRO, PERFECT_UWB, TWO_ANCHORS, Encoders, Gyro, GyroSpec, Uwb, UwbSpec,
)
from mulligan_sim.world import DRY, IDEAL, WET, World


def test_range_noise_and_outlier_rate_match_spec():
    spec = UwbSpec()
    w = World(IDEAL, random.Random(0), x=20.0, y=0.5)
    u = Uwb(spec, TWO_ANCHORS, random.Random(1))
    errors, received, outliers = [], 0, 0
    rounds = 20_000
    for _ in range(rounds):
        for i, r in u.read(w):
            received += 1
            e = r - u.true_range(w, i)
            if e > 0.6:
                outliers += 1
            else:
                errors.append(e)
    sent = rounds * len(TWO_ANCHORS)
    assert received / sent == pytest.approx(1 - spec.dropout_p, abs=0.01)
    assert outliers / received == pytest.approx(spec.outlier_p * 0.87, abs=0.006)  # outliers > 0.6 m
    expected_sd = math.hypot(spec.white_sd_m, spec.slow_sd_m)
    assert statistics.pstdev(errors) == pytest.approx(expected_sd, rel=0.1)
    assert abs(statistics.fmean(errors)) < 0.02


def run_with_ekf(world, gyro, uwb, ekf, commands):
    enc = Encoders()
    step = 0
    for v, om, secs in commands:
        for _ in range(int(secs / P.DT_S)):
            world.step(v, om, P.DT_S)
            step += 1
            dl, dr = enc.read(world)
            ranges = uwb.read(world) if step % P.UWB_PERIOD_STEPS == 0 else []
            ekf.step(SensorFrame(P.DT_S, dl, dr, gyro_z=gyro.read(world, P.DT_S), ranges=ranges))


def test_ekf_tracks_truth_with_perfect_sensors():
    w = World(IDEAL, random.Random(3))
    ekf = UwbEkf(TWO_ANCHORS)
    run_with_ekf(w, Gyro(PERFECT_GYRO, random.Random(4)), Uwb(PERFECT_UWB, TWO_ANCHORS, random.Random(5)), ekf,
                 [(0.8, 0.0, 10), (0.5, 0.6, 4), (0.0, -1.2, 2), (1.0, 0.0, 8)])
    assert ekf.x == pytest.approx(w.x, abs=0.02)
    assert ekf.y == pytest.approx(w.y, abs=0.02)
    assert ekf.theta == pytest.approx(w.theta, abs=0.005)


def test_gate_rejects_a_gross_outlier():
    ekf = UwbEkf(TWO_ANCHORS)
    ekf.s[0] = 15.0
    before = list(ekf.s)
    true_range = math.hypot(15.0 + 0.3, 1.4)
    assert ekf.update_range(0, true_range + 2.0) is False
    assert ekf.s == before
    assert ekf.update_range(0, true_range + 0.05) is True


def test_ekf_holds_heading_against_a_large_gyro_bias():
    """With six times the datasheet drift, ranges keep heading where the gyro alone loses it.

    Bias itself is only weakly observable in a minute's driving, so the estimate moves the
    right way but not far; the heading correction is what matters for the lane.
    """
    from mulligan_sim.estimators import OdometryGyro

    bias = 3.0 * DEG / 60.0
    ekf_err, gyro_err, bias_moves = [], [], []
    for seed in range(8):
        w = World(DRY, random.Random(seed))
        g = Gyro(GyroSpec(bias_sd_rads=0.0, scale_sd=0.0), random.Random(seed + 100))
        g.bias = bias
        ekf, dead = UwbEkf(TWO_ANCHORS), OdometryGyro()
        enc, u = Encoders(), Uwb(UwbSpec(), TWO_ANCHORS, random.Random(seed + 200))
        step = 0
        for v, om, secs in [(0.6, 0.15, 30), (0.6, -0.15, 30), (0.6, 0.15, 30)]:
            for _ in range(int(secs / P.DT_S)):
                w.step(v, om, P.DT_S)
                step += 1
                dl, dr = enc.read(w)
                f = SensorFrame(P.DT_S, dl, dr, gyro_z=g.read(w, P.DT_S),
                                ranges=u.read(w) if step % P.UWB_PERIOD_STEPS == 0 else [])
                ekf.step(f)
                dead.step(f)
        ekf_err.append(abs(ekf.theta - w.theta))
        gyro_err.append(abs(dead.theta - w.theta))
        bias_moves.append(ekf.s[3])
    assert statistics.fmean(ekf_err) < 0.5 * statistics.fmean(gyro_err)
    assert all(b > 0.0 for b in bias_moves)


def test_two_anchor_ekf_beats_odometry_gyro_on_the_way_home():
    odo, uwb = [], []
    for seed in range(10):
        r = simulate(out_and_back(seed=seed, ground=WET if seed % 2 else DRY), ["odo_gyro", "uwb2"])
        odo.append(abs(r.est["odo_gyro"][1][-1] - r.y[-1]))
        uwb.append(abs(r.est["uwb2"][1][-1] - r.y[-1]))
    assert statistics.median(uwb) < statistics.median(odo) / 3
