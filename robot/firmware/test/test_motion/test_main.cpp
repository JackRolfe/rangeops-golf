// Encoders, wheel speed, the speed controller, odometry and tilt.
#include <math.h>
#include <unity.h>

#include "motion.h"

using namespace mulligan;

void setUp() {}
void tearDown() {}

namespace {
// (A << 1) | B, with A leading: 00, 10, 11, 01.
const uint8_t kForward[4] = {0b00, 0b10, 0b11, 0b01};

int32_t run(const uint8_t* states, int steps, bool reverse) {
  int32_t count = 0;
  uint8_t prev = states[0];
  for (int i = 1; i <= steps; i++) {
    const uint8_t cur = reverse ? states[(4 - (i % 4)) % 4] : states[i % 4];
    count += quadratureStep(prev, cur);
    prev = cur;
  }
  return count;
}
}  // namespace

static void test_quadrature_counts_both_ways() {
  TEST_ASSERT_EQUAL_INT32(400, run(kForward, 400, false));
  TEST_ASSERT_EQUAL_INT32(-400, run(kForward, 400, true));
}

static void test_quadrature_ignores_no_change_and_missed_edges() {
  TEST_ASSERT_EQUAL_INT8(0, quadratureStep(0b10, 0b10));
  TEST_ASSERT_EQUAL_INT8(0, quadratureStep(0b00, 0b11));
  TEST_ASSERT_EQUAL_INT8(0, quadratureStep(0b10, 0b01));
  TEST_ASSERT_TRUE(quadratureMissed(0b00, 0b11));
  TEST_ASSERT_FALSE(quadratureMissed(0b00, 0b10));
}

static void test_geometry_matches_the_design() {
  // 144 mm wheels at 223 rpm: 6.1 km/h.
  TEST_ASSERT_FLOAT_WITHIN(0.05f, 6.1f, geometry::kFreeSpeedMps * 3.6f);
  // 751.8 counts a turn of a 0.452 m circumference.
  TEST_ASSERT_FLOAT_WITHIN(0.00001f, 0.000602f, geometry::kMetresPerCount);
}

static void test_wheel_speed_over_a_window() {
  WheelSpeed s;
  TEST_ASSERT_EQUAL_FLOAT(0.0f, s.update(0, 0));
  // 1 m/s is 1661 counts a second, 16.61 a tick.
  const float countsPerMs = 1.0f / geometry::kMetresPerCount / 1000.0f;
  float v = 0;
  for (int i = 1; i <= 20; i++) v = s.update(static_cast<int32_t>(lroundf(i * 10 * countsPerMs)), i * 10);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 1.0f, v);
  // Stopped: back to zero within a window.
  for (int i = 21; i <= 27; i++) v = s.update(static_cast<int32_t>(lroundf(200 * countsPerMs)), i * 10);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 0.0f, v);
  s.reset();
  TEST_ASSERT_EQUAL_FLOAT(0.0f, s.update(12345, 1000));
}

static void test_wheel_speed_backwards_and_across_the_millisecond_wrap() {
  WheelSpeed s;
  uint32_t t = 0xFFFFFFF0u;
  float v = 0;
  for (int i = 0; i < 8; i++) v = s.update(-17 * i, t + 10u * i);
  TEST_ASSERT_TRUE(v < -1.0f);
}

static void test_controller_zero_target_brakes_and_resets() {
  SpeedController c;
  for (int i = 0; i < 50; i++) c.update(1.0f, 0.5f, 0.01f);
  TEST_ASSERT_EQUAL_FLOAT(0.0f, c.update(0.0f, 0.8f, 0.01f));
  // Integral was reset: the next command starts from feed-forward and P only.
  const float d = c.update(0.5f, 0.5f, 0.01f);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 0.5f / geometry::kFreeSpeedMps, d);
}

static void test_controller_feed_forward_at_the_cap() {
  SpeedController c;
  const float d = c.update(1.11f, 1.11f, 0.01f);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 1.11f / geometry::kFreeSpeedMps, d);
}

