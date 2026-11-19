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


# --- Fixed-size matrix helpers for the EKF -------------------------------------------
# N = 5. In C++ these become functions on float[5][5]; written as plain loops on purpose.

N = 5  # state: x, y, theta, gyro bias, odometry distance scale
IX, IY, ITH, IB, IK = 0, 1, 2, 3, 4


def _zeros() -> list:
    return [[0.0] * N for _ in range(N)]


def _identity() -> list:
    m = _zeros()
    for i in range(N):
        m[i][i] = 1.0
    return m


def _mul(a: list, b: list) -> list:
    out = _zeros()
    for i in range(N):
        for j in range(N):
            acc = 0.0
            for k in range(N):
                acc += a[i][k] * b[k][j]
            out[i][j] = acc
    return out


def _mul_bt(a: list, b: list) -> list:
    """a * transpose(b)."""
    out = _zeros()
    for i in range(N):
        for j in range(N):
            acc = 0.0
            for k in range(N):
                acc += a[i][k] * b[j][k]
            out[i][j] = acc
    return out


class UwbEkf:
    """Extended Kalman filter: gyro and encoders predict, UWB ranges to dock anchors correct.

    State: x, y, theta, gyro bias b (residual after dock calibration), odometry distance
    scale k (wet grass slips more than the dry-grass calibration). Predict each tick with
    encoder distance and gyro rate; update with each range, behind an innovation gate that
    rejects multipath outliers. If an anchor's ranges are rejected many times in a row the
    filter has probably drifted, so the next one is let through with a widened variance.
    """

    # Process noise. Variances grow with distance travelled and angle turned, not time,
    # because slip and scale errors happen when the wheels and robot move.
    Q_DIST = 0.05 ** 2  # m^2 per m travelled, along track
    Q_SIDE = 0.02 ** 2  # m^2 per m travelled, across track (sideslip, kicks)
    Q_TURN = 0.009 ** 2  # rad^2 per rad turned (gyro scale error, ~0.5%)
    Q_GYRO = (0.014 * math.pi / 180.0) ** 2  # rad^2/s (gyro white noise)
    Q_BIAS = (0.001 * math.pi / 180.0) ** 2  # (rad/s)^2 per s, 3x the bias walk
    Q_SCALE = 0.01 ** 2  # per m travelled
    # Measurement: white plus the slow part, widened because the slow part is not white.
    R_RANGE = 0.25 ** 2
    GATE = 9.0  # chi-squared, 1 dof: 3 sigma
    REACQUIRE_AFTER = 20  # consecutive rejections of one anchor (2 s at 10 Hz)
    MIN_RANGE = 0.5  # range direction is ill-defined right next to an anchor

    def __init__(self, anchors: tuple, name: str = "uwb_ekf") -> None:
        self.name = name
        self.anchors = anchors
        self.s = [0.0, 0.0, 0.0, 0.0, 1.0]
        self.P = _zeros()
        self.P[IX][IX] = 0.02 ** 2
        self.P[IY][IY] = 0.02 ** 2
        self.P[ITH][ITH] = (0.5 * math.pi / 180.0) ** 2
        self.P[IB][IB] = (0.5 * math.pi / 180.0 / 60.0) ** 2
        self.P[IK][IK] = 0.03 ** 2
        self.metres_per_count = P.METRES_PER_COUNT * P.ODOMETRY_DISTANCE_SCALE
        self.rejected_in_row = [0] * len(anchors)
        self.accepted = 0
        self.rejected = 0

    @property
    def x(self) -> float:
        return self.s[IX]

    @property
    def y(self) -> float:
        return self.s[IY]

    @property
    def theta(self) -> float:
        return self.s[ITH]

    def step(self, f: SensorFrame) -> None:
        self.predict(f)
        for i, r in f.ranges:
            self.update_range(i, r)

    def predict(self, f: SensorFrame) -> None:
        s = self.s
        dt = f.dt
        d_enc = 0.5 * (f.d_counts_left + f.d_counts_right) * self.metres_per_count
        rate = f.gyro_z - s[IB]
        d_theta = rate * dt
        mid = s[ITH] + 0.5 * d_theta
        c, sn = math.cos(mid), math.sin(mid)
        d = s[IK] * d_enc

        s[IX] += d * c
        s[IY] += d * sn
        s[ITH] += d_theta

        F = _identity()
        F[IX][ITH] = -d * sn
        F[IX][IB] = 0.5 * dt * d * sn
        F[IX][IK] = d_enc * c
        F[IY][ITH] = d * c
        F[IY][IB] = -0.5 * dt * d * c
        F[IY][IK] = d_enc * sn
        F[ITH][IB] = -dt

        travelled = abs(d_enc)
        q_along = self.Q_DIST * travelled
        q_side = self.Q_SIDE * travelled
        Q = _zeros()
        Q[IX][IX] = q_along * c * c + q_side * sn * sn
        Q[IY][IY] = q_along * sn * sn + q_side * c * c
        Q[IX][IY] = (q_along - q_side) * c * sn
        Q[IY][IX] = Q[IX][IY]
        Q[ITH][ITH] = self.Q_TURN * abs(d_theta) + self.Q_GYRO * dt
        Q[IB][IB] = self.Q_BIAS * dt
        Q[IK][IK] = self.Q_SCALE * travelled

        FP = _mul(F, self.P)
        FPFt = _mul_bt(FP, F)
        for i in range(N):
            for j in range(N):
                self.P[i][j] = FPFt[i][j] + Q[i][j]

    def update_range(self, i: int, measured: float) -> bool:
        """Correct with one range to anchor i. Returns False if the gate rejected it."""
        s, Pm = self.s, self.P
        ax, ay = self.anchors[i]
        dx, dy = s[IX] - ax, s[IY] - ay
        predicted = math.sqrt(dx * dx + dy * dy)
        if predicted < self.MIN_RANGE:
            return False
        h = [dx / predicted, dy / predicted, 0.0, 0.0, 0.0]

        # PHt = P * h^T, S = h * P * h^T + R
        pht = [0.0] * N
        for a in range(N):
            acc = 0.0
            for b in range(N):
                acc += Pm[a][b] * h[b]
            pht[a] = acc
        r_var = self.R_RANGE
        S = r_var
        for a in range(N):
            S += h[a] * pht[a]
        nu = measured - predicted

        if nu * nu / S > self.GATE:
            self.rejected_in_row[i] += 1
            if self.rejected_in_row[i] < self.REACQUIRE_AFTER:
                self.rejected += 1
                return False
            r_var = r_var * 16.0  # let one through, with little weight
            S += r_var - self.R_RANGE
        self.rejected_in_row[i] = 0
        self.accepted += 1

        K = [pht[a] / S for a in range(N)]
        for a in range(N):
            s[a] += K[a] * nu

        # Joseph form: P = (I - K h) P (I - K h)^T + K R K^T, for numerical robustness.
        A = _identity()
        for a in range(N):
            for b in range(N):
                A[a][b] -= K[a] * h[b]
        AP = _mul(A, Pm)
        APAt = _mul_bt(AP, A)
        for a in range(N):
            for b in range(N):
                Pm[a][b] = APAt[a][b] + K[a] * r_var * K[b]
        return True
