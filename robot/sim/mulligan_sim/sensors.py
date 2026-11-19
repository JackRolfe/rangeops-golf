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
