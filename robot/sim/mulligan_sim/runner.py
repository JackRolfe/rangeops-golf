"""One run: the driver, the lane limit (optional), the world, the sensors and the estimators."""

import math
from dataclasses import dataclass, field

import numpy as np

from . import params as P
from .driver import Driver
from .estimators import Odometry, SensorFrame
from .scenarios import Scenario
from .sensors import Encoders

ESTIMATORS = {
    "odometry": lambda scenario: Odometry(),
}


@dataclass
class RunLog:
    scenario: Scenario
    t: np.ndarray
    x: np.ndarray
    y: np.ndarray
    theta: np.ndarray
    est: dict = field(default_factory=dict)  # name -> (x, y, theta) arrays
    completed: bool = False
    abandoned: int = 0

    def far_index(self) -> int:
        """The sample where the robot is furthest out."""
        return int(np.argmax(self.x))

    def lateral_error_at_far(self, name: str) -> float:
        i = self.far_index()
        return float(self.est[name][1][i] - self.y[i])


def simulate(scenario: Scenario, estimators: list[str], enforce: str | None = None,
             margin: float = 0.0) -> RunLog:
    """Simulate one run. If `enforce` names an estimator, the lane limit acts on its pose."""
    from .world import World

    start = scenario.rng(5)
    world = World(
        scenario.ground, scenario.rng(1),
        x=scenario.dock_sd_xy_m * start.gauss(0.0, 1.0),
        y=scenario.dock_sd_xy_m * start.gauss(0.0, 1.0),
        theta=scenario.dock_sd_theta_rad * start.gauss(0.0, 1.0),
    )
    driver = Driver(list(scenario.goals), scenario.style, scenario.rng(2))
    encoders = Encoders()
    ests = {name: ESTIMATORS[name](scenario) for name in estimators}
    if enforce is not None and enforce not in ests:
        raise ValueError(f"enforce={enforce!r} is not among the estimators")

    dt = P.DT_S
    n_max = int(scenario.max_time_s / dt)
    t_log, x_log, y_log, th_log = [], [], [], []
    est_log = {name: ([], [], []) for name in ests}
    step = 0
    while step < n_max and not driver.done:
        v_cmd, w_cmd = driver.command(world.x, world.y, world.theta, dt)
        if enforce is not None:
            from .lane_limit import limit_command
            e = ests[enforce]
            v_cmd, w_cmd = limit_command(e.x, e.y, e.theta, v_cmd, w_cmd, margin)
        world.step(v_cmd, w_cmd, dt)
        step += 1
        d_left, d_right = encoders.read(world)
        frame = SensorFrame(dt=dt, d_counts_left=d_left, d_counts_right=d_right)
        for name, e in ests.items():
            e.step(frame)
            lx, ly, lth = est_log[name]
            lx.append(e.x)
            ly.append(e.y)
            lth.append(e.theta)
        t_log.append(step * dt)
        x_log.append(world.x)
        y_log.append(world.y)
        th_log.append(world.theta)

    return RunLog(
        scenario=scenario,
        t=np.array(t_log), x=np.array(x_log), y=np.array(y_log), theta=np.array(th_log),
        est={k: (np.array(v[0]), np.array(v[1]), np.array(v[2])) for k, v in est_log.items()},
        completed=driver.done and driver.index >= len(scenario.goals),
        abandoned=driver.abandoned,
    )
