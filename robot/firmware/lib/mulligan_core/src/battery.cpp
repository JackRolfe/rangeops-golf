#include "battery.h"

namespace mulligan {

float BatteryFilter::update(float volts, float dtS) {
  constexpr float kTimeConstantS = 1.0f;
  if (!started_) {
    started_ = true;
    volts_ = volts;
  } else {
    volts_ += (volts - volts_) * dtS / (kTimeConstantS + dtS);
  }
  return volts_;
}

uint8_t batteryPercent(float volts) {
  // Resting cell voltage to charge left, for typical 18650 cells.
  static const float kCell[] = {3.00f, 3.30f, 3.50f, 3.60f, 3.70f, 3.80f, 3.90f, 4.00f, 4.10f, 4.20f};
  static const float kPercent[] = {0, 5, 15, 30, 50, 65, 78, 88, 96, 100};
  const float cell = volts / 5.0f;
  if (cell <= kCell[0]) return 0;
  for (int i = 1; i < 10; i++) {
    if (cell < kCell[i]) {
      const float f = (cell - kCell[i - 1]) / (kCell[i] - kCell[i - 1]);
      return static_cast<uint8_t>(kPercent[i - 1] + f * (kPercent[i] - kPercent[i - 1]) + 0.5f);
    }
  }
  return 100;
}

}  // namespace mulligan
