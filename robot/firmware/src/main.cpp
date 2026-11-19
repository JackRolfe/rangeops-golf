// Mulligan R0 firmware: the board layer. It reads the pins, sensors and
// Bluetooth, hands everything to the safety core in lib/mulligan_core, and
// writes what the core decides to the motors, the relay and telemetry. It
// makes no decisions of its own (docs/adr/0001).
#include <Adafruit_BNO08x.h>
#include <Adafruit_INA228.h>
#include <Arduino.h>
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <Wire.h>
#include <esp_mac.h>
#include <esp_sleep.h>
#include <math.h>
#include <soc/gpio_reg.h>
#include <string.h>

#include "board.h"
#include "hire_key.h"
#include "hire_public_key.h"
#include "link.h"
#include "motion.h"
#include "safety.h"

#ifdef MULLIGAN_BENCH_KEY
#warning "Built with the hire-key TEST key: anyone can sign keys for this robot. Run robot/tools/hire-key.mjs keygen first if other phones can reach it (docs/adr/0004)."
#endif

using namespace mulligan;

namespace {

// ------------------------------------------------------------------ encoders

struct Encoder {
  uint8_t pinA, pinB;
  volatile int32_t count;
  volatile uint8_t state;
  volatile uint32_t missed;
};

Encoder leftEncoder = {board::kLeftEncA, board::kLeftEncB, 0, 0, 0};
Encoder rightEncoder = {board::kRightEncA, board::kRightEncB, 0, 0, 0};

// The quadrature table again, in RAM so the interrupt never waits on flash.
DRAM_ATTR const int8_t kStep[16] = {0, -1, +1, 0, +1, 0, 0, -1, -1, 0, 0, +1, 0, +1, -1, 0};

inline uint8_t IRAM_ATTR readAB(const Encoder& e) {
  const uint32_t in = REG_READ(GPIO_IN_REG);  // pins 0 to 31
  return static_cast<uint8_t>((((in >> e.pinA) & 1) << 1) | ((in >> e.pinB) & 1));
}

void IRAM_ATTR onEncoderEdge(void* arg) {
  Encoder& e = *static_cast<Encoder*>(arg);
  const uint8_t now = readAB(e);
  const uint8_t index = static_cast<uint8_t>((e.state << 2) | now);
  e.count += kStep[index];
  if (((e.state ^ now) & 3) == 3) e.missed++;
  e.state = now;
}

void beginEncoder(Encoder& e) {
  pinMode(e.pinA, INPUT);
  pinMode(e.pinB, INPUT);
  e.state = readAB(e);
  attachInterruptArg(e.pinA, onEncoderEdge, &e, CHANGE);
  attachInterruptArg(e.pinB, onEncoderEdge, &e, CHANGE);
}

int32_t readCount(const Encoder& e) {
  noInterrupts();
  const int32_t c = e.count;
  interrupts();
  return c;
}

// ------------------------------------------------------------------ motors and relay

void writeSide(uint8_t channel, uint8_t dirPin, float duty) {
  constexpr uint32_t kMax = (1u << board::kPwmBits) - 1;
  if (duty > 1) duty = 1;
  if (duty < -1) duty = -1;
  digitalWrite(dirPin, duty >= 0 ? HIGH : LOW);
  ledcWrite(channel, static_cast<uint32_t>(fabsf(duty) * kMax + 0.5f));
}

void motorsOff() {
  ledcWrite(board::kLeftPwmChannel, 0);
  ledcWrite(board::kRightPwmChannel, 0);
}

// ------------------------------------------------------------------ Bluetooth
//
// Callbacks run on the Bluetooth task. They only copy bytes into `pending`
// under a lock; the control loop does everything else, so the hire lock and
// the safety core are only ever touched from one task.

portMUX_TYPE pendingLock = portMUX_INITIALIZER_UNLOCKED;
struct {
  bool connected = false;
  bool disconnected = false;
  bool drive = false;
  uint8_t driveBytes[kDriveLength] = {};
  bool unlock = false;
  uint8_t unlockBytes[kHireKeyLength + 1] = {};
  size_t unlockLength = 0;
} pending;

BLECharacteristic* telemetryChar = nullptr;
BLECharacteristic* unlockChar = nullptr;

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    portENTER_CRITICAL(&pendingLock);
    pending.connected = true;
    portEXIT_CRITICAL(&pendingLock);
  }
  // The library calls both onConnect overloads; this one has the address
  // needed to ask the phone for a shorter connection interval. The phone may
  // refuse or offer something else; nothing depends on getting it.
  void onConnect(BLEServer* server, esp_ble_gatts_cb_param_t* param) override {
    server->updateConnParams(param->connect.remote_bda, board::kConnIntervalMin, board::kConnIntervalMax,
                             board::kConnLatency, board::kSupervisionTimeout);
  }
  void onDisconnect(BLEServer*) override {
    portENTER_CRITICAL(&pendingLock);
    pending.connected = false;
    pending.disconnected = true;
    pending.drive = false;
    pending.unlock = false;
    portEXIT_CRITICAL(&pendingLock);
  }
};

class DriveCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    const size_t n = c->getLength();
    if (n != kDriveLength) return;  // parseDrive would refuse it anyway
    portENTER_CRITICAL(&pendingLock);
    memcpy(pending.driveBytes, c->getData(), kDriveLength);
    pending.drive = true;
    portEXIT_CRITICAL(&pendingLock);
  }
};

class UnlockCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    // Keep one byte more than a key, so a too-long write is still seen as
    // too long rather than cut to fit.
    const size_t n = c->getLength();
    portENTER_CRITICAL(&pendingLock);
    pending.unlockLength = n > sizeof pending.unlockBytes ? sizeof pending.unlockBytes : n;
    memcpy(pending.unlockBytes, c->getData(), pending.unlockLength);
    pending.unlock = true;
    portEXIT_CRITICAL(&pendingLock);
  }
};

ServerCallbacks serverCallbacks;
DriveCallbacks driveCallbacks;
UnlockCallbacks unlockCallbacks;

// ------------------------------------------------------------------ sensors

Adafruit_BNO08x imu;
Adafruit_INA228 batteryMonitor;
bool imuStarted = false, batteryStarted = false;

struct {
  uint32_t gravityMs = 0, headingMs = 0;
  bool haveGravity = false, haveHeading = false;
  float tiltDeg = 0;
  float headingRad = 0;  // anticlockwise from above
} motion;

struct {
  uint32_t readMs = 0;
  bool have = false;
  float volts = 0;
} battery;

void enableImuReports() {
  imu.enableReport(SH2_GRAVITY, 10000);
  imu.enableReport(SH2_GAME_ROTATION_VECTOR, 10000);
}

void pollImu(uint32_t nowMs) {
  if (!imuStarted) return;
  if (imu.wasReset()) enableImuReports();
  sh2_SensorValue_t v;
  while (imu.getSensorEvent(&v)) {
    if (v.sensorId == SH2_GRAVITY) {
      float deg;
      if (tiltDegrees(v.un.gravity.x, v.un.gravity.y, v.un.gravity.z, deg)) {
        motion.tiltDeg = deg;
        motion.gravityMs = nowMs;
        motion.haveGravity = true;
      }
    } else if (v.sensorId == SH2_GAME_ROTATION_VECTOR) {
      const auto& q = v.un.gameRotationVector;
      motion.headingRad = atan2f(2 * (q.real * q.k + q.i * q.j), 1 - 2 * (q.j * q.j + q.k * q.k));
      motion.headingMs = nowMs;
      motion.haveHeading = true;
    }
  }
}

void pollBattery(uint32_t nowMs) {
  static uint32_t lastMs = 0;
  if (!batteryStarted || nowMs - lastMs < board::kBatteryPeriodMs) return;
  lastMs = nowMs;
  const float v = batteryMonitor.getBusVoltage_V();
  if (v > 5.0f && v < 30.0f) {  // a missing or confused monitor reads nonsense
    battery.volts = v;
    battery.readMs = nowMs;
    battery.have = true;
  }
}

// Pressed acts at once; released only after three steady readings.
bool readStopSwitch() {
  static uint8_t lowCount = 0;
  if (digitalRead(board::kStopSwitch) == HIGH) {
    lowCount = 0;
    return true;
  }
  if (lowCount < 3) lowCount++;
  return lowCount < 3;
}

// ------------------------------------------------------------------ state

char serial[kSerialLength];
AnchoredClock robotClock;
HireLock* hireLock = nullptr;
NoLaneLimit noLaneLimit;
SafetyCore core(noLaneLimit);
SpeedController leftController, rightController;
WheelSpeed leftSpeed, rightSpeed;
Odometry odometry;
SafetyOutputs last;
float leftDuty = 0, rightDuty = 0;
int32_t leftCountsBefore = 0, rightCountsBefore = 0;
bool connected = false;
uint32_t nextTickMs = 0, nextTelemetryMs = 0, powerDownAtMs = 0;

