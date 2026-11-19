// The control link: the messages the app and the robot exchange over
// Bluetooth LE. See robot/README.md, "Control link (draft)".
#pragma once
#include <stddef.h>
#include <stdint.h>

namespace mulligan {

namespace uuid {
constexpr const char* kService = "618deb21-0248-48ee-8de9-e8d739eba464";
constexpr const char* kDrive = "618deb22-0248-48ee-8de9-e8d739eba464";
constexpr const char* kTelemetry = "618deb23-0248-48ee-8de9-e8d739eba464";
constexpr const char* kInfo = "618deb24-0248-48ee-8de9-e8d739eba464";
constexpr const char* kUnlock = "618deb25-0248-48ee-8de9-e8d739eba464";
}  // namespace uuid

constexpr size_t kSerialLength = 4;
constexpr size_t kDriveLength = 4;
constexpr size_t kTelemetryLength = 8;
constexpr int kStickMax = 100;

// Drive flags. Bit 1 is a proposed addition (docs/adr/0003).
constexpr uint8_t kDriveFlagThumb = 0x01;
constexpr uint8_t kDriveFlagClearFault = 0x02;

struct DriveMessage {
  uint8_t seq = 0;
  int8_t x = 0;  // -100..100, right is positive
  int8_t y = 0;  // -100..100, forward is positive
  uint8_t flags = 0;

  bool thumb() const { return flags & kDriveFlagThumb; }
  bool clearFault() const { return flags & kDriveFlagClearFault; }
};

// Reads a Drive write. False, leaving `out` alone, unless it is exactly four
// bytes with both stick values inside -100..100.
bool parseDrive(const uint8_t* data, size_t length, DriveMessage& out);

// Lets through only Drive messages newer than the last one let through, so a
// late, repeated or out-of-order message is ignored. The first message after
// reset() is always new. Newer means ahead by 1 to 127, wrapping at 255.
class SequenceFilter {
 public:
  void reset() { has_last_ = false; }
  bool accept(uint8_t seq);

 private:
  bool has_last_ = false;
  uint8_t last_ = 0;
};

enum class RobotState : uint8_t {
  Idle = 0,
  Driving = 1,
  AtLimit = 2,
  LinkLost = 3,
  StoppedBySwitch = 4,
  Fault = 5,
  LowBattery = 6,
  Locked = 7,
};

namespace fault {
constexpr uint8_t kStall = 0x01;
constexpr uint8_t kTilt = 0x02;
constexpr uint8_t kSensor = 0x04;
constexpr uint8_t kLowVoltage = 0x08;
}  // namespace fault

namespace limit {
constexpr uint8_t kFarEnd = 0x01;
constexpr uint8_t kLeftEdge = 0x02;
constexpr uint8_t kRightEdge = 0x04;
constexpr uint8_t kSpeed = 0x08;
}  // namespace limit

constexpr uint8_t kBallsNotCounted = 255;
constexpr uint16_t kDistanceUnknown = 0xFFFF;

struct Telemetry {
  RobotState state = RobotState::Locked;
  uint8_t batteryPercent = 0;
  uint8_t ballsOnBoard = kBallsNotCounted;
  uint8_t faults = 0;
  uint16_t distanceDm = kDistanceUnknown;
  uint8_t limits = 0;
  uint8_t lastSeq = 0;
};

void encodeTelemetry(const Telemetry& t, uint8_t out[kTelemetryLength]);

// The serial: the last two bytes of the Bluetooth MAC as four upper-case hex
// characters, e.g. ...:A1:B2 gives "A1B2". Writes four characters, no NUL.
void serialFromMac(const uint8_t mac[6], char out[kSerialLength]);

// "Mulligan-A1B2". Returns the length written, without the NUL, or 0 if `cap`
// is too small.
size_t advertisedName(const char serial[kSerialLength], char* out, size_t cap);

// The Info characteristic: "Mulligan-A1B2;0.1.0;R0".
size_t infoText(const char serial[kSerialLength], const char* firmwareVersion, const char* hardwareRevision, char* out,
                size_t cap);

}  // namespace mulligan
