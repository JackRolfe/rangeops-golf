#include "motion.h"

#include <math.h>

namespace mulligan {

namespace {
float clamp(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

float wrapAngle(float a) {
  while (a > geometry::kPi) a -= 2 * geometry::kPi;
  while (a < -geometry::kPi) a += 2 * geometry::kPi;
  return a;
}
}  // namespace

void WheelSpeed::reset() {
  n_ = 0;
  head_ = 0;
  mps_ = 0;
}

float WheelSpeed::update(int32_t counts, uint32_t nowMs) {
  counts_[head_] = counts;
  ms_[head_] = nowMs;
  const int newest = head_;
  head_ = (head_ + 1) % kWindow;
  if (n_ < kWindow) n_++;
  const int oldest = (n_ < kWindow) ? 0 : head_;
  const uint32_t dtMs = ms_[newest] - ms_[oldest];
  if (n_ < 2 || dtMs == 0) {
    mps_ = 0;
  } else {
    mps_ = static_cast<float>(counts_[newest] - counts_[oldest]) * geometry::kMetresPerCount * 1000.0f /
           static_cast<float>(dtMs);
  }
  return mps_;
}

float SpeedController::update(float targetMps, float measuredMps, float dtS) {
  if (targetMps == 0.0f) {
    integral_ = 0;
    return 0.0f;  // the MDD10A brakes at zero duty
  }
  const float error = targetMps - measuredMps;
  const float feedForward = targetMps / geometry::kFreeSpeedMps;
  const float unclamped = feedForward + g_.kp * error + integral_;
  // Integrate only while it can help: not when the output is already pinned
  // in the direction the error pushes.
  const bool pinnedHigh = unclamped >= g_.dutyMax && error > 0;
  const bool pinnedLow = unclamped <= -g_.dutyMax && error < 0;
  if (!pinnedHigh && !pinnedLow) {
    integral_ = clamp(integral_ + g_.ki * error * dtS, -g_.integralMax, g_.integralMax);
  }
  return clamp(feedForward + g_.kp * error + integral_, -g_.dutyMax, g_.dutyMax);
}

void Odometry::reset() {
  x_ = y_ = heading_ = 0;
  haveZero_ = false;
}

void Odometry::update(float leftM, float rightM, bool headingValid, float headingRad) {
  const float before = heading_;
  if (headingValid) {
    if (!haveZero_) {
      sensorZero_ = headingRad;
      haveZero_ = true;
    }
    heading_ = wrapAngle(headingRad - sensorZero_);
  } else {
    heading_ = wrapAngle(heading_ + (rightM - leftM) / geometry::kTrackM);
  }
  const float mid = before + wrapAngle(heading_ - before) / 2;
  const float d = (leftM + rightM) / 2;
  x_ += d * cosf(mid);
  y_ += d * sinf(mid);
}

float Odometry::distanceM() const { return sqrtf(x_ * x_ + y_ * y_); }

uint16_t Odometry::distanceDm() const {
  const float dm = distanceM() * 10.0f + 0.5f;
  return dm >= 65534.0f ? 65534 : static_cast<uint16_t>(dm);
}

bool tiltDegrees(float gx, float gy, float gz, float& degrees) {
  const float g = sqrtf(gx * gx + gy * gy + gz * gz);
  if (g < 4.0f) return false;  // m/s²: not a reading to trust
  degrees = acosf(clamp(gz / g, -1.0f, 1.0f)) * 180.0f / geometry::kPi;
  return true;
}

}  // namespace mulligan