void setStatusLight(uint32_t nowMs, RobotState state) {
  bool on;
  switch (state) {
    case RobotState::Locked: on = false; break;
    case RobotState::Driving:
    case RobotState::AtLimit: on = true; break;
    case RobotState::Fault:
    case RobotState::StoppedBySwitch:
    case RobotState::LowBattery: on = (nowMs / 125) % 2; break;  // fast blink
    default: on = (nowMs / 500) % 2; break;                     // slow blink
  }
  digitalWrite(board::kStatusLight, on ? HIGH : LOW);
}

void startBluetooth() {
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_BT);
  serialFromMac(mac, serial);
  char name[24], info[64];
  advertisedName(serial, name, sizeof name);
  infoText(serial, board::kFirmwareVersion, board::kHardwareRevision, info, sizeof info);

  BLEDevice::init(name);
  BLEDevice::setMTU(board::kMtu);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(&serverCallbacks);
  BLEService* service = server->createService(uuid::kService);

  BLECharacteristic* drive = service->createCharacteristic(uuid::kDrive, BLECharacteristic::PROPERTY_WRITE_NR);
  drive->setCallbacks(&driveCallbacks);

  telemetryChar = service->createCharacteristic(uuid::kTelemetry,
                                                BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ);
  telemetryChar->addDescriptor(new BLE2902());

  BLECharacteristic* infoChar = service->createCharacteristic(uuid::kInfo, BLECharacteristic::PROPERTY_READ);
  infoChar->setValue(info);

  // Readable too: one byte saying what the robot made of the last key
  // (docs/adr/0005), because this library answers a write before the
  // firmware sees it and so cannot refuse a bad key at the ATT layer.
  unlockChar = service->createCharacteristic(uuid::kUnlock,
                                             BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_READ);
  unlockChar->setCallbacks(&unlockCallbacks);
  uint8_t none = static_cast<uint8_t>(KeyCheck::BadLength);
  unlockChar->setValue(&none, 1);

  service->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(uuid::kService);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
}

// Everything that arrived over Bluetooth since the last tick.
void takeBluetooth(uint32_t nowMs, SafetyInputs& in) {
  bool disconnected, drive, unlock;
  uint8_t driveBytes[kDriveLength];
  uint8_t unlockBytes[kHireKeyLength + 1];
  size_t unlockLength;
  portENTER_CRITICAL(&pendingLock);
  connected = pending.connected;
  disconnected = pending.disconnected;
  drive = pending.drive;
  unlock = pending.unlock;
  memcpy(driveBytes, pending.driveBytes, sizeof driveBytes);
  unlockLength = pending.unlockLength;
  memcpy(unlockBytes, pending.unlockBytes, unlockLength);
  pending.disconnected = pending.drive = pending.unlock = false;
  portEXIT_CRITICAL(&pendingLock);

  if (disconnected) {
    hireLock->lock();
    BLEDevice::startAdvertising();  // one connection at a time: only now
  }
  if (unlock) {
    const KeyCheck result = hireLock->unlock(unlockBytes, unlockLength, nowMs);
    uint8_t code = static_cast<uint8_t>(result);
    unlockChar->setValue(&code, 1);
    log_i("unlock: %s", keyCheckName(result));
  }
  in.driveReceived = drive && parseDrive(driveBytes, sizeof driveBytes, in.drive);
}

