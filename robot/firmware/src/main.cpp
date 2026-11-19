#include <Arduino.h>

static constexpr uint8_t PIN_STATUS_LIGHT = 38;

void setup() {
  pinMode(PIN_STATUS_LIGHT, OUTPUT);
}

void loop() {
  digitalWrite(PIN_STATUS_LIGHT, (millis() / 500) % 2);
  delay(10);
}
