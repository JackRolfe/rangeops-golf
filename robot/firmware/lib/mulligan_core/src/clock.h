// Where the robot gets the time a hire key is checked against. Open: see
// docs/adr/0002. Time is passed in, never read here: `monotonicMs` is the
// board's millisecond counter (millis() on the ESP32).
#pragma once
#include <stdint.h>

namespace mulligan {

class Clock {
 public:
  virtual ~Clock() = default;
  // The time in Unix seconds, or false while the robot does not know it.
  virtual bool now(uint32_t monotonicMs, uint32_t& unixSeconds) const = 0;
  // A key whose signature and serial check out offers its start time. A real
  // clock ignores this.
  virtual void offerAnchor(uint32_t unixSeconds, uint32_t monotonicMs) = 0;
};

// R0's clock: unknown until the first good key, then that key's start time
// plus the time since it arrived. Enforces a hire's length, not its date, and
// forgets everything on restart. Uptime past 49 days wraps the counter.
class AnchoredClock : public Clock {
 public:
  bool now(uint32_t monotonicMs, uint32_t& unixSeconds) const override;
  void offerAnchor(uint32_t unixSeconds, uint32_t monotonicMs) override;
  bool anchored() const { return anchored_; }

 private:
  bool anchored_ = false;
  uint32_t anchorUnix_ = 0;
  uint32_t anchorMs_ = 0;
};

}  // namespace mulligan
