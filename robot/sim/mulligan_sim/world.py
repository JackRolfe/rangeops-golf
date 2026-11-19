"""The true motion of a four-wheel skid-steer robot on grass.

Frame: the dock frame. x forward out along the range from the robot's docked centre,
y to the left, heading theta anticlockwise from +x.

The motor controllers hold each side's wheel surface speed at its target (they run on the
encoders, so the wheels themselves do what they're told). What the ground does with that
is where the error comes from:

- Longitudinal slip per side: the robot moves less than the wheels turn. A common part
  (grass, sinkage, effective radius) and an asymmetric part (one side on longer or wetter
  grass), both rising in turns.
- Turn scrub: the effective track is chi*B with chi > 1, varying from run to run and along
  a run, so the robot turns at a rate the wheel speeds can't tell you exactly.
- Sideslip: in a moving turn the robot drifts toward the outside of the turn.
- Yaw kicks: tussocks and divots twist the robot. The gyro sees these; the encoders don't.

Every number in DRY and WET is ASSUMED, to be replaced by R0's measurements on grass.
"""

import math
import random
from dataclasses import dataclass

from . import params as P


@dataclass(frozen=True)
class Ground:
    name: str
    chi_mean: float  # effective-track factor
    chi_run_sd: float  # run-to-run spread
    chi_walk_sd: float  # along-run variation (Ornstein-Uhlenbeck over distance)
    chi_walk_len_m: float
    slip_mean: float  # common longitudinal slip, fraction of wheel speed
    slip_run_sd: float
    slip_turn_gain: float  # extra slip per rad/s of turn
    asym_run_sd: float  # left/right slip difference, constant over a run
    asym_walk_sd: float  # left/right slip difference, varying along a run
    asym_walk_len_m: float
    sideslip_gain_s: float  # sideways speed = gain * v * omega, toward the outside of the turn
    yaw_kick_sd_rads: float  # unmeasured yaw disturbance at full speed (OU over time)
    yaw_kick_tau_s: float


DRY = Ground(
    name="dry",
    chi_mean=1.45, chi_run_sd=0.05, chi_walk_sd=0.05, chi_walk_len_m=3.0,
    slip_mean=0.02, slip_run_sd=0.01, slip_turn_gain=0.04,
    asym_run_sd=0.002, asym_walk_sd=0.003, asym_walk_len_m=5.0,
    sideslip_gain_s=0.02,
    yaw_kick_sd_rads=0.010, yaw_kick_tau_s=0.3,
)

WET = Ground(
    name="wet",
    chi_mean=1.60, chi_run_sd=0.10, chi_walk_sd=0.08, chi_walk_len_m=3.0,
    slip_mean=0.05, slip_run_sd=0.02, slip_turn_gain=0.08,
    asym_run_sd=0.004, asym_walk_sd=0.006, asym_walk_len_m=5.0,
    sideslip_gain_s=0.04,
    yaw_kick_sd_rads=0.015, yaw_kick_tau_s=0.3,
)

# No slip at all, for tests: the robot does exactly what the odometry thinks.
IDEAL = Ground(
    name="ideal",
    chi_mean=P.CHI_NOMINAL, chi_run_sd=0.0, chi_walk_sd=0.0, chi_walk_len_m=1.0,
    slip_mean=1.0 - P.ODOMETRY_DISTANCE_SCALE, slip_run_sd=0.0, slip_turn_gain=0.0,
    asym_run_sd=0.0, asym_walk_sd=0.0, asym_walk_len_m=1.0,
    sideslip_gain_s=0.0,
    yaw_kick_sd_rads=0.0, yaw_kick_tau_s=1.0,
)

GROUNDS = {g.name: g for g in (DRY, WET, IDEAL)}


def _ou_step(value: float, sd: float, step: float, length: float, rng: random.Random) -> float:
    """Ornstein-Uhlenbeck update with stationary sd, correlation length `length`, over `step`."""
    if sd == 0.0 or step == 0.0:
        return value
    a = step / length
    if a > 1.0:
        a = 1.0
    return value * (1.0 - a) + sd * math.sqrt(a * (2.0 - a)) * rng.gauss(0.0, 1.0)