void controlTick(uint32_t nowMs) {
  SafetyInputs in;
  in.nowMs = nowMs;
  takeBluetooth(nowMs, in);
  in.unlocked = connected && hireLock->unlocked(nowMs);
  in.stopSwitchPressed = readStopSwitch();

  // Wheels, in metres, forward positive on both sides.
  const int32_t leftCounts = readCount(leftEncoder) * board::kLeftSign;
  const int32_t rightCounts = readCount(rightEncoder) * board::kRightSign;
  in.leftMps = leftSpeed.update(leftCounts, nowMs);
  in.rightMps = rightSpeed.update(rightCounts, nowMs);
  in.leftDuty = leftDuty;
  in.rightDuty = rightDuty;

  pollImu(nowMs);
  pollBattery(nowMs);
  const bool headingOk = motion.haveHeading && nowMs - motion.headingMs < board::kImuStaleMs;
  in.imuOk = motion.haveGravity && nowMs - motion.gravityMs < board::kImuStaleMs;
  in.tiltDeg = motion.tiltDeg;
  in.batteryOk = battery.have && nowMs - battery.readMs < board::kBatteryStaleMs;
  in.batteryVolts = battery.volts;

  odometry.update((leftCounts - leftCountsBefore) * geometry::kMetresPerCount,
                  (rightCounts - rightCountsBefore) * geometry::kMetresPerCount, headingOk, motion.headingRad);
  leftCountsBefore = leftCounts;
  rightCountsBefore = rightCounts;
  in.pose.valid = true;
  in.pose.x = odometry.x();
  in.pose.y = odometry.y();
  in.pose.heading = odometry.heading();

  last = core.tick(in);

  // Relay first, so power is cut before anything else when it must be.
  digitalWrite(board::kRelay, last.relayOn ? HIGH : LOW);
  const float dtS = board::kControlPeriodMs / 1000.0f;
  if (last.relayOn) {
    leftDuty = leftController.update(last.leftMps, in.leftMps, dtS);
    rightDuty = rightController.update(last.rightMps, in.rightMps, dtS);
  } else {
    leftController.reset();
    rightController.reset();
    leftDuty = rightDuty = 0;
  }
  writeSide(board::kLeftPwmChannel, board::kLeftDir, leftDuty * board::kLeftSign);
  writeSide(board::kRightPwmChannel, board::kRightDir, rightDuty * board::kRightSign);

  setStatusLight(nowMs, last.telemetry.state);

  if (last.powerDown && powerDownAtMs == 0) powerDownAtMs = nowMs + board::kPowerDownDelayMs;
}

void sendTelemetry() {
  if (!connected || telemetryChar == nullptr) return;
  Telemetry t = last.telemetry;
  t.distanceDm = odometry.distanceDm();
  uint8_t bytes[kTelemetryLength];
  encodeTelemetry(t, bytes);
  telemetryChar->setValue(bytes, sizeof bytes);
  telemetryChar->notify();
}

[[noreturn]] void powerDown() {
  digitalWrite(board::kRelay, LOW);
  motorsOff();
  digitalWrite(board::kStatusLight, LOW);
  log_w("battery flat: shutting down");
  esp_deep_sleep_start();  // no wake source: stays off until power is cycled
}

}  // namespace

void setup() {
  // Motor power off before anything else.
  pinMode(board::kRelay, OUTPUT);
  digitalWrite(board::kRelay, LOW);
  pinMode(board::kLeftDir, OUTPUT);
  pinMode(board::kRightDir, OUTPUT);
  ledcSetup(board::kLeftPwmChannel, board::kPwmHz, board::kPwmBits);
  ledcSetup(board::kRightPwmChannel, board::kPwmHz, board::kPwmBits);
  ledcAttachPin(board::kLeftPwm, board::kLeftPwmChannel);
  ledcAttachPin(board::kRightPwm, board::kRightPwmChannel);
  motorsOff();

  pinMode(board::kStopSwitch, INPUT_PULLUP);
  pinMode(board::kStatusLight, OUTPUT);
  pinMode(board::kBeeper, OUTPUT);
  digitalWrite(board::kBeeper, LOW);

  Serial.begin(115200);
  beginEncoder(leftEncoder);
  beginEncoder(rightEncoder);

  Wire.begin(board::kSda, board::kScl, 400000);
  imuStarted = imu.begin_I2C(board::kBno085Address, &Wire);
  if (imuStarted) enableImuReports();
  batteryStarted = batteryMonitor.begin(board::kIna228Address, &Wire);
  if (!imuStarted) log_e("BNO085 not found: the robot will report a sensor fault");
  if (!batteryStarted) log_e("INA228 not found: the robot will report a sensor fault");

  startBluetooth();
  static HireLock lock(kHirePublicKey, serial, robotClock);
  hireLock = &lock;
#ifdef MULLIGAN_BENCH_KEY
  log_w("BENCH KEY: this robot trusts the public test key (docs/adr/0004)");
#endif
  log_i("Mulligan-%.4s ready", serial);

  nextTickMs = millis();
  nextTelemetryMs = nextTickMs;
}

void loop() {
  const uint32_t nowMs = millis();
  if (static_cast<int32_t>(nowMs - nextTickMs) >= 0) {
    nextTickMs += board::kControlPeriodMs;
    if (static_cast<int32_t>(nowMs - nextTickMs) > 50) nextTickMs = nowMs;  // fell behind: don't race to catch up
    controlTick(nowMs);
  }
  if (static_cast<int32_t>(nowMs - nextTelemetryMs) >= 0) {
    nextTelemetryMs += board::kTelemetryPeriodMs;
    sendTelemetry();
  }
  if (powerDownAtMs != 0 && static_cast<int32_t>(nowMs - powerDownAtMs) >= 0) powerDown();
  delay(1);
}
