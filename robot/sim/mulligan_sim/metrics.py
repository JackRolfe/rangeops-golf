"""What we measure on a finished run."""

from dataclasses import dataclass

import numpy as np

from . import params as P
from .runner import RunLog


@dataclass
class EstimatorMetrics:
    far_error_m: float  # estimate minus truth, sideways, at the furthest point out
    home_error_m: float  # the same, back at the dock
    max_error_m: float  # worst sideways error at any time
    outside_samples: int  # ticks with the true centre outside the lane
    fooled_samples: int  # ...of which the estimate said "inside"
    false_alarm_samples: int  # ticks truly inside but believed outside
    inside_samples: int
    fooled_depth_m: float  # furthest outside the lane while believed inside (0 if never)

    @property
    def fooled_rate(self) -> float:
        return self.fooled_samples / self.outside_samples if self.outside_samples else float("nan")


def lateral_metrics(log: RunLog, name: str, half_width: float = P.LANE_HALF_WIDTH_M) -> EstimatorMetrics:
    y_hat = log.est[name][1]
    err = y_hat - log.y
    i = log.far_index()
    out = np.abs(log.y) > half_width
    believed_in = np.abs(y_hat) <= half_width
    return EstimatorMetrics(
        far_error_m=float(err[i]),
        home_error_m=float(err[-1]),
        max_error_m=float(np.max(np.abs(err))),
        outside_samples=int(out.sum()),
        fooled_samples=int((out & believed_in).sum()),
        false_alarm_samples=int((~out & ~believed_in).sum()),
        inside_samples=int((~out).sum()),
        fooled_depth_m=float(np.max(np.abs(log.y)[out & believed_in] - half_width)) if (out & believed_in).any() else 0.0,
    )


def max_true_offset(log: RunLog) -> float:
    """How far sideways the true centre got during the run."""
    return float(np.max(np.abs(log.y)))
