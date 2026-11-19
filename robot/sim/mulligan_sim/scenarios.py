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
