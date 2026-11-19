import math
import random

import pytest

from mulligan_sim import params as P
from mulligan_sim.estimators import Odometry, SensorFrame
from mulligan_sim.runner import simulate
from mulligan_sim.scenarios import out_and_back
from mulligan_sim.sensors import Encoders
from mulligan_sim.world import DRY, IDEAL, WET, World


def drive(world, v, w, seconds, encoders=None, odo=None):
    for _ in range(int(round(seconds / P.DT_S))):
        world.step(v, w, P.DT_S)
        if encoders is not None:
            dl, dr = encoders.read(world)
            odo.step(SensorFrame(P.DT_S, dl, dr))


def test_encoder_counts_are_integers_at_753_per_wheel_turn():
    assert P.COUNTS_PER_WHEEL_TURN == pytest.approx(753.2)
    one_turn = math.pi * P.WHEEL_DIAMETER_M
    assert Encoders.counts(one_turn) in (752, 753)
    assert isinstance(Encoders.counts(1.234), int)
    assert Encoders.counts(10.0) == math.floor(10.0 / P.METRES_PER_COUNT)


def test_ideal_ground_drives_straight():
    w = World(IDEAL, random.Random(1))
    drive(w, 1.0, 0.0, 10.0)
    assert abs(w.y) < 1e-9
    assert abs(w.theta) < 1e-12
    assert w.x > 8.0


def test_ideal_ground_spins_by_commanded_angle():
    w = World(IDEAL, random.Random(1))
    # Ramp-up and ramp-down eat a little: compare with the integral of the wheel speeds.
    drive(w, 0.0, 1.0, math.pi)
    drive(w, 0.0, 0.0, 1.0)
    expected = (w.wheel_right_m - w.wheel_left_m) / (P.CHI_NOMINAL * P.TRACK_M) * (1 - IDEAL.slip_mean)
    assert w.theta == pytest.approx(expected, rel=1e-9)
    assert w.theta == pytest.approx(math.pi, abs=0.15)
    assert math.hypot(w.x, w.y) < 1e-9


def test_odometry_matches_truth_on_ideal_ground_to_quantisation():
    w = World(IDEAL, random.Random(2))
    enc, odo = Encoders(), Odometry()
    drive(w, 0.8, 0.0, 5.0, enc, odo)
    drive(w, 0.5, 0.6, 4.0, enc, odo)
    drive(w, 0.0, -1.2, 2.0, enc, odo)
    drive(w, 1.0, 0.0, 5.0, enc, odo)
    assert odo.x == pytest.approx(w.x, abs=0.01)
    assert odo.y == pytest.approx(w.y, abs=0.01)
    assert odo.theta == pytest.approx(w.theta, abs=0.01)


@pytest.mark.parametrize("ground", [DRY, WET])
def test_slip_makes_robot_travel_less_than_its_wheels(ground):
    shortfalls = []
    for seed in range(20):
        w = World(ground, random.Random(seed))
        drive(w, 1.0, 0.0, 10.0)
        wheels = 0.5 * (w.wheel_left_m + w.wheel_right_m)
        shortfalls.append(1.0 - math.hypot(w.x, w.y) / wheels)
    assert all(s > 0.0 for s in shortfalls)


def test_wet_grass_slips_more_than_dry():
    def turned(ground):
        total = 0.0
        for seed in range(20):
            w = World(ground, random.Random(seed))
            drive(w, 0.6, 0.8, 8.0)
            total += abs(w.theta)
        return total
    # The same wheel commands turn the robot less on wet grass.
    assert turned(WET) < turned(DRY)


def test_out_and_back_run_is_reproducible_and_reaches_30_m():
    a = simulate(out_and_back(seed=3), ["odometry"])
    b = simulate(out_and_back(seed=3), ["odometry"])
    assert a.completed
    assert a.x.max() > 29.4
    assert abs(a.x[-1]) < 0.5 and abs(a.y[-1]) < 0.5
    assert a.lateral_error_at_far("odometry") == b.lateral_error_at_far("odometry")
    assert math.isfinite(a.lateral_error_at_far("odometry"))
