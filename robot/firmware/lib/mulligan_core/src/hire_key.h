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

// In the order the checks run, which is the order in hire-key.mjs. The values
// go over the air: reading Unlock gives the last one (docs/adr/0005).
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

// Whether the connected phone may drive. Locked until it writes a valid key;
// locked again when it disconnects, so the next connection must write a key
// of its own, and when the hire ends.
class HireLock {
 public:
  HireLock(const uint8_t publicKey[32], const char serial[kSerialLength], Clock& clock);

  // A phone connected. Starts locked, with nothing written yet.
  void connected();
  // The phone went away: forget its key and its last result.
  void disconnected();
  // An Unlock write. Locks on any failure. Ignored with no phone connected.
  KeyCheck unlock(const uint8_t* data, size_t length, uint32_t monotonicMs);
  void lock() { unlocked_ = false; }
  // Locks, and returns false, once the hire has ended.
  bool unlocked(uint32_t monotonicMs);
  // What reading Unlock gives: the result of the last key written on this
  // connection, BadLength before any (docs/adr/0005).
  KeyCheck lastResult() const { return lastResult_; }
  const HireKey& key() const { return key_; }

 private:
  const uint8_t* publicKey_;
  char serial_[kSerialLength];
  Clock& clock_;
  bool connected_ = false;
  bool unlocked_ = false;
  KeyCheck lastResult_ = KeyCheck::BadLength;
  HireKey key_;
};

}  // namespace mulligan