static void test_controller_never_exceeds_its_duty_limit() {
  SpeedController c;
  float d = 0;
  // An encoder that reads nothing: the output stops at dutyMax, both ways.
  for (int i = 0; i < 1000; i++) d = c.update(1.11f, 0.0f, 0.01f);
  TEST_ASSERT_FLOAT_WITHIN(0.0001f, 0.8f, d);
  c.reset();
  for (int i = 0; i < 1000; i++) d = c.update(-1.11f, 0.0f, 0.01f);
  TEST_ASSERT_FLOAT_WITHIN(0.0001f, -0.8f, d);
}

static void test_controller_does_not_wind_up_while_pinned() {
  SpeedController c;
  for (int i = 0; i < 1000; i++) c.update(1.11f, 0.0f, 0.01f);
  // Wheel catches up and overshoots: duty must drop below feed-forward at once.
  const float d = c.update(1.11f, 1.5f, 0.01f);
  TEST_ASSERT_TRUE(d < 1.11f / geometry::kFreeSpeedMps + 0.3f);
}

static void test_odometry_straight_with_the_sensor() {
  Odometry o;
  for (int i = 0; i < 300; i++) o.update(0.1f, 0.1f, true, 1.0f);  // sensor reads 1 rad throughout
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 30.0f, o.x());
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 0.0f, o.y());
  TEST_ASSERT_EQUAL_UINT16(300, o.distanceDm());
}

static void test_odometry_square_returns_home() {
  Odometry o;
  float h = 0;
  for (int side = 0; side < 4; side++) {
    for (int i = 0; i < 100; i++) o.update(0.05f, 0.05f, true, h);
    h += geometry::kPi / 2;  // turn on the spot
    o.update(-0.29f, 0.29f, true, h);
  }
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 0.0f, o.distanceM());
  TEST_ASSERT_EQUAL_UINT16(0, o.distanceDm());
}

static void test_odometry_from_wheels_without_the_sensor() {
  Odometry o;
  // A quarter turn left on the spot from the wheels, then 1 m.
  const float arc = geometry::kPi / 2 * geometry::kTrackM / 2;
  o.update(-arc, arc, false, 0);
  for (int i = 0; i < 10; i++) o.update(0.1f, 0.1f, false, 0);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 0.0f, o.x());
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 1.0f, o.y());
}

static void test_odometry_caps_the_distance() {
  Odometry o;
  o.update(7000.0f, 7000.0f, false, 0);
  TEST_ASSERT_EQUAL_UINT16(65534, o.distanceDm());
}

static void test_tilt() {
  float deg = -1;
  TEST_ASSERT_TRUE(tiltDegrees(0, 0, 9.81f, deg));
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 0.0f, deg);
  const float r = 35.0f * geometry::kPi / 180.0f;
  TEST_ASSERT_TRUE(tiltDegrees(9.81f * sinf(r), 0, 9.81f * cosf(r), deg));
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 35.0f, deg);
  TEST_ASSERT_TRUE(tiltDegrees(0, 9.81f * sinf(r), 9.81f * cosf(r), deg));
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 35.0f, deg);
  TEST_ASSERT_TRUE(tiltDegrees(0, 0, -9.81f, deg));
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 180.0f, deg);
  TEST_ASSERT_FALSE(tiltDegrees(0, 0, 0.5f, deg));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_quadrature_counts_both_ways);
  RUN_TEST(test_quadrature_ignores_no_change_and_missed_edges);
  RUN_TEST(test_geometry_matches_the_design);
  RUN_TEST(test_wheel_speed_over_a_window);
  RUN_TEST(test_wheel_speed_backwards_and_across_the_millisecond_wrap);
  RUN_TEST(test_controller_zero_target_brakes_and_resets);
  RUN_TEST(test_controller_feed_forward_at_the_cap);
  RUN_TEST(test_controller_never_exceeds_its_duty_limit);
  RUN_TEST(test_controller_does_not_wind_up_while_pinned);
  RUN_TEST(test_odometry_straight_with_the_sensor);
  RUN_TEST(test_odometry_square_returns_home);
  RUN_TEST(test_odometry_from_wheels_without_the_sensor);
  RUN_TEST(test_odometry_caps_the_distance);
  RUN_TEST(test_tilt);
  return UNITY_END();
}
