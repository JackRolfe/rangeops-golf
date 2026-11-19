#include "safety.h"

#include <math.h>

namespace mulligan {

namespace {
constexpr float kDegToRad = 3.14159265358979f / 180.0f;
constexpr float kHalfTrackM = 0.370f / 2;

float absf(float v) { return v < 0 ? -v : v; }

// Adds dtMs to a timer while `condition` holds, resets it otherwise, and says
// whether it has run for `limitMs`.
bool sustained(bool condition, uint32_t& timer, uint32_t dtMs, uint32_t limitMs) {
  if (!condition) {
    timer = 0;
    return false;
  }
  timer += dtMs;
  return timer >= limitMs;
}
}  // namespace

float SafetyCore::ramp(float current, float target, float dtS) {
  const bool slowing = (current > 0 && target < current) || (current < 0 && target > current);
  if (slowing) {
    // Brake towards the target, but no further than zero this step: reversing
    // is braking to a stop, then speeding up the other way.
    const float stopAt = current > 0 ? (target > 0 ? target : 0) : (target < 0 ? target : 0);
    const float step = limits::kBrakeMps2 * dtS;
    if (absf(stopAt - current) <= step) return stopAt;
    return current > stopAt ? current - step : current + step;
  }
  const float step = limits::kAccelMps2 * dtS;
  if (absf(target - current) <= step) return target;
  return target > current ? current + step : current - step;
}

void SafetyCore::takeDrive(const SafetyInputs& in) {
  if (!in.unlocked || !in.driveReceived || !sequence_.accept(in.drive.seq)) return;
  haveDrive_ = true;
  drive_ = in.drive;
  driveMs_ = in.nowMs;
  linkLost_ = false;
  if (!drive_.thumb()) {
    needRelease_ = false;
    const bool causeGone = in.imuOk && in.tiltDeg <= limits::kTiltDeg && in.batteryOk;
    if (drive_.clearFault() && faults_ != 0 && causeGone) {
      faults_ = 0;
      tiltSinceMs_ = stallLeftMs_ = stallRightMs_ = imuBadMs_ = batteryBadMs_ = 0;
    }
  }
}

void SafetyCore::checkFaults(const SafetyInputs& in, uint32_t dtMs) {
  const uint8_t before = faults_;
  if (sustained(in.imuOk && in.tiltDeg > limits::kTiltDeg, tiltSinceMs_, dtMs, limits::kTiltMs)) {
    faults_ |= fault::kTilt;
  }
  if (sustained(!in.imuOk, imuBadMs_, dtMs, limits::kSensorMs)) faults_ |= fault::kSensor;
  if (sustained(!in.batteryOk, batteryBadMs_, dtMs, limits::kSensorMs)) faults_ |= fault::kSensor;
  const bool leftStuck = absf(in.leftDuty) >= limits::kStallDuty && absf(in.leftMps) < limits::kStallMps;
  const bool rightStuck = absf(in.rightDuty) >= limits::kStallDuty && absf(in.rightMps) < limits::kStallMps;
  if (sustained(leftStuck, stallLeftMs_, dtMs, limits::kStallMs)) faults_ |= fault::kStall;
  if (sustained(rightStuck, stallRightMs_, dtMs, limits::kStallMs)) faults_ |= fault::kStall;
  if (faults_ != before) needRelease_ = true;
}

void SafetyCore::checkBattery(const SafetyInputs& in, float dtS) {
  if (!in.batteryOk) return;  // the sensor rule handles a silent monitor
  const uint32_t dtMs = static_cast<uint32_t>(dtS * 1000.0f + 0.5f);
  const float v = battery_.update(in.batteryVolts, dtS);
  if (sustained(v < limits::kLowBatteryV, lowMs_, dtMs, limits::kBatteryMs)) lowBattery_ = true;
  if (sustained(v < limits::kPowerDownV, flatMs_, dtMs, limits::kBatteryMs)) powerDown_ = true;
}

SafetyOutputs SafetyCore::tick(const SafetyInputs& in) {
  const uint32_t dtMs = started_ ? in.nowMs - lastMs_ : 10;
  const float dtS = static_cast<float>(dtMs) / 1000.0f;
  started_ = true;
  lastMs_ = in.nowMs;

  // A new hire starts with a fresh sequence and no stick.
  if (in.unlocked != wasUnlocked_) {
    sequence_.reset();
    haveDrive_ = false;
    linkLost_ = false;
  }
  wasUnlocked_ = in.unlocked;

  takeDrive(in);
  checkFaults(in, dtMs);
  checkBattery(in, dtS);

  SafetyOutputs out;
  uint8_t limitFlags = 0;
  float targetLeft = 0, targetRight = 0;
  const bool held = in.unlocked && haveDrive_ && drive_.thumb();

  // 1. Stop switch: nothing moves until it is released and the stick is
  //    released too.
  const bool stopSwitch = in.stopSwitchPressed;
  if (stopSwitch) needRelease_ = true;
  // 2. Link timeout: the stick was held and the messages stopped.
  if (held && in.nowMs - driveMs_ > limits::kLinkTimeoutMs) linkLost_ = true;
  // 3. Tilt or stall (and silent sensors), latched in faults_. 4. Battery.
  const bool immediateStop = stopSwitch || faults_ != 0 || powerDown_;
  const bool mayDrive = held && !needRelease_ && !linkLost_ && !immediateStop && !lowBattery_;

  if (mayDrive) {
    float forward = drive_.y / 100.0f * limits::kTopSpeedMps;
    float turnRight = drive_.x / 100.0f * limits::kFullTurnDps * kDegToRad;
    // 5. Lane limit.
    limitFlags |= lane_.apply(in.pose, forward, turnRight);
    targetLeft = forward + turnRight * kHalfTrackM;
    targetRight = forward - turnRight * kHalfTrackM;
    // 6. Speed cap: scale both sides together so the turn keeps its shape.
    const float fastest = absf(targetLeft) > absf(targetRight) ? absf(targetLeft) : absf(targetRight);
    if (fastest > limits::kTopSpeedMps + 1e-4f) {
      const float scale = limits::kTopSpeedMps / fastest;
      targetLeft *= scale;
      targetRight *= scale;
      limitFlags |= limit::kSpeed;
    }
  }

  if (immediateStop) {
    left_ = right_ = 0;
  } else {
    left_ = ramp(left_, targetLeft, dtS);
    right_ = ramp(right_, targetRight, dtS);
  }
  const bool moving = left_ != 0 || right_ != 0;

  out.leftMps = left_;
  out.rightMps = right_;
  // Motor power stays on while still braking after a lock, so it brakes
  // rather than coasts.
  out.relayOn = !immediateStop && (in.unlocked || moving);
  out.powerDown = powerDown_;

  Telemetry& t = out.telemetry;
  if (stopSwitch) {
    t.state = RobotState::StoppedBySwitch;
  } else if (faults_ != 0) {
    t.state = RobotState::Fault;
  } else if (lowBattery_ || powerDown_) {
    t.state = RobotState::LowBattery;
  } else if (!in.unlocked) {
    t.state = RobotState::Locked;
  } else if (linkLost_) {
    t.state = RobotState::LinkLost;
  } else if (mayDrive && limitFlags != 0) {
    t.state = RobotState::AtLimit;
  } else if (mayDrive || moving) {
    t.state = RobotState::Driving;
  } else {
    t.state = RobotState::Idle;
  }
  t.batteryPercent = battery_.started() ? batteryPercent(battery_.volts()) : 0;
  t.faults = faults_ | ((lowBattery_ || powerDown_) ? fault::kLowVoltage : 0);
  t.limits = limitFlags;
  t.lastSeq = drive_.seq;
  return out;
}

}  // namespace mulligan
