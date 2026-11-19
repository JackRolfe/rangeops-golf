"""What the robot can measure.

Each sensor reads the true World and returns what the firmware would see.
"""

import math

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
