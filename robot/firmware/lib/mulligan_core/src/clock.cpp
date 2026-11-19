#include "clock.h"

namespace mulligan {

bool AnchoredClock::now(uint32_t monotonicMs, uint32_t& unixSeconds) const {
  if (!anchored_) return false;
  unixSeconds = anchorUnix_ + (monotonicMs - anchorMs_) / 1000u;
  return true;
}

void AnchoredClock::offerAnchor(uint32_t unixSeconds, uint32_t monotonicMs) {
  if (anchored_) return;
  anchored_ = true;
  anchorUnix_ = unixSeconds;
  anchorMs_ = monotonicMs;
}

}  // namespace mulligan
