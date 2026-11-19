"""Mulligan's numbers, in SI units.

The robot's geometry and drive limits mirror robot/design/params.mjs; keep them in step.
Everything that R0 will measure on grass is marked ASSUMED, so it can be replaced.
"""

import math

# --- Robot, from robot/design/params.mjs -------------------------------------------

WHEEL_DIAMETER_M = 0.144
WHEEL_RADIUS_M = WHEEL_DIAMETER_M / 2
WHEEL_WIDTH_M = 0.052
TRACK_M = 0.370  # wheel centre to wheel centre, side to side
WHEELBASE_M = 0.240  # front axle to rear axle

ENCODER_COUNTS_PER_MOTOR_TURN = 28  # goBILDA 5203, already quadrature-decoded
GEAR_RATIO = 26.9
COUNTS_PER_WHEEL_TURN = ENCODER_COUNTS_PER_MOTOR_TURN * GEAR_RATIO  # 753.2
METRES_PER_COUNT = math.pi * WHEEL_DIAMETER_M / COUNTS_PER_WHEEL_TURN  # ~0.60 mm

TOP_SPEED_MS = 4.0 / 3.6  # firmware cap, 4 km/h
ACCEL_MS2 = 1.0  # firmware acceleration limit
DECEL_MS2 = 2.5  # firmware braking limit

# Half the robot's overall width (track plus one wheel width): how far the body reaches
# beyond its centre. "Inside the lane" is judged on the centre; add this for the body.
BODY_HALF_WIDTH_M = (TRACK_M + WHEEL_WIDTH_M) / 2

# --- The promise ----------------------------------------------------------------------

LANE_HALF_WIDTH_M = 1.5  # a bay is about 3 m wide
REACH_M = 30.0

# --- Simulation -----------------------------------------------------------------------

DT_S = 0.02  # 50 Hz control loop, encoders and gyro
UWB_PERIOD_STEPS = 5  # 10 Hz ranging

# --- Skid steer -----------------------------------------------------------------------

# A skid-steered robot turns more slowly than its wheel speeds say, because the wheels
# scrub sideways. The usual model replaces the track B with an effective track chi*B.
# ASSUMED: chi ~1.45 on dry grass for this wheelbase/track ratio (0.65); the firmware
# mixes the stick and the odometry uses this nominal value, calibrated on dry grass.
CHI_NOMINAL = 1.45

# ASSUMED: odometry's distance calibration on dry grass (2% longitudinal slip).
ODOMETRY_DISTANCE_SCALE = 0.98

# The driver's full stick turn, as a body rate. ASSUMED: firmware choice.
MAX_TURN_RATE_RADS = 1.5
