import numpy as np

from mulligan_sim import params as P
from mulligan_sim.metrics import lateral_metrics
from mulligan_sim.runner import simulate
from mulligan_sim.scenarios import generate, standard_ten


def test_standard_ten_are_reproducible_and_go_out_and_back():
    scenarios = standard_ten()
    assert [s.seed for s in scenarios] == list(range(10))
    assert [s.ground.name for s in scenarios] == ["dry", "wet"] * 5
    assert scenarios[3] == standard_ten()[3]
    for sc in scenarios[:4]:
        log = simulate(sc, ["odo_gyro"])
        assert log.completed
        assert log.x.max() > P.REACH_M - 0.6
        assert np.hypot(log.x[-1], log.y[-1]) < 0.5


def test_some_standard_runs_chase_balls_out_of_the_lane():
    outside = [g for sc in standard_ten() for g in sc.goals if abs(g.y) > P.LANE_HALF_WIDTH_M]
    assert len(outside) >= 3


def test_metrics_count_believed_inside_while_outside():
    log = simulate(generate(6, chase_p=1.0), ["odometry", "odo_gyro"])
    m = lateral_metrics(log, "odo_gyro")
    assert m.outside_samples > 0
    assert 0 <= m.fooled_samples <= m.outside_samples
    assert m.max_error_m >= abs(m.far_error_m)


def test_return_balls_come_after_the_turn():
    sc = generate(11, return_balls=1)
    kinds = [g.kind for g in sc.goals]
    far = kinds.index("far")
    assert kinds[far + 1] == "ball" and kinds[-1] == "home"


def test_driver_records_goals_reached():
    sc = generate(4, chase_p=0.0)
    log = simulate(sc, ["odo_gyro"])
    assert log.reached[-1] == len(sc.goals) - 1  # home
    assert len(log.reached) == len(sc.goals) - log.abandoned
