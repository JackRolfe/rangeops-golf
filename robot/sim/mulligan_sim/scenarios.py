"""Runs to simulate: where the balls are, what the grass is like, how the child drives."""

import random
from dataclasses import dataclass, field

from . import params as P
from .driver import Goal, Style
from .sensors import GyroSpec, UwbSpec
from .world import DRY, Ground


@dataclass(frozen=True)
class Scenario:
    seed: int
    ground: Ground
    goals: tuple[Goal, ...]
    style: Style = field(default_factory=Style)
    # How far the docked robot really is from the dock pose it zeroes to. ASSUMED: the dock
    # guides the wheels to within 2 cm and half a degree (1 sd).
    dock_sd_xy_m: float = 0.02
    dock_sd_theta_rad: float = 0.5 * 3.141592653589793 / 180.0
    gyro: GyroSpec = field(default_factory=GyroSpec)
    uwb: UwbSpec = field(default_factory=UwbSpec)
    max_time_s: float = 400.0

    def rng(self, stream: int) -> random.Random:
        """An independent random stream per component, so changing one leaves the others."""
        return random.Random(self.seed * 7919 + stream)


def out_and_back(seed: int = 0, ground: Ground = DRY, far_y: float = 0.0,
                 style: Style | None = None, **overrides) -> Scenario:
    """The simplest run: straight out to 30 m, turn round, come home."""
    return Scenario(
        seed=seed,
        ground=ground,
        goals=(Goal(P.REACH_M, far_y, "far"), Goal(0.0, 0.0, "home")),
        style=style or Style(),
        **overrides,
    )


def generate(seed: int, ground: Ground | None = None, chase_p: float = 0.3,
             chase_y: tuple[float, float] = (1.8, 3.0), return_balls: int = 0,
             **overrides) -> Scenario:
    """A 30 m out-and-back run with two or three pickups on the way out.

    Each ball is in the robot's own lane, or with probability `chase_p` in a neighbouring
    bay (|y| in `chase_y`), which a child will drive after. Half the children turn on the
    spot, half in a tight arc. If `ground` is None it is dry or wet with equal odds.
    `return_balls` more balls are picked up on the way home, after the turn.
    """
    from .world import WET

    rng = random.Random(seed * 7919)
    if ground is None:
        ground = WET if rng.random() < 0.5 else DRY
    n_balls = rng.choice((2, 3))
    xs = sorted(rng.uniform(5.0, 27.0) for _ in range(n_balls))
    def ball(x: float) -> Goal:
        if rng.random() < chase_p:
            return Goal(x, rng.choice((-1.0, 1.0)) * rng.uniform(*chase_y), "ball")
        return Goal(x, rng.uniform(-1.2, 1.2), "ball")

    goals = [ball(x) for x in xs]
    goals.append(Goal(P.REACH_M, rng.uniform(-1.0, 1.0), "far"))
    back = sorted((rng.uniform(5.0, 25.0) for _ in range(return_balls)), reverse=True)
    goals.extend(ball(x) for x in back)
    goals.append(Goal(0.0, 0.0, "home"))
    style = Style(
        spin_turner=rng.random() < 0.5,
        speed=rng.uniform(0.7, 1.0),
        wobble_sd_rads=rng.uniform(0.05, 0.25),
    )
    return Scenario(seed=seed, ground=ground, goals=tuple(goals), style=style, **overrides)


def standard_ten() -> list[Scenario]:
    """The ten standard runs: seeds 0-9, alternately dry and wet."""
    from .world import WET

    return [generate(seed, DRY if seed % 2 == 0 else WET) for seed in range(10)]
