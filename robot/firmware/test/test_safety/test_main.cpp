// The safety core, rule by rule, and the stopping distances in DESIGN.md.
#include <math.h>
#include <unity.h>

#include "battery.h"
#include "motion.h"
#include "safety.h"

using namespace mulligan;

namespace {

// A robot on the bench whose wheels do exactly what they are told.
struct Bench {
  NoLaneLimit noLimit;
  SafetyCore core;
  SafetyInputs in;
  SafetyOutputs out;
  uint8_t seq = 0;
  float travelledM = 0;

  explicit Bench(LaneLimit* lane = nullptr) : core(lane ? *lane : noLimit) {
    in.unlocked = true;
    in.imuOk = true;
    in.batteryOk = true;
    in.batteryVolts = 19.0f;
  }

  // Queue a Drive message for the next tick.
  void send(int8_t x, int8_t y, bool thumb, bool clearFault = false) {
    in.driveReceived = true;
    in.drive.seq = ++seq;
    in.drive.x = x;
    in.drive.y = y;
    in.drive.flags = (thumb ? kDriveFlagThumb : 0) | (clearFault ? kDriveFlagClearFault : 0);
  }

  void tick() {
    out = core.tick(in);
    in.driveReceived = false;
    in.nowMs += 10;
    // Ideal wheels: they turn at the target, with the duty that takes.
    in.leftMps = out.leftMps;
    in.rightMps = out.rightMps;
    in.leftDuty = out.leftMps / geometry::kFreeSpeedMps;
    in.rightDuty = out.rightMps / geometry::kFreeSpeedMps;
    travelledM += (out.leftMps + out.rightMps) / 2 * 0.01f;
  }

  // Hold the stick at 20 Hz, as the app does, for `ms`.
  void hold(int8_t x, int8_t y, uint32_t ms) {
    for (uint32_t t = 0; t < ms; t += 10) {
      if (t % 50 == 0) send(x, y, true);
      tick();
    }
  }

  void idle(uint32_t ms) {
    for (uint32_t t = 0; t < ms; t += 10) tick();
  }

  RobotState state() const { return out.telemetry.state; }
};

struct HalveAndFlagFarEnd : LaneLimit {
  uint8_t apply(const Pose&, float& forward, float&) override {
    forward /= 2;
    return limit::kFarEnd;
  }
};

}  // namespace

void setUp() {}
void tearDown() {}

static void test_locked_ignores_drive_and_keeps_motor_power_off() {
  Bench b;
  b.in.unlocked = false;
  b.hold(0, 100, 500);
  TEST_ASSERT_EQUAL(RobotState::Locked, b.state());
  TEST_ASSERT_EQUAL_FLOAT(0, b.out.leftMps);
  TEST_ASSERT_FALSE(b.out.relayOn);
  TEST_ASSERT_EQUAL_UINT8(0, b.out.telemetry.lastSeq);
}

static void test_unlocked_and_untouched_is_idle_with_power_on() {
  Bench b;
  b.idle(100);
  TEST_ASSERT_EQUAL(RobotState::Idle, b.state());
  TEST_ASSERT_TRUE(b.out.relayOn);
  TEST_ASSERT_EQUAL_FLOAT(0, b.out.leftMps);
}

static void test_full_forward_ramps_at_one_metre_per_second_squared_to_the_cap() {
  Bench b;
  b.hold(0, 100, 500);
  TEST_ASSERT_EQUAL(RobotState::Driving, b.state());
  TEST_ASSERT_FLOAT_WITHIN(0.02f, 0.5f, b.out.leftMps);
  b.hold(0, 100, 1500);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 1.11f, b.out.leftMps);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 1.11f, b.out.rightMps);
  TEST_ASSERT_EQUAL_UINT8(0, b.out.telemetry.limits);
  TEST_ASSERT_EQUAL_UINT8(b.seq, b.out.telemetry.lastSeq);
}

static void test_full_right_pivots_at_85_degrees_a_second() {
  Bench b;
  b.hold(100, 0, 1000);
  const float side = 85.0f * 3.14159265f / 180.0f * 0.185f;
  TEST_ASSERT_FLOAT_WITHIN(0.001f, side, b.out.leftMps);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, -side, b.out.rightMps);
}

static void test_backwards_is_negative() {
  Bench b;
  b.hold(0, -50, 2000);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, -0.555f, b.out.leftMps);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, -0.555f, b.out.rightMps);
}

static void test_speed_cap_scales_both_sides_and_says_so() {
  Bench b;
  b.hold(100, 100, 2500);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 1.11f, b.out.leftMps);
  TEST_ASSERT_TRUE(b.out.rightMps < b.out.leftMps);
  TEST_ASSERT_TRUE(b.out.rightMps > 0);
  TEST_ASSERT_EQUAL_UINT8(limit::kSpeed, b.out.telemetry.limits);
  TEST_ASSERT_EQUAL(RobotState::AtLimit, b.state());
}

