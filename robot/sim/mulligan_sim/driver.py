"""The child at the bay, holding the stick.

A person watching the robot steers on where it really is, not on where the robot thinks
it is, so the driver works from the true pose. It drives to each goal in turn, picks up
balls (drive over, pause, a wiggle to settle them in the pen), turns round at the far end,
and comes home. It wobbles, as children do, and gives up on a ball it can't reach (for
example because the lane limit has stopped the robot short of it).
"""

import math
import random
from dataclasses import dataclass

from . import params as P


@dataclass(frozen=True)
class Goal:
    x: float
    y: float
    kind: str  # "ball", "far" or "home"


@dataclass(frozen=True)
class Style:
    spin_turner: bool = True  # turns big angles on the spot; otherwise in a tight arc
    speed: float = 0.9  # fraction of top speed the child likes
    wobble_sd_rads: float = 0.15  # stick wobble, as a turn rate
    wobble_tau_s: float = 1.0
    turn_gain: float = 2.5  # rad/s of turn per rad of heading error
    pause_s: float = 1.5  # stop on a ball
    wiggle_s: float = 0.4  # each half of the settle-the-ball wiggle
    give_up_s: float = 6.0  # no progress for this long: abandon the goal


TOLERANCE_M = {"ball": 0.25, "far": 0.5, "home": 0.4}
BIG_TURN_RAD = 1.0  # beyond this heading error, turn on the spot (or in a tight arc)


def wrap(angle: float) -> float:
    return math.atan2(math.sin(angle), math.cos(angle))


class Driver:
    def __init__(self, goals: list[Goal], style: Style, rng: random.Random):
        self.goals = list(goals)
        self.style = style
        self.rng = rng
        self.index = 0
        self.phase = "drive"
        self.phase_t = 0.0
        self.wobble = 0.0
        self.best_dist = math.inf
        self.best_t = 0.0
        self.t = 0.0
        self.done = False
        self.abandoned = 0
        self.reached: list[int] = []  # indices of goals reached

    def _next_goal(self) -> None:
        self.index += 1
        self.phase = "drive"
        self.best_dist = math.inf
        self.best_t = self.t
        if self.index >= len(self.goals):
            self.done = True

    def command(self, x: float, y: float, theta: float, dt: float) -> tuple[float, float]:
        """Stick command (forward speed m/s, turn rate rad/s) from the true pose."""
        self.t += dt
        s = self.style
        a = dt / s.wobble_tau_s
        self.wobble = self.wobble * (1.0 - a) + s.wobble_sd_rads * math.sqrt(a * (2.0 - a)) * self.rng.gauss(0.0, 1.0)
        if self.done:
            return 0.0, 0.0

        if self.phase == "pause":
            self.phase_t += dt
            if self.phase_t >= s.pause_s:
                self.phase, self.phase_t = "wiggle", 0.0
            return 0.0, 0.0
        if self.phase == "wiggle":
            self.phase_t += dt
            if self.phase_t >= 2.0 * s.wiggle_s:
                self._next_goal()
                return 0.0, 0.0
            sign = 1.0 if self.phase_t < s.wiggle_s else -1.0
            return 0.0, sign * 0.6 * P.MAX_TURN_RATE_RADS

        goal = self.goals[self.index]
        dx, dy = goal.x - x, goal.y - y
        dist = math.hypot(dx, dy)
        if dist < self.best_dist - 0.2:
            self.best_dist, self.best_t = dist, self.t
        if dist < TOLERANCE_M[goal.kind]:
            self.reached.append(self.index)
            if goal.kind == "ball":
                self.phase, self.phase_t = "pause", 0.0
                return 0.0, 0.0
            self._next_goal()
            return 0.0, 0.0
        if self.t - self.best_t > s.give_up_s:
            self.abandoned += 1
            self._next_goal()
            return 0.0, 0.0

        error = wrap(math.atan2(dy, dx) - theta)
        if abs(error) > BIG_TURN_RAD:
            turn = math.copysign(P.MAX_TURN_RATE_RADS, error)
            return (0.0 if s.spin_turner else 0.35), turn
        turn = s.turn_gain * error + self.wobble
        turn = max(-P.MAX_TURN_RATE_RADS, min(P.MAX_TURN_RATE_RADS, turn))
        approach = min(1.0, max(0.25, dist / 1.5))
        speed = s.speed * P.TOP_SPEED_MS * max(0.2, math.cos(error)) * approach
        return speed, turn
