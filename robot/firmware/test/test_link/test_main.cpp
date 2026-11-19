// Control link messages: Drive parsing, the sequence filter, Telemetry, Info.
#include <string.h>
#include <unity.h>

#include "link.h"

using namespace mulligan;

void setUp() {}
void tearDown() {}

static void test_drive_parses_four_bytes() {
  const uint8_t raw[] = {42, static_cast<uint8_t>(-100), 100, 0x01};
  DriveMessage m;
  TEST_ASSERT_TRUE(parseDrive(raw, 4, m));
  TEST_ASSERT_EQUAL_UINT8(42, m.seq);
  TEST_ASSERT_EQUAL_INT8(-100, m.x);
  TEST_ASSERT_EQUAL_INT8(100, m.y);
  TEST_ASSERT_TRUE(m.thumb());
  TEST_ASSERT_FALSE(m.clearFault());
}

static void test_drive_clear_fault_flag() {
  const uint8_t raw[] = {1, 0, 0, 0x02};
  DriveMessage m;
  TEST_ASSERT_TRUE(parseDrive(raw, 4, m));
  TEST_ASSERT_FALSE(m.thumb());
  TEST_ASSERT_TRUE(m.clearFault());
}

static void test_drive_rejects_wrong_length_and_leaves_output_alone() {
  const uint8_t raw[] = {1, 10, 20, 1, 0};
  DriveMessage m;
  m.seq = 99;
  TEST_ASSERT_FALSE(parseDrive(raw, 3, m));
  TEST_ASSERT_FALSE(parseDrive(raw, 5, m));
  TEST_ASSERT_FALSE(parseDrive(raw, 0, m));
  TEST_ASSERT_FALSE(parseDrive(nullptr, 4, m));
  TEST_ASSERT_EQUAL_UINT8(99, m.seq);
}

static void test_drive_rejects_stick_out_of_range() {
  DriveMessage m;
  const uint8_t x101[] = {1, 101, 0, 1};
  const uint8_t xm101[] = {1, static_cast<uint8_t>(-101), 0, 1};
  const uint8_t y127[] = {1, 0, 127, 1};
  const uint8_t ym128[] = {1, 0, 0x80, 1};
  TEST_ASSERT_FALSE(parseDrive(x101, 4, m));
  TEST_ASSERT_FALSE(parseDrive(xm101, 4, m));
  TEST_ASSERT_FALSE(parseDrive(y127, 4, m));
  TEST_ASSERT_FALSE(parseDrive(ym128, 4, m));
}

static void test_sequence_first_message_is_always_new() {
  SequenceFilter f;
  TEST_ASSERT_TRUE(f.accept(200));
  f.reset();
  TEST_ASSERT_TRUE(f.accept(3));
}

static void test_sequence_ignores_duplicates_and_late_messages() {
  SequenceFilter f;
  TEST_ASSERT_TRUE(f.accept(10));
  TEST_ASSERT_FALSE(f.accept(10));
  TEST_ASSERT_TRUE(f.accept(11));
  TEST_ASSERT_FALSE(f.accept(9));
  TEST_ASSERT_TRUE(f.accept(15));  // a few lost on the way is fine
  TEST_ASSERT_FALSE(f.accept(14));
}

static void test_sequence_wraps_at_255() {
  SequenceFilter f;
  TEST_ASSERT_TRUE(f.accept(254));
  TEST_ASSERT_TRUE(f.accept(255));
  TEST_ASSERT_TRUE(f.accept(0));
  TEST_ASSERT_TRUE(f.accept(1));
  TEST_ASSERT_FALSE(f.accept(255));
}

static void test_sequence_window_is_half_the_range() {
  SequenceFilter f;
  TEST_ASSERT_TRUE(f.accept(0));
  TEST_ASSERT_FALSE(f.accept(128));  // as far behind as ahead: treat as old
  TEST_ASSERT_TRUE(f.accept(127));
}

static void test_telemetry_layout() {
  Telemetry t;
  t.state = RobotState::AtLimit;
  t.batteryPercent = 87;
  t.faults = fault::kStall | fault::kLowVoltage;
  t.distanceDm = 0x0123;
  t.limits = limit::kSpeed;
  t.lastSeq = 250;
  uint8_t out[kTelemetryLength];
  encodeTelemetry(t, out);
  const uint8_t expected[] = {2, 87, 255, 0x09, 0x23, 0x01, 0x08, 250};
  TEST_ASSERT_EQUAL_UINT8_ARRAY(expected, out, 8);
}

static void test_telemetry_defaults_say_locked_and_unknown() {
  uint8_t out[kTelemetryLength];
  encodeTelemetry(Telemetry{}, out);
  const uint8_t expected[] = {7, 0, 255, 0, 0xFF, 0xFF, 0, 0};
  TEST_ASSERT_EQUAL_UINT8_ARRAY(expected, out, 8);
}

static void test_serial_name_and_info() {
  const uint8_t mac[6] = {0x24, 0x6f, 0x28, 0x01, 0xa1, 0x0b};
  char serial[4];
  serialFromMac(mac, serial);
  TEST_ASSERT_EQUAL_MEMORY("A10B", serial, 4);

  char name[20];
  TEST_ASSERT_EQUAL(13u, advertisedName(serial, name, sizeof name));
  TEST_ASSERT_EQUAL_STRING("Mulligan-A10B", name);
  TEST_ASSERT_EQUAL(0u, advertisedName(serial, name, 13));

  char info[40];
  TEST_ASSERT_TRUE(infoText(serial, "0.1.0", "R0", info, sizeof info) > 0);
  TEST_ASSERT_EQUAL_STRING("Mulligan-A10B;0.1.0;R0", info);
}

static void test_uuids_share_the_base() {
  TEST_ASSERT_EQUAL_STRING("618deb21-0248-48ee-8de9-e8d739eba464", uuid::kService);
  TEST_ASSERT_EQUAL_STRING("618deb25-0248-48ee-8de9-e8d739eba464", uuid::kUnlock);
  TEST_ASSERT_EQUAL(0, strcmp(uuid::kDrive + 8, uuid::kService + 8));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_drive_parses_four_bytes);
  RUN_TEST(test_drive_clear_fault_flag);
  RUN_TEST(test_drive_rejects_wrong_length_and_leaves_output_alone);
  RUN_TEST(test_drive_rejects_stick_out_of_range);
  RUN_TEST(test_sequence_first_message_is_always_new);
  RUN_TEST(test_sequence_ignores_duplicates_and_late_messages);
  RUN_TEST(test_sequence_wraps_at_255);
  RUN_TEST(test_sequence_window_is_half_the_range);
  RUN_TEST(test_telemetry_layout);
  RUN_TEST(test_telemetry_defaults_say_locked_and_unknown);
  RUN_TEST(test_serial_name_and_info);
  RUN_TEST(test_uuids_share_the_base);
  return UNITY_END();
}
