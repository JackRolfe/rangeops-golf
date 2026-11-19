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
