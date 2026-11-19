"""Position estimators, written to port line for line to the firmware's C++.

Rules for this file: scalar floats, the math module, ints and fixed-size lists only.
No numpy, no comprehensions over unbounded data, no allocation in step functions beyond
fixed-size locals. Each class is a struct plus a step function.

All estimators start at the dock pose (0, 0, 0) and take one SensorFrame per control tick.
"""

import math
from dataclasses import dataclass, field

from . import params as P


@dataclass
class SensorFrame:
    """Everything the firmware reads in one 50 Hz tick."""

    dt: float
    d_counts_left: int
    d_counts_right: int
    gyro_z: float = 0.0  # rad/s, already corrected by the dock's bias calibration
    # (anchor index, range in metres) for each UWB range that arrived this tick.
    ranges: list = field(default_factory=list)


class Odometry:
    """Wheel odometry only: distance and heading from the encoders.

    Heading comes from the difference between the sides divided by the nominal effective
    track, so every unmodelled scrub, slip difference and yaw kick goes straight into it.
    """

    name = "odometry"

    def __init__(self) -> None:
        self.x = 0.0
        self.y = 0.0
        self.theta = 0.0
        self.metres_per_count = P.METRES_PER_COUNT * P.ODOMETRY_DISTANCE_SCALE
        self.effective_track = P.CHI_NOMINAL * P.TRACK_M

    def step(self, f: SensorFrame) -> None:
        d_left = f.d_counts_left * self.metres_per_count
        d_right = f.d_counts_right * self.metres_per_count
        d = 0.5 * (d_left + d_right)
        d_theta = (d_right - d_left) / self.effective_track
        mid = self.theta + 0.5 * d_theta
        self.x += d * math.cos(mid)
        self.y += d * math.sin(mid)
        self.theta += d_theta


class OdometryGyro:
    """Distance from the encoders, heading from the gyro.

    The gyro rate arrives already corrected by the dock's bias calibration, so the residual
    bias, scale error and noise all integrate into heading. Wheel slip still affects the
    distance, and sideslip goes unseen.
    """

    name = "odo_gyro"

    def __init__(self) -> None:
        self.x = 0.0
        self.y = 0.0
        self.theta = 0.0
        self.metres_per_count = P.METRES_PER_COUNT * P.ODOMETRY_DISTANCE_SCALE

    def step(self, f: SensorFrame) -> None:
        d = 0.5 * (f.d_counts_left + f.d_counts_right) * self.metres_per_count
        d_theta = f.gyro_z * f.dt
        mid = self.theta + 0.5 * d_theta
        self.x += d * math.cos(mid)
        self.y += d * math.sin(mid)
        self.theta += d_theta
