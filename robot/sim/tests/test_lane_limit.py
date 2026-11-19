import math

import pytest

from mulligan_sim import params as P
from mulligan_sim.driver import Goal, Style
from mulligan_sim.lane_limit import DEFAULT, limit_command, outward_cap
from mulligan_sim.runner import simulate
from mulligan_sim.scenarios import Scenario
from mulligan_sim.sensors import PERFECT_GYRO
from mulligan_sim.world import IDEAL

V = P.TOP_SPEED_MS
LEFT = math.pi / 2


def test_well_inside_the_command_passes_unchanged():
    assert limit_command(10.0, 0.0, LEFT, V, 0.7, margin=0.3) == (V, 0.7)
    assert limit_command(10.0, 0.0, 0.3, V, -0.4, margin=0.3) == (V, -0.4)


def test_slow_zone_caps_outward_speed_falling_toward_the_line():
    margin = 0.3
    stop = P.LANE_HALF_WIDTH_M - margin
    speeds = [limit_command(10.0, stop - d, LEFT, V, 0.0, margin)[0] for d in (0.5, 0.3, 0.1, 0.01)]
    assert all(a > b for a, b in zip(speeds, speeds[1:]))
    assert speeds[0] < V
    assert speeds[-1] == pytest.approx(DEFAULT.creep_ms, abs=0.02)


def test_outward_component_only_is_capped():
    margin = 0.3
    y = P.LANE_HALF_WIDTH_M - margin - 0.1
    heading = math.radians(30)  # mostly along the range, a little outward
    v, _ = limit_command(10.0, y, heading, V, 0.0, margin)
    assert v * math.sin(heading) == pytest.approx(outward_cap(0.1), rel=1e-9)


@pytest.mark.parametrize("y_sign", [1.0, -1.0])
def test_at_or_past_the_line_no_outward_motion(y_sign):
    margin = 0.4
    for past in (0.0, 0.05, 0.5):
        y = y_sign * (P.LANE_HALF_WIDTH_M - margin + past)
        v, w = limit_command(10.0, y, y_sign * LEFT, V, 0.3, margin)
        assert v == 0.0
        assert w == 0.3  # turning is always obeyed


@pytest.mark.parametrize("y_sign", [1.0, -1.0])
def test_inward_commands_and_spins_always_pass(y_sign):
    y = y_sign * 2.5  # well past the line
    assert limit_command(10.0, y, -y_sign * LEFT, V, 0.0, 0.3) == (V, 0.0)
    # Reversing away from the edge while facing it is inward too.
    assert limit_command(10.0, y, y_sign * LEFT, -0.5, 0.0, 0.3) == (-0.5, 0.0)
    assert limit_command(10.0, y, 0.0, 0.0, 1.5, 0.3) == (0.0, 1.5)


def test_reach_limit_stops_outward_and_lets_it_come_home():
    assert limit_command(29.8, 0.0, 0.0, V, 0.0, 0.3)[0] == 0.0
    assert limit_command(29.8, 0.0, math.pi, V, 0.0, 0.3)[0] == V


def test_robot_with_perfect_sensors_stops_near_the_stop_line():
    """A child chases a ball in the next bay; the true robot stops at the line."""
    sc = Scenario(seed=1, ground=IDEAL, gyro=PERFECT_GYRO,
                  goals=(Goal(10.0, 3.0, "ball"), Goal(0.0, 0.0, "home")),
                  style=Style(wobble_sd_rads=0.0), dock_sd_xy_m=0.0, dock_sd_theta_rad=0.0)
    margin = 0.3
    log = simulate(sc, ["odo_gyro"], enforce="odo_gyro", margin=margin)
    stop = P.LANE_HALF_WIDTH_M - margin
    # Braking from creep speed and the wheels ramping separately in a turn carry it a few
    # centimetres past the line, even with perfect sensing.
    assert stop - 0.02 < log.y.max() < stop + 0.06
    assert log.completed  # gave up on the ball and came home
    free = simulate(sc, ["odo_gyro"])
    assert free.y.max() > 2.7
