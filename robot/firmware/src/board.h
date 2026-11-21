// Mulligan's ESP32-S3-DevKitC-1: the pins in robot/DESIGN.md and the wiring
// in robot/BUILD.md. Things only the bench can confirm are marked BENCH.
#pragma once
#include <stdint.h>

namespace board {

constexpr const char* kFirmwareVersion = "0.1.0";
constexpr const char* kHardwareRevision = "R0";

// Cytron MDD10A: one PWM and one direction pin per side.
constexpr uint8_t kLeftPwm = 4, kLeftDir = 5;
constexpr uint8_t kRightPwm = 6, kRightDir = 7;
constexpr uint32_t kPwmHz = 20000;
constexpr uint8_t kPwmBits = 10;
constexpr uint8_t kLeftPwmChannel = 0, kRightPwmChannel = 1;

// Rear-wheel encoders, quadrature A and B.
constexpr uint8_t kLeftEncA = 15, kLeftEncB = 16;
constexpr uint8_t kRightEncA = 17, kRightEncB = 18;

// The right motors face the other way, so they turn backwards for the same
// command (BUILD.md: reverse them in firmware). The sign applies to both the
// motor output and its encoder. BENCH: check both with the wheels off the
// ground, and flip a sign here rather than rewiring.
constexpr int kLeftSign = +1;
constexpr int kRightSign = -1;

// I²C: BNO085 motion sensor and INA228 battery monitor (STEMMA QT).
constexpr uint8_t kSda = 8, kScl = 9;
constexpr uint8_t kBno085Address = 0x4A;
constexpr uint8_t kIna228Address = 0x40;

// Stop switch state, with the internal pull-up. Low means released; high
// means pressed or a broken wire, so a fault fails safe. BENCH: BUILD.md does
// not yet wire pin 2 (ticket 07).
constexpr uint8_t kStopSwitch = 2;

// Relay board on the motor supply, high-trigger jumper: high closes it.
constexpr uint8_t kRelay = 42;

constexpr uint8_t kStatusLight = 38;
constexpr uint8_t kBeeper = 39;  // not used on R0

constexpr uint32_t kControlPeriodMs = 10;     // 100 Hz
constexpr uint32_t kTelemetryPeriodMs = 200;  // 5 Hz
constexpr uint32_t kBatteryPeriodMs = 100;
constexpr uint32_t kImuStaleMs = 100;
constexpr uint32_t kBatteryStaleMs = 300;
constexpr uint32_t kPowerDownDelayMs = 3000;  // time for telemetry to say why
constexpr uint16_t kMtu = 185;

// Connection parameters asked for after connecting, inside Apple's accessory
// guidelines (docs/research/ble-iphone-to-robot.md, section 4): interval 15 to
// 30 ms, no peripheral latency so no Drive message waits, supervision timeout
// 6 s. The 300 ms Drive timeout, not this, is what stops the robot.
constexpr uint16_t kConnIntervalMin = 12;  // x 1.25 ms = 15 ms
constexpr uint16_t kConnIntervalMax = 24;  // x 1.25 ms = 30 ms
constexpr uint16_t kConnLatency = 0;
constexpr uint16_t kSupervisionTimeout = 600;  // x 10 ms = 6 s

}  // namespace board
