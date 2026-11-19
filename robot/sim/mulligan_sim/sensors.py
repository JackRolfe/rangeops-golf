"""What the robot can measure.

Each sensor reads the true World and returns what the firmware would see.
"""

import math
import random
from dataclasses import dataclass

from . import params as P


class Encoders:
    """One quadrature encoder per side, on the rear wheel, read as integer counts.

    The goBILDA 5203 gives 28 counts per motor turn; through 26.9:1 that is 753.2 counts
    per wheel turn, about 0.60 mm of wheel travel per count.
    """

    def __init__(self) -> None:
        self.last_left = 0
        self.last_right = 0

    @staticmethod
    def counts(wheel_travel_m: float) -> int:
        return math.floor(wheel_travel_m / P.METRES_PER_COUNT)

    def read(self, world) -> tuple[int, int]:
        """Counts since the last read, left and right."""
        left = self.counts(world.wheel_left_m)
        right = self.counts(world.wheel_right_m)
        d_left, d_right = left - self.last_left, right - self.last_right
        self.last_left, self.last_right = left, right
        return d_left, d_right


DEG = math.pi / 180.0


@dataclass(frozen=True)
class GyroSpec:
    """A BNO085's yaw rate, as the firmware would read it after the dock's bias calibration.

    Published (CEVA BNO08X Datasheet 1000-3927 v1.17, section 6.7, Figure 6-14):
      - Game rotation vector, dynamic heading drift: 0.5 deg/min. The game rotation vector
        is the gyro-and-accelerometer fusion with no magnetometer, which is what a robot
        next to motors and an aluminium chassis has to use. We read this as the 1-sd
        residual bias after calibration (the datasheet doesn't say typical or max).
      - Gyroscope dynamic accuracy 3.1 deg/s: a lump figure from simulated motion, not a
        bias or noise spec, so not used directly.
      - The raw gyro is Bosch's (the datasheet points to the BMF055 for the sensors).
    ASSUMED:
      - White noise 0.014 deg/s/sqrt(Hz), the figure Bosch gives for its BMI085/BMG160-class
        gyros; not checked against the BMF055 datasheet.
      - Bias random walk 0.0003 deg/s/sqrt(s) (bias instability over a few minutes).
      - Scale-factor error 0.5% (1 sd). Bosch-class gyros quote about +-1% sensitivity
        tolerance; the BNO08X datasheet gives none. Tilt on uneven grass adds a cosine error
        that is folded in here.
    The dock calibration means the firmware subtracts its bias estimate before use; what
    remains is the residual modelled here.
    """

    bias_sd_rads: float = 0.5 * DEG / 60.0
    bias_walk_rads_per_rts: float = 0.0003 * DEG
    noise_density_rads_per_rthz: float = 0.014 * DEG
    scale_sd: float = 0.005


PERFECT_GYRO = GyroSpec(0.0, 0.0, 0.0, 0.0)


class Gyro:
    """Yaw rate = (1 + scale error) * true rate + bias + white noise."""

    def __init__(self, spec: GyroSpec, rng: random.Random) -> None:
        self.spec = spec
        self.rng = rng
        self.scale = spec.scale_sd * rng.gauss(0.0, 1.0)
        self.bias = spec.bias_sd_rads * rng.gauss(0.0, 1.0)

    def read(self, world, dt: float) -> float:
        s = self.spec
        self.bias += s.bias_walk_rads_per_rts * math.sqrt(dt) * self.rng.gauss(0.0, 1.0)
        noise = s.noise_density_rads_per_rthz / math.sqrt(dt) * self.rng.gauss(0.0, 1.0)
        return (1.0 + self.scale) * world.omega + self.bias + noise


# Anchor layouts in the dock frame. The dock sits at the bay, the robot parks 0.3 m in
# front of it. ASSUMED: robot antenna at the robot's centre and at the anchors' height,
# so the 2D range is the true range.
ONE_ANCHOR = ((-0.3, 0.0),)
TWO_ANCHORS = ((-0.3, 1.4), (-0.3, -1.4))  # the two front corners of a 3 m bay
TWO_ANCHORS_WIDE = ((-0.3, 3.0), (-0.3, -3.0))  # on the neighbouring bays' far dividers