static void test_release_stops_in_about_25_cm() {
  Bench b;
  b.hold(0, 100, 2000);
  b.travelledM = 0;
  b.send(0, 0, false);
  b.idle(1000);
  TEST_ASSERT_FLOAT_WITHIN(0.02f, 0.25f, b.travelledM);
  TEST_ASSERT_EQUAL_FLOAT(0, b.out.leftMps);
  TEST_ASSERT_EQUAL(RobotState::Idle, b.state());
}

static void test_lost_link_stops_in_about_58_cm_and_says_so() {
  Bench b;
  b.hold(0, 100, 2000);
  b.travelledM = 0;
  // The last message arrived 40 ms ago (they come every 50 ms); then nothing.
  b.idle(260);
  TEST_ASSERT_EQUAL(RobotState::Driving, b.state());
  b.idle(1000);
  TEST_ASSERT_EQUAL(RobotState::LinkLost, b.state());
  TEST_ASSERT_EQUAL_FLOAT(0, b.out.leftMps);
  // DESIGN.md's 0.58 m counts from the last message, which came 40 ms (4.4 cm)
  // before travelledM was zeroed.
  TEST_ASSERT_FLOAT_WITHIN(0.02f, 0.58f, b.travelledM + 0.04f * 1.11f);
  TEST_ASSERT_TRUE(b.out.relayOn);
  // Messages resume: it drives again.
  b.hold(0, 100, 200);
  TEST_ASSERT_EQUAL(RobotState::Driving, b.state());
  TEST_ASSERT_TRUE(b.out.leftMps > 0);
}

static void test_late_and_repeated_messages_do_not_keep_the_link_alive() {
  Bench b;
  b.hold(0, 100, 500);
  const uint8_t last = b.seq;
  for (int i = 0; i < 100; i++) {
    b.in.driveReceived = true;
    b.in.drive.seq = (i % 2) ? last : static_cast<uint8_t>(last - 3);
    b.in.drive.flags = kDriveFlagThumb;
    b.tick();
  }
  TEST_ASSERT_EQUAL(RobotState::LinkLost, b.state());
  TEST_ASSERT_EQUAL_UINT8(last, b.out.telemetry.lastSeq);
}

static void test_stop_switch_stops_at_once_and_wins_over_everything() {
  Bench b;
  b.hold(0, 100, 2000);
  b.in.stopSwitchPressed = true;
  b.hold(0, 100, 10);
  TEST_ASSERT_EQUAL(RobotState::StoppedBySwitch, b.state());
  TEST_ASSERT_EQUAL_FLOAT(0, b.out.leftMps);
  TEST_ASSERT_FALSE(b.out.relayOn);
  // Still the switch, even locked and tilted.
  b.in.unlocked = false;
  b.in.tiltDeg = 90;
  b.idle(500);
  TEST_ASSERT_EQUAL(RobotState::StoppedBySwitch, b.state());
}

static void test_after_the_stop_switch_the_stick_must_be_released() {
  Bench b;
  b.in.stopSwitchPressed = true;
  b.hold(0, 100, 200);
  b.in.stopSwitchPressed = false;
  b.hold(0, 100, 500);  // still held from before: must not move
  TEST_ASSERT_EQUAL_FLOAT(0, b.out.leftMps);
  TEST_ASSERT_TRUE(b.out.relayOn);
  b.send(0, 0, false);
  b.tick();
  b.hold(0, 100, 500);
  TEST_ASSERT_TRUE(b.out.leftMps > 0.4f);
}

static void test_tilt_beyond_35_degrees_is_a_latched_fault() {
  Bench b;
  b.hold(0, 100, 1000);
  b.in.tiltDeg = 36;
  b.hold(0, 100, 50);
  TEST_ASSERT_EQUAL(RobotState::Driving, b.state());  // a bump, not yet a tilt
  b.hold(0, 100, 60);
  TEST_ASSERT_EQUAL(RobotState::Fault, b.state());
  TEST_ASSERT_EQUAL_UINT8(fault::kTilt, b.out.telemetry.faults);
  TEST_ASSERT_EQUAL_FLOAT(0, b.out.leftMps);
  TEST_ASSERT_FALSE(b.out.relayOn);
  // Upright again: still latched.
  b.in.tiltDeg = 2;
  b.hold(0, 100, 500);
  TEST_ASSERT_EQUAL(RobotState::Fault, b.state());
}

