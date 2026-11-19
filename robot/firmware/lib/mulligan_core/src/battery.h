// The 18 V tool battery: a filtered voltage and a rough percentage.
#pragma once
#include <stdint.h>

namespace mulligan {

// Smooths the battery voltage with a one-second time constant, so motor
// current pulling it down for a moment does not count as flat.
class BatteryFilter {
 public:
  float update(float volts, float dtS);
  float volts() const { return volts_; }
  bool started() const { return started_; }

 private:
  bool started_ = false;
  float volts_ = 0;
};

// A five-cell lithium-ion pack: 15.0 V is empty, 21.0 V is full. Rough.
uint8_t batteryPercent(float volts);

}  // namespace mulligan
