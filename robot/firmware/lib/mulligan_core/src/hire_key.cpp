#include "hire_key.h"

#include <string.h>

#include "monocypher-ed25519.h"

namespace mulligan {

namespace {
uint32_t readU32le(const uint8_t* p) {
  return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) | (static_cast<uint32_t>(p[2]) << 16) |
         (static_cast<uint32_t>(p[3]) << 24);
}

KeyCheck checkTime(const HireKey& k, uint32_t nowUnix) {
  if (nowUnix < k.start) return KeyCheck::NotYet;
  if (nowUnix >= k.end) return KeyCheck::Expired;
  return KeyCheck::Ok;
}
}  // namespace

const char* keyCheckName(KeyCheck c) {
  switch (c) {
    case KeyCheck::Ok: return "ok";
    case KeyCheck::BadLength: return "bad_length";
    case KeyCheck::BadVersion: return "bad_version";
    case KeyCheck::BadSignature: return "bad_signature";
    case KeyCheck::WrongSerial: return "wrong_serial";
    case KeyCheck::NotYet: return "not_yet";
    case KeyCheck::Expired: return "expired";
    case KeyCheck::NoClock: return "no_clock";
  }
  return "?";
}

bool decodeHireKey(const uint8_t* data, size_t length, HireKey& out) {
  if (data == nullptr || length != kHireKeyLength) return false;
  out.version = data[0];
  memcpy(out.serial, data + 1, kSerialLength);
  out.start = readU32le(data + 5);
  out.end = readU32le(data + 9);
  out.bay = data[13];
  return true;
}

KeyCheck checkHireKeyIdentity(const uint8_t* data, size_t length, const uint8_t publicKey[32],
                              const char serial[kSerialLength], HireKey* fields) {
  HireKey k;
  if (!decodeHireKey(data, length, k)) return KeyCheck::BadLength;
  if (k.version != kHireKeyVersion) return KeyCheck::BadVersion;
  if (crypto_ed25519_check(data + kHireKeyBodyLength, publicKey, data, kHireKeyBodyLength) != 0) {
    return KeyCheck::BadSignature;
  }
  if (memcmp(k.serial, serial, kSerialLength) != 0) return KeyCheck::WrongSerial;
  if (fields) *fields = k;
  return KeyCheck::Ok;
}

KeyCheck checkHireKey(const uint8_t* data, size_t length, const uint8_t publicKey[32], const char serial[kSerialLength],
                      uint32_t nowUnix) {
  HireKey k;
  const KeyCheck identity = checkHireKeyIdentity(data, length, publicKey, serial, &k);
  if (identity != KeyCheck::Ok) return identity;
  return checkTime(k, nowUnix);
}

HireLock::HireLock(const uint8_t publicKey[32], const char serial[kSerialLength], Clock& clock)
    : publicKey_(publicKey), clock_(clock) {
  memcpy(serial_, serial, kSerialLength);
}

KeyCheck HireLock::unlock(const uint8_t* data, size_t length, uint32_t monotonicMs) {
  unlocked_ = false;
  HireKey k;
  KeyCheck result = checkHireKeyIdentity(data, length, publicKey_, serial_, &k);
  if (result != KeyCheck::Ok) return result;
  clock_.offerAnchor(k.start, monotonicMs);
  uint32_t now = 0;
  if (!clock_.now(monotonicMs, now)) return KeyCheck::NoClock;
  result = checkTime(k, now);
  if (result != KeyCheck::Ok) return result;
  key_ = k;
  unlocked_ = true;
  return KeyCheck::Ok;
}

bool HireLock::unlocked(uint32_t monotonicMs) {
  if (!unlocked_) return false;
  uint32_t now = 0;
  if (!clock_.now(monotonicMs, now) || checkTime(key_, now) != KeyCheck::Ok) unlocked_ = false;
  return unlocked_;
}

}  // namespace mulligan