static void test_a_fault_clears_only_with_the_flag_and_only_once_upright() {
  Bench b;
  b.in.tiltDeg = 60;
  b.idle(200);
  TEST_ASSERT_EQUAL(RobotState::Fault, b.state());
  b.send(0, 0, false, true);  // clear while still on its side: refused
  b.tick();
  TEST_ASSERT_EQUAL(RobotState::Fault, b.state());
  b.in.tiltDeg = 0;
  b.send(0, 0, true, true);  // clear with a thumb on the stick: refused
  b.tick();
  TEST_ASSERT_EQUAL(RobotState::Fault, b.state());
  b.send(0, 0, false);  // a plain release: not a clear
  b.tick();
  TEST_ASSERT_EQUAL(RobotState::Fault, b.state());
  b.send(0, 0, false, true);
  b.tick();
  TEST_ASSERT_EQUAL(RobotState::Idle, b.state());
  TEST_ASSERT_EQUAL_UINT8(0, b.out.telemetry.faults);
  b.hold(0, 100, 500);
  TEST_ASSERT_TRUE(b.out.leftMps > 0.4f);
}

static void test_a_wheel_commanded_but_not_turning_for_half_a_second_is_a_stall() {
  Bench b;
  b.hold(0, 100, 1000);
  for (int i = 0; i < 49; i++) {
    if (i % 5 == 0) b.send(0, 100, true);
    b.out = b.core.tick(b.in);  // wheels jammed: duty stays, speed is zero
    b.in.driveReceived = false;
    b.in.nowMs += 10;
    b.in.leftMps = 0;
    b.in.leftDuty = 0.6f;
  }
  TEST_ASSERT_EQUAL(RobotState::Driving, b.state());
  b.out = b.core.tick(b.in);
  b.in.nowMs += 10;
  b.out = b.core.tick(b.in);
  TEST_ASSERT_EQUAL(RobotState::Fault, b.state());
  TEST_ASSERT_EQUAL_UINT8(fault::kStall, b.out.telemetry.faults);
  TEST_ASSERT_FALSE(b.out.relayOn);
}

static void test_gentle_driving_from_rest_is_not_a_stall() {
  Bench b;
  for (int i = 0; i < 100; i++) {
    if (i % 5 == 0) b.send(0, 10, true);
    b.out = b.core.tick(b.in);
    b.in.driveReceived = false;
    b.in.nowMs += 10;
    b.in.leftMps = b.in.rightMps = 0;  // wheels not turning yet
    b.in.leftDuty = b.in.rightDuty = 0.1f;
  }
  TEST_ASSERT_EQUAL(RobotState::Driving, b.state());
}

static void test_a_silent_sensor_is_a_fault() {
  Bench b;
  b.in.imuOk = false;
  b.idle(150);
  TEST_ASSERT_EQUAL(RobotState::Idle, b.state());
  b.idle(60);
  TEST_ASSERT_EQUAL(RobotState::Fault, b.state());
  TEST_ASSERT_EQUAL_UINT8(fault::kSensor, b.out.telemetry.faults);

  Bench c;
  c.in.batteryOk = false;
  c.idle(300);
  TEST_ASSERT_EQUAL(RobotState::Fault, c.state());
  TEST_ASSERT_EQUAL_UINT8(fault::kSensor, c.out.telemetry.faults);
}

static void test_a_fault_wins_over_a_lost_link() {
  Bench b;
  b.hold(0, 100, 1000);
  b.in.tiltDeg = 50;
  b.idle(1000);  // messages stop too
  TEST_ASSERT_EQUAL(RobotState::Fault, b.state());
}

static void test_low_battery_stops_driving_after_two_seconds() {
  Bench b;
  b.hold(0, 100, 2000);
  b.in.batteryVolts = 16.0f;
  b.hold(0, 100, 1000);  // the filter is still catching up
  TEST_ASSERT_EQUAL(RobotState::Driving, b.state());
  b.hold(0, 100, 3000);
  TEST_ASSERT_EQUAL(RobotState::LowBattery, b.state());
  TEST_ASSERT_EQUAL_UINT8(fault::kLowVoltage, b.out.telemetry.faults);
  TEST_ASSERT_FALSE(b.out.powerDown);
  b.hold(0, 100, 1000);  // it brakes on the ramp, not dead
  TEST_ASSERT_EQUAL_FLOAT(0, b.out.leftMps);
  // Latched: the voltage recovering with the motors off does not undo it.
  b.in.batteryVolts = 17.0f;
  b.hold(0, 100, 5000);
  TEST_ASSERT_EQUAL(RobotState::LowBattery, b.state());
}

static void test_a_short_sag_is_not_low_battery() {
  Bench b;
  b.hold(0, 100, 1000);
  b.in.batteryVolts = 15.5f;
  b.hold(0, 100, 300);
  b.in.batteryVolts = 19.0f;
  b.hold(0, 100, 5000);
  TEST_ASSERT_EQUAL(RobotState::Driving, b.state());
}

