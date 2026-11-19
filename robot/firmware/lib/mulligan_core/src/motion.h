// Wheels: encoder decoding, wheel speed, the per-side speed controller,
// odometry and tilt. Numbers from robot/DESIGN.md.
#pragma once
#include <stdint.h>

namespace mulligan {

namespace geometry {
constexpr float kPi = 3.14159265358979f;
constexpr float kWheelDiameterM = 0.144f;
// goBILDA 5203, 26.9:1: 28 counts a motor turn, 751.8 a wheel turn.
constexpr float kCountsPerWheelTurn = 751.8f;
constexpr float kMetresPerCount = kPi * kWheelDiameterM / kCountsPerWheelTurn;
constexpr float kTrackM = 0.370f;
// 223 rpm on 144 mm wheels at 12 V and full duty: 6.1 km/h.
constexpr float kFreeSpeedMps = 223.0f / 60.0f * kPi * kWheelDiameterM;
}  // namespace geometry

// One quadrature step from the previous and current pin states, each
// (A << 1) | B. +1 when A leads B, -1 when B leads, 0 for no change or for a
// jump of two states, which means an edge was missed.
inline int8_t quadratureStep(uint8_t previous, uint8_t current) {
  static const int8_t kTable[16] = {0, -1, +1, 0, +1, 0, 0, -1, -1, 0, 0, +1, 0, +1, -1, 0};
  return kTable[((previous & 3) << 2) | (current & 3)];
}

inline bool quadratureMissed(uint8_t previous, uint8_t current) { return ((previous ^ current) & 3) == 3; }

// Wheel speed from encoder counts sampled every control tick, over the last
// few ticks so one count of jitter does not swing it.
class WheelSpeed {
 public:
  static constexpr int kWindow = 6;  // samples, so 50 ms at 100 Hz
  void reset();
  // Total counts so far and the time; returns metres per second.
  float update(int32_t counts, uint32_t nowMs);
  float mps() const { return mps_; }

 private:
  int32_t counts_[kWindow] = {};
  uint32_t ms_[kWindow] = {};
  int n_ = 0;
  int head_ = 0;
  float mps_ = 0;
};

// Speed for one side: feed-forward from the motor's free speed plus PI on the
// measured speed. Output is a duty from -1 to 1. Gains are first guesses, to
// tune on the bench.
struct SpeedControllerGains {
  float kp = 0.5f;           // duty per m/s of error
  float ki = 2.0f;           // duty per m s of error
  float integralMax = 0.3f;  // duty
  // Never more than this, so a broken encoder cannot make the controller run
  // the wheels flat out. 0.8 is about 1.36 m/s unloaded; the stall rule stops
  // a wheel whose encoder reads nothing.
  float dutyMax = 0.8f;
};

class SpeedController {
 public:
  explicit SpeedController(SpeedControllerGains g = SpeedControllerGains()) : g_(g) {}
  void reset() { integral_ = 0; }
  float update(float targetMps, float measuredMps, float dtS);

 private:
  SpeedControllerGains g_;
  float integral_ = 0;
};

// Where the robot is relative to where it was zeroed: x forward, y left, in
// metres, heading anticlockwise in radians. Heading comes from the motion
// sensor when it has one, otherwise from the wheels.
class Odometry {
 public:
  void reset();
  void update(float leftM, float rightM, bool headingValid, float headingRad);
  float x() const { return x_; }
  float y() const { return y_; }
  float heading() const { return heading_; }
  float distanceM() const;
  // For telemetry: decimetres from zero, capped below 65535 (unknown).
  uint16_t distanceDm() const;

 private:
  float x_ = 0, y_ = 0, heading_ = 0;
  bool haveZero_ = false;
  float sensorZero_ = 0;
};

// Degrees from upright, from the gravity vector in the sensor's frame with z
// up when the robot is level. False if the vector is too short to trust.
bool tiltDegrees(float gx, float gy, float gz, float& degrees);

}  // namespace mulligan