@dataclass(frozen=True)
class UwbSpec:
    """Ultra-wideband ranging from the robot to anchors at the dock.

    ASSUMED, from the brief's "about +-10 cm" for DW1000/DW3000-class radios:
      - white noise 8 cm plus a slowly varying per-anchor error of 5 cm with a 2 s
        correlation time (antenna orientation, ground reflections): about 9.4 cm in all;
      - 2% of ranges are multipath outliers, always long, by 0.3 to 2.5 m;
      - 5% of ranges are lost;
      - 10 Hz per anchor.
    """

    white_sd_m: float = 0.08
    slow_sd_m: float = 0.05
    slow_tau_s: float = 2.0
    outlier_p: float = 0.02
    outlier_min_m: float = 0.3
    outlier_max_m: float = 2.5
    dropout_p: float = 0.05
    period_s: float = P.UWB_PERIOD_STEPS * P.DT_S


PERFECT_UWB = UwbSpec(0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0)


class Uwb:
    def __init__(self, spec: UwbSpec, anchors: tuple, rng: random.Random) -> None:
        self.spec = spec
        self.anchors = anchors
        self.rng = rng
        self.slow = [spec.slow_sd_m * rng.gauss(0.0, 1.0) for _ in anchors]

    def true_range(self, world, i: int) -> float:
        ax, ay = self.anchors[i]
        return math.hypot(world.x - ax, world.y - ay)

    def read(self, world) -> list[tuple[int, float]]:
        """One ranging round: (anchor index, measured range) for each range received."""
        s, rng = self.spec, self.rng
        a = min(1.0, s.period_s / s.slow_tau_s)
        out = []
        for i in range(len(self.anchors)):
            self.slow[i] = self.slow[i] * (1.0 - a) + s.slow_sd_m * math.sqrt(a * (2.0 - a)) * rng.gauss(0.0, 1.0)
            white = s.white_sd_m * rng.gauss(0.0, 1.0)
            lost = rng.random() < s.dropout_p
            outlier = rng.random() < s.outlier_p
            extra = rng.uniform(s.outlier_min_m, s.outlier_max_m)
            if lost:
                continue
            r = self.true_range(world, i) + self.slow[i] + white + (extra if outlier else 0.0)
            out.append((i, max(0.0, r)))
        return out


# --- RTK GNSS --------------------------------------------------------------------------

GNSS_NONE, GNSS_FLOAT, GNSS_FIXED = 0, 1, 2


@dataclass(frozen=True)
class GnssSpec:
    """A u-blox ZED-F9P-like RTK receiver on the robot's roof, reporting in the lane frame.

    From docs/research/positioning-lane-limit.md (section 3):
      - fixed: about 1-2 cm (ZED-F9P 0.010 m horizontal, plus about 1 ppm of base distance);
      - float: 0.2 to 1 m out;
      - no fix under the bay roof; a fix within seconds once outside (SparkFun: under 10 s
        for the F9P);
      - multipath from the roof edge, steel net poles and fences causes float dropouts;
        how often is unknown until measured at the pilot range.
    ASSUMED:
      - fixed: 1 cm white plus 1.5 cm slowly wandering multipath per axis (2 cm in all);
      - float: 0.4 m slow error (15 s correlation) plus 0.1 m white, per axis;
      - the dock sits 1 m under the roof, so there is no solution for x < 1 m;
      - after rolling out, float for 3 to 10 s, then fixed;
      - one float episode every 2 minutes in the open, one every 15 s within 4 m of the
        roof edge, each lasting 2 to 8 s;
      - 1% of fixes are wrong (a bad integer ambiguity fix), 0.1 to 0.4 m out, lasting
        until the next float episode or 30 s;
      - 5 Hz, no latency; antenna above the robot's centre;
      - the lane is surveyed once by driving to its corners, leaving 2 cm of offset and
        0.05 deg of rotation between the surveyed and the true lane.
    """

    period_s: float = 0.2
    fixed_white_sd_m: float = 0.01
    fixed_slow_sd_m: float = 0.015
    fixed_slow_tau_s: float = 10.0
    float_slow_sd_m: float = 0.4
    float_slow_tau_s: float = 15.0
    float_white_sd_m: float = 0.1
    roof_x_m: float = 1.0
    first_fix_s: tuple = (3.0, 10.0)
    edge_zone_x_m: float = 4.0
    float_rate_open_per_s: float = 1.0 / 120.0
    float_rate_edge_per_s: float = 1.0 / 15.0
    float_episode_s: tuple = (2.0, 8.0)
    wrong_fix_p: float = 0.01
    wrong_fix_m: tuple = (0.1, 0.4)
    wrong_fix_max_s: float = 30.0
    survey_sd_m: float = 0.02
    survey_rot_sd_rad: float = 0.05 * DEG
    corrections: bool = True  # False: no RTK corrections reach the robot (Wi-Fi or caster down)