static void test_flat_battery_cuts_power_and_asks_to_shut_down() {
  Bench b;
  b.in.batteryVolts = 14.5f;
  b.idle(500);
  b.in.batteryVolts = 14.5f;
  b.idle(6000);
  TEST_ASSERT_TRUE(b.out.powerDown);
  TEST_ASSERT_FALSE(b.out.relayOn);
  TEST_ASSERT_EQUAL(RobotState::LowBattery, b.state());
}

static void test_hire_ending_while_driving_brakes_then_locks() {
  Bench b;
  b.hold(0, 100, 2000);
  b.in.unlocked = false;
  b.travelledM = 0;
  b.hold(0, 100, 10);
  TEST_ASSERT_EQUAL(RobotState::Locked, b.state());
  TEST_ASSERT_TRUE(b.out.relayOn);  // power on to brake
  TEST_ASSERT_TRUE(b.out.leftMps > 1.0f);
  b.hold(0, 100, 1000);
  TEST_ASSERT_EQUAL_FLOAT(0, b.out.leftMps);
  TEST_ASSERT_FALSE(b.out.relayOn);
  TEST_ASSERT_FLOAT_WITHIN(0.02f, 0.25f, b.travelledM);
}

static void test_a_new_hire_starts_a_fresh_sequence() {
  Bench b;
  b.seq = 200;
  b.hold(0, 100, 500);
  b.in.unlocked = false;
  b.idle(1000);
  b.in.unlocked = true;
  b.seq = 0;  // a new app session starts counting again
  b.hold(0, 100, 500);
  TEST_ASSERT_EQUAL(RobotState::Driving, b.state());
  TEST_ASSERT_TRUE(b.out.leftMps > 0.4f);
}

static void test_the_lane_limit_is_applied_and_reported() {
  HalveAndFlagFarEnd lane;
  Bench b(&lane);
  b.hold(0, 100, 2000);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 0.555f, b.out.leftMps);
  TEST_ASSERT_EQUAL_UINT8(limit::kFarEnd, b.out.telemetry.limits);
  TEST_ASSERT_EQUAL(RobotState::AtLimit, b.state());
}

static void test_battery_percent() {
  TEST_ASSERT_EQUAL_UINT8(0, batteryPercent(14.0f));
  TEST_ASSERT_EQUAL_UINT8(0, batteryPercent(15.0f));
  TEST_ASSERT_EQUAL_UINT8(50, batteryPercent(18.5f));
  TEST_ASSERT_EQUAL_UINT8(100, batteryPercent(21.0f));
  TEST_ASSERT_EQUAL_UINT8(100, batteryPercent(22.0f));
  Bench b;
  b.idle(20);
  TEST_ASSERT_EQUAL_UINT8(batteryPercent(19.0f), b.out.telemetry.batteryPercent);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_locked_ignores_drive_and_keeps_motor_power_off);
  RUN_TEST(test_unlocked_and_untouched_is_idle_with_power_on);
  RUN_TEST(test_full_forward_ramps_at_one_metre_per_second_squared_to_the_cap);
  RUN_TEST(test_full_right_pivots_at_85_degrees_a_second);
  RUN_TEST(test_backwards_is_negative);
  RUN_TEST(test_speed_cap_scales_both_sides_and_says_so);
  RUN_TEST(test_release_stops_in_about_25_cm);
  RUN_TEST(test_lost_link_stops_in_about_58_cm_and_says_so);
  RUN_TEST(test_late_and_repeated_messages_do_not_keep_the_link_alive);
  RUN_TEST(test_stop_switch_stops_at_once_and_wins_over_everything);
  RUN_TEST(test_after_the_stop_switch_the_stick_must_be_released);
  RUN_TEST(test_tilt_beyond_35_degrees_is_a_latched_fault);
  RUN_TEST(test_a_fault_clears_only_with_the_flag_and_only_once_upright);
  RUN_TEST(test_a_wheel_commanded_but_not_turning_for_half_a_second_is_a_stall);
  RUN_TEST(test_gentle_driving_from_rest_is_not_a_stall);
  RUN_TEST(test_a_silent_sensor_is_a_fault);
  RUN_TEST(test_a_fault_wins_over_a_lost_link);
  RUN_TEST(test_low_battery_stops_driving_after_two_seconds);
  RUN_TEST(test_a_short_sag_is_not_low_battery);
  RUN_TEST(test_flat_battery_cuts_power_and_asks_to_shut_down);
  RUN_TEST(test_hire_ending_while_driving_brakes_then_locks);
  RUN_TEST(test_a_new_hire_starts_a_fresh_sequence);
  RUN_TEST(test_the_lane_limit_is_applied_and_reported);
  RUN_TEST(test_battery_percent);
  return UNITY_END();
}
