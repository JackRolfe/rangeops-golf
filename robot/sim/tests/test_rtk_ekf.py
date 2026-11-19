import json
import math
import random
from pathlib import Path

import pytest

from mulligan_sim import params as P
from mulligan_sim.estimators import OdometryGyro, RtkEkf, SensorFrame
from mulligan_sim.runner import simulate
from mulligan_sim.scenarios import generate
from mulligan_sim.sensors import (
    GNSS_FIXED, GNSS_FLOAT, PERFECT_GNSS, PERFECT_GYRO, Encoders, Gnss, GnssSpec, Gyro, GyroSpec,
)
from mulligan_sim.world import DRY, IDEAL, World


def drive(world, ekf, gnss, gyro, commands, others=()):
    enc = Encoders()
    step = 0
    every = round(gnss.spec.period_s / P.DT_S) if gnss else 1
    for v, om, secs in commands:
        for _ in range(int(secs / P.DT_S)):
            world.step(v, om, P.DT_S)
            step += 1
            dl, dr = enc.read(world)
            fix = gnss.read(world) if gnss is not None and step % every == 0 else None
            f = SensorFrame(P.DT_S, dl, dr, gyro_z=gyro.read(world, P.DT_S), gnss=fix)
            ekf.step(f)
            for o in others:
                o.step(f)


def test_tracks_truth_with_a_perfect_receiver_once_outside_the_roof():
    w = World(DRY, random.Random(1))
    ekf = RtkEkf()
    drive(w, ekf, Gnss(PERFECT_GNSS, random.Random(2)), Gyro(GyroSpec(), random.Random(3)),
          [(0.8, 0.0, 15), (0.5, 0.5, 5), (0.0, 1.2, 2), (1.0, 0.0, 10)])
    assert ekf.x == pytest.approx(w.x, abs=0.01)
    assert ekf.y == pytest.approx(w.y, abs=0.01)


def test_wrong_fix_far_from_the_estimate_is_gated_out():
    ekf = RtkEkf()
    ekf.s[0] = 20.0
    before = list(ekf.s)
    assert ekf.update_position(20.0, 0.35) is False
    assert ekf.s == before
    assert ekf.update_position(20.01, -0.01) is True


def test_a_run_of_rejected_fixes_is_eventually_let_through():
    ekf = RtkEkf()
    ekf.s[0] = 20.0
    results = [ekf.update_position(20.0, 0.6) for _ in range(ekf.REACQUIRE_AFTER)]
    assert results[-1] is True and not any(results[:-1])
    assert 0.0 < ekf.y < 0.6


def test_dead_reckons_through_a_fix_gap():
    """With no corrections it falls back to exactly what odometry + gyro would say."""
    w = World(DRY, random.Random(4))
    ekf, dead = RtkEkf(), OdometryGyro()
    drive(w, ekf, Gnss(GnssSpec(corrections=False), random.Random(5)), Gyro(GyroSpec(), random.Random(6)),
          [(0.8, 0.1, 20)], others=(dead,))
    assert ekf.x == pytest.approx(dead.x, abs=1e-9)
    assert ekf.y == pytest.approx(dead.y, abs=1e-9)


def test_uwb_results_unchanged_by_the_ekf_refactor():
    log = simulate(generate(1000), ["uwb1", "uwb2", "uwb2_wide"])
    expected = {  # recorded before PoseEkf was split out of UwbEkf
        "uwb1": [0.33503761712446467, 0.12855931913436358, -0.6732737131445747],
        "uwb2": [0.3982056386624768, -0.03311740106174827, -0.6964081493852725],
        "uwb2_wide": [0.4267259298588804, -0.0021639328665847314, -0.587887941050147],
    }
    for name, (x_end, y_end, y_far) in expected.items():
        ex, ey, _ = log.est[name]
        assert (ex[-1], ey[-1], ey[log.far_index()]) == (x_end, y_end, y_far)


def test_rtk_holds_the_lane_to_centimetres_at_30_m():
    errs = [abs(simulate(generate(s), ["rtk"]).lateral_error_at_far("rtk")) for s in range(1000, 1010)]
    assert sorted(errs)[8] < 0.1
