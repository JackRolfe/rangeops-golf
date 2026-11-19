#include "link.h"

#include <stdio.h>

namespace mulligan {

bool parseDrive(const uint8_t* data, size_t length, DriveMessage& out) {
  if (data == nullptr || length != kDriveLength) return false;
  const int8_t x = static_cast<int8_t>(data[1]);
  const int8_t y = static_cast<int8_t>(data[2]);
  if (x < -kStickMax || x > kStickMax || y < -kStickMax || y > kStickMax) return false;
  out.seq = data[0];
  out.x = x;
  out.y = y;
  out.flags = data[3];
  return true;
}

bool SequenceFilter::accept(uint8_t seq) {
  if (has_last_ && static_cast<int8_t>(static_cast<uint8_t>(seq - last_)) <= 0) return false;
  has_last_ = true;
  last_ = seq;
  return true;
}

void encodeTelemetry(const Telemetry& t, uint8_t out[kTelemetryLength]) {
  out[0] = static_cast<uint8_t>(t.state);
  out[1] = t.batteryPercent;
  out[2] = t.ballsOnBoard;
  out[3] = t.faults;
  out[4] = static_cast<uint8_t>(t.distanceDm & 0xFF);
  out[5] = static_cast<uint8_t>(t.distanceDm >> 8);
  out[6] = t.limits;
  out[7] = t.lastSeq;
}

void serialFromMac(const uint8_t mac[6], char out[kSerialLength]) {
  static const char kHex[] = "0123456789ABCDEF";
  out[0] = kHex[mac[4] >> 4];
  out[1] = kHex[mac[4] & 0x0F];
  out[2] = kHex[mac[5] >> 4];
  out[3] = kHex[mac[5] & 0x0F];
}

size_t advertisedName(const char serial[kSerialLength], char* out, size_t cap) {
  const int n = snprintf(out, cap, "Mulligan-%.4s", serial);
  return (n < 0 || static_cast<size_t>(n) >= cap) ? 0 : static_cast<size_t>(n);
}

size_t infoText(const char serial[kSerialLength], const char* firmwareVersion, const char* hardwareRevision, char* out,
                size_t cap) {
  const int n = snprintf(out, cap, "Mulligan-%.4s;%s;%s", serial, firmwareVersion, hardwareRevision);
  return (n < 0 || static_cast<size_t>(n) >= cap) ? 0 : static_cast<size_t>(n);
}

}  // namespace mulligan