PERFECT_GNSS = GnssSpec(
    fixed_white_sd_m=0.0, fixed_slow_sd_m=0.0, float_slow_sd_m=0.0, float_white_sd_m=0.0,
    first_fix_s=(0.0, 0.0), float_rate_open_per_s=0.0, float_rate_edge_per_s=0.0,
    wrong_fix_p=0.0, survey_sd_m=0.0, survey_rot_sd_rad=0.0,
)


class Gnss:
    """Reports (x, y, quality) in the surveyed lane frame, or None with no solution."""

    def __init__(self, spec: GnssSpec, rng: random.Random) -> None:
        self.spec = spec
        self.rng = rng
        self.offset_x = spec.survey_sd_m * rng.gauss(0.0, 1.0)
        self.offset_y = spec.survey_sd_m * rng.gauss(0.0, 1.0)
        self.rot = spec.survey_rot_sd_rad * rng.gauss(0.0, 1.0)
        self.state = GNSS_NONE
        self.timer = 0.0  # time left in the current float spell
        self.wrong_x = 0.0
        self.wrong_y = 0.0
        self.wrong_t = 0.0
        self.slow = [0.0, 0.0]  # fixed multipath wander, x and y
        self.float_err = [0.0, 0.0]

    def _start_float(self, duration: float) -> None:
        self.state = GNSS_FLOAT
        self.timer = duration
        self.wrong_x = self.wrong_y = 0.0

    def _get_fix(self) -> None:
        s, rng = self.spec, self.rng
        self.state = GNSS_FIXED
        self.wrong_x = self.wrong_y = 0.0
        if rng.random() < s.wrong_fix_p:
            size = rng.uniform(*s.wrong_fix_m)
            angle = rng.uniform(-math.pi, math.pi)
            self.wrong_x, self.wrong_y = size * math.cos(angle), size * math.sin(angle)
            self.wrong_t = s.wrong_fix_max_s

    def read(self, world) -> tuple[float, float, int] | None:
        s, rng, dt = self.spec, self.rng, self.spec.period_s
        # Advance error processes every read, so the random stream doesn't depend on state.
        a_fix = min(1.0, dt / s.fixed_slow_tau_s)
        a_flt = min(1.0, dt / s.float_slow_tau_s)
        for i in range(2):
            self.slow[i] = self.slow[i] * (1.0 - a_fix) + s.fixed_slow_sd_m * math.sqrt(a_fix * (2.0 - a_fix)) * rng.gauss(0.0, 1.0)
            self.float_err[i] = self.float_err[i] * (1.0 - a_flt) + s.float_slow_sd_m * math.sqrt(a_flt * (2.0 - a_flt)) * rng.gauss(0.0, 1.0)
        white = (rng.gauss(0.0, 1.0), rng.gauss(0.0, 1.0))
        u_event = rng.random()
        u_duration = rng.random()

        if world.x < s.roof_x_m:
            self.state = GNSS_NONE
            return None
        if self.state == GNSS_NONE:
            # Just rolled out from under the roof.
            self._start_float(s.first_fix_s[0] + (s.first_fix_s[1] - s.first_fix_s[0]) * u_duration)
        elif self.state == GNSS_FLOAT:
            self.timer -= dt
            if self.timer <= 0.0 and s.corrections:
                self._get_fix()
        else:
            rate = s.float_rate_edge_per_s if world.x < s.edge_zone_x_m else s.float_rate_open_per_s
            if self.wrong_x or self.wrong_y:
                self.wrong_t -= dt
                if self.wrong_t <= 0.0:
                    rate = 1.0 / dt  # the receiver catches its bad fix and drops to float
            if u_event < rate * dt:
                lo, hi = s.float_episode_s
                self._start_float(lo + (hi - lo) * u_duration)

        # True position in the surveyed lane frame.
        c, sn = math.cos(self.rot), math.sin(self.rot)
        x = c * world.x - sn * world.y + self.offset_x
        y = sn * world.x + c * world.y + self.offset_y
        if self.state == GNSS_FIXED:
            return (x + self.slow[0] + s.fixed_white_sd_m * white[0] + self.wrong_x,
                    y + self.slow[1] + s.fixed_white_sd_m * white[1] + self.wrong_y, GNSS_FIXED)
        return (x + self.float_err[0] + s.float_white_sd_m * white[0],
                y + self.float_err[1] + s.float_white_sd_m * white[1], GNSS_FLOAT)
