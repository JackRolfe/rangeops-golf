// Hire keys: 78 bytes, signed with Ed25519 by the booking service. See
// robot/README.md, "Hire key", and robot/tools/hire-key.mjs, which writes the
// test vectors these are checked against.
#pragma once
#include <stddef.h>
#include <stdint.h>

#include "clock.h"
#include "link.h"

namespace mulligan {

constexpr size_t kHireKeyLength = 78;
constexpr size_t kHireKeyBodyLength = 14;
constexpr uint8_t kHireKeyVersion = 1;

// In the order the checks run, which is the order in hire-key.mjs.
enum class KeyCheck : uint8_t {
  Ok,
  BadLength,
  BadVersion,
  BadSignature,
  WrongSerial,
  NotYet,
  Expired,
  NoClock,  // the robot does not know the time
};

// "ok", "bad_length", ...: the names the vectors use.
const char* keyCheckName(KeyCheck c);

struct HireKey {
  uint8_t version = 0;
  char serial[kSerialLength] = {};
  uint32_t start = 0;  // Unix seconds
  uint32_t end = 0;    // Unix seconds; valid while start <= now < end
  uint8_t bay = 0;
};

// Reads the fields without checking anything. False unless 78 bytes.
bool decodeHireKey(const uint8_t* data, size_t length, HireKey& out);

// Length, version, signature and serial: everything but the time.
KeyCheck checkHireKeyIdentity(const uint8_t* data, size_t length, const uint8_t publicKey[32],
                              const char serial[kSerialLength], HireKey* fields = nullptr);

// Everything, at a known time.
KeyCheck checkHireKey(const uint8_t* data, size_t length, const uint8_t publicKey[32], const char serial[kSerialLength],
                      uint32_t nowUnix);

// Whether this connection may drive. Locked until a valid key is written,
// and again on disconnect or when the hire ends.
class HireLock {
 public:
  HireLock(const uint8_t publicKey[32], const char serial[kSerialLength], Clock& clock);

  // An Unlock write. Locks on any failure.
  KeyCheck unlock(const uint8_t* data, size_t length, uint32_t monotonicMs);
  void lock() { unlocked_ = false; }
  // Locks, and returns false, once the hire has ended.
  bool unlocked(uint32_t monotonicMs);
  const HireKey& key() const { return key_; }

 private:
  const uint8_t* publicKey_;
  char serial_[kSerialLength];
  Clock& clock_;
  bool unlocked_ = false;
  HireKey key_;
};

}  // namespace mulligan
