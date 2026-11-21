// The safety core: one control tick turns the robot's inputs into what the
// motors, the relay and telemetry should do. Rules run in the order
// robot/DESIGN.md gives, and any of them can force a stop:
//
//   stop switch, link timeout, tilt or stall, low battery, lane limit, speed cap
//
// then the acceleration ramp. No hardware calls; time is passed in.
#pragma once
#include <stdint.h>

#include "battery.h"
#include "link.h"

namespace mulligan {

namespace limits {
constexpr uint32_t kLinkTimeoutMs = 300;
constexpr float kTopSpeedMps = 1.11f;   // 4 km/h
constexpr float kFullTurnDps = 85.0f;   // full sideways: a pivot at about 85°/s
constexpr float kAccelMps2 = 1.0f;
constexpr float kBrakeMps2 = 2.5f;
constexpr float kTiltDeg = 35.0f;
constexpr uint32_t kTiltMs = 100;       // beyond 35° for this long
constexpr float kStallDuty = 0.25f;     // a side commanded at least this hard...
constexpr float kStallMps = 0.05f;      // ...whose wheel turns slower than this...
constexpr uint32_t kStallMs = 500;      // ...for this long has stalled
constexpr uint32_t kSensorMs = 200;     // a sensor silent this long is a fault
constexpr float kLowBatteryV = 16.5f;   // stop driving
constexpr float kPowerDownV = 15.0f;    // cut motor power and shut down
constexpr uint32_t kBatteryMs = 2000;   // below a threshold for this long
}  // namespace limits

// Where the robot thinks it is, for the lane limit.
struct Pose {
  bool valid = false;
  float x = 0, y = 0, heading = 0;  // metres forward and left of zero, radians anticlockwise
};

// R2's lane limit goes behind this. It may reduce the forward speed and turn
// rate to keep the robot inside its box and returns the limit flags it set.
class LaneLimit {
 public:
  virtual ~LaneLimit() = default;
  virtual uint8_t apply(const Pose& pose, float& forwardMps, float& turnRightRadps) = 0;
};

// R0: no lane limit.
class NoLaneLimit : public LaneLimit {
 public:
  uint8_t apply(const Pose&, float&, float&) override { return 0; }
};

struct SafetyInputs {
  uint32_t nowMs = 0;
  bool stopSwitchPressed = false;
  bool unlocked = false;  // HireLock::unlocked()
  // The latest Drive message parsed since the last tick, if any. The core
  // applies the sequence rule itself.
  bool driveReceived = false;
  DriveMessage drive;
  bool imuOk = false;
  float tiltDeg = 0;
  bool batteryOk = false;
  float batteryVolts = 0;
  float leftMps = 0, rightMps = 0;    // measured
  float leftDuty = 0, rightDuty = 0;  // what the speed controllers last asked for
  Pose pose;
};

struct SafetyOutputs {
  float leftMps = 0, rightMps = 0;  // targets for the speed controllers
  bool relayOn = false;
  bool powerDown = false;  // shut the controller down
  Telemetry telemetry;     // all but distance, which the board fills in
};

class SafetyCore {
 public:
  explicit SafetyCore(LaneLimit& lane) : lane_(lane) {}
  SafetyOutputs tick(const SafetyInputs& in);

  uint8_t faults() const { return faults_; }

 private:
  void takeDrive(const SafetyInputs& in);
  void checkFaults(const SafetyInputs& in, uint32_t dtMs);
  void checkBattery(const SafetyInputs& in, float dtS);
  static float ramp(float current, float target, float dtS);

  LaneLimit& lane_;
  bool started_ = false;
  uint32_t lastMs_ = 0;

  // Link
  bool wasUnlocked_ = false;
  SequenceFilter sequence_;
  bool haveDrive_ = false;
  DriveMessage drive_;
  uint32_t driveMs_ = 0;
  bool linkLost_ = false;
  bool needRelease_ = false;

  // Faults, latched
  uint8_t faults_ = 0;
  uint32_t tiltSinceMs_ = 0, stallLeftMs_ = 0, stallRightMs_ = 0, imuBadMs_ = 0, batteryBadMs_ = 0;

  // Battery, latched
  BatteryFilter battery_;
  uint32_t lowMs_ = 0, flatMs_ = 0;
  bool lowBattery_ = false;
  bool powerDown_ = false;

  float left_ = 0, right_ = 0;  // ramped targets
};

}  // namespace mulligan
