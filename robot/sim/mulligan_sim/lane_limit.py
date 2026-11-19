"""The lane-limit rule, written to port line for line to the firmware's C++.

Rules for this file: scalar floats and the math module only.

The allowed area is a box in the dock frame: |y| <= half width and x <= reach, each shrunk
by the margin to give the stop lines. Before each stop line is a slow zone. The rule only
ever limits the part of the motion that heads *outward* across a line:

- well inside: the stick passes unchanged;
- in the slow zone: the outward speed is capped, falling linearly from top speed at the
  zone's start to a creep speed at the stop line, so the robot arrives slowly;
- at or past the stop line: no outward motion at all.

Turning is always obeyed (turning on the spot doesn't move the robot), and so is any
motion that takes it back inside, so a child can always drive home. The forward speed is
scaled down as a whole so that its outward component fits under the cap; the turn rate is
left alone.
"""

import math
from dataclasses import dataclass

from . import params as P


@dataclass(frozen=True)
class LaneLimitConfig:
    half_width_m: float = P.LANE_HALF_WIDTH_M
    reach_m: float = P.REACH_M
    slow_zone_m: float = 0.6  # braking from top speed at 2.5 m/s^2 takes 0.25 m
    creep_ms: float = 0.25  # outward speed allowed at the stop line's edge


DEFAULT = LaneLimitConfig()


def outward_cap(distance_to_line: float, cfg: LaneLimitConfig = DEFAULT) -> float:
    """The most outward speed allowed this far inside a stop line (negative: past it)."""
    if distance_to_line <= 0.0:
        return 0.0
    if distance_to_line >= cfg.slow_zone_m:
        return P.TOP_SPEED_MS
    return cfg.creep_ms + (P.TOP_SPEED_MS - cfg.creep_ms) * distance_to_line / cfg.slow_zone_m


def limit_command(x_hat: float, y_hat: float, theta_hat: float, v_cmd: float, omega_cmd: float,
                  margin: float, cfg: LaneLimitConfig = DEFAULT) -> tuple[float, float]:
    """Return the (forward speed, turn rate) the motors may have, from the estimated pose."""
    vx = v_cmd * math.cos(theta_hat)
    vy = v_cmd * math.sin(theta_hat)
    scale = 1.0

    # Sideways: the nearer edge is the one on the side the robot is on.
    stop_y = cfg.half_width_m - margin
    if y_hat >= 0.0:
        outward = vy
        to_line = stop_y - y_hat
    else:
        outward = -vy
        to_line = stop_y + y_hat
    if outward > 0.0:
        cap = outward_cap(to_line, cfg)
        if outward > cap:
            scale = min(scale, cap / outward)

    # Out along the range.
    if vx > 0.0:
        cap = outward_cap(cfg.reach_m - margin - x_hat, cfg)
        if vx > cap:
            scale = min(scale, cap / vx)

    return v_cmd * scale, omega_cmd