def _rate_limit(current: float, target: float, dt: float) -> float:
    """Move a wheel speed toward its target within the firmware's accel and braking limits."""
    speeding_up = target * current >= 0.0 and abs(target) > abs(current)
    limit = (P.ACCEL_MS2 if speeding_up else P.DECEL_MS2) * dt
    delta = target - current
    if delta > limit:
        delta = limit
    elif delta < -limit:
        delta = -limit
    return current + delta


class World:
    """The true robot. step() takes the (possibly lane-limited) stick command."""

    def __init__(self, ground: Ground, rng: random.Random, x: float = 0.0, y: float = 0.0,
                 theta: float = 0.0):
        self.ground = ground
        self.rng = rng
        self.x, self.y, self.theta = x, y, theta
        # Per-run draws.
        self.chi_run = ground.chi_mean + ground.chi_run_sd * rng.gauss(0.0, 1.0)
        self.slip_run = max(0.0, ground.slip_mean + ground.slip_run_sd * rng.gauss(0.0, 1.0))
        self.asym_run = ground.asym_run_sd * rng.gauss(0.0, 1.0)
        # Slowly varying states.
        self.chi_walk = 0.0
        self.asym_walk = 0.0
        self.yaw_kick = 0.0
        # Wheel surface speeds and cumulative wheel travel (what the encoders see).
        self.u_left = 0.0
        self.u_right = 0.0
        self.wheel_left_m = 0.0
        self.wheel_right_m = 0.0
        # True body rates over the last step (what the gyro sees).
        self.v = 0.0
        self.omega = 0.0

    def step(self, v_cmd: float, omega_cmd: float, dt: float) -> None:
        g = self.ground
        # The firmware mixes the stick into side speeds with the nominal effective track.
        half = 0.5 * P.CHI_NOMINAL * P.TRACK_M
        target_l = v_cmd - omega_cmd * half
        target_r = v_cmd + omega_cmd * half
        biggest = max(abs(target_l), abs(target_r))
        if biggest > P.TOP_SPEED_MS:
            target_l *= P.TOP_SPEED_MS / biggest
            target_r *= P.TOP_SPEED_MS / biggest
        self.u_left = _rate_limit(self.u_left, target_l, dt)
        self.u_right = _rate_limit(self.u_right, target_r, dt)
        self.wheel_left_m += self.u_left * dt
        self.wheel_right_m += self.u_right * dt

        # Slip: common + turn-dependent + asymmetric.
        wheel_turn_rate = (self.u_right - self.u_left) / (P.CHI_NOMINAL * P.TRACK_M)
        common = self.slip_run + g.slip_turn_gain * abs(wheel_turn_rate)
        asym = self.asym_run + self.asym_walk
        s_left = min(0.9, max(0.0, common + 0.5 * asym))
        s_right = min(0.9, max(0.0, common - 0.5 * asym))
        ground_l = self.u_left * (1.0 - s_left)
        ground_r = self.u_right * (1.0 - s_right)

        chi = max(1.0, self.chi_run + self.chi_walk)
        v = 0.5 * (ground_l + ground_r)
        moving = min(1.0, (abs(self.u_left) + abs(self.u_right)) / (2.0 * P.TOP_SPEED_MS))
        omega = (ground_r - ground_l) / (chi * P.TRACK_M) + self.yaw_kick * moving
        v_side = -g.sideslip_gain_s * v * omega  # toward the outside of the turn

        mid = self.theta + 0.5 * omega * dt
        c, s = math.cos(mid), math.sin(mid)
        self.x += (v * c - v_side * s) * dt
        self.y += (v * s + v_side * c) * dt
        self.theta += omega * dt
        self.v = v
        self.omega = omega

        # Advance the slowly varying states.
        travelled = abs(v) * dt
        self.chi_walk = _ou_step(self.chi_walk, g.chi_walk_sd, travelled, g.chi_walk_len_m, self.rng)
        self.asym_walk = _ou_step(self.asym_walk, g.asym_walk_sd, travelled, g.asym_walk_len_m, self.rng)
        self.yaw_kick = _ou_step(self.yaw_kick, g.yaw_kick_sd_rads, dt, g.yaw_kick_tau_s, self.rng)
