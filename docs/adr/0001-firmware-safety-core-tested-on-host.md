# 1. The firmware's decisions live in a host-tested core

Status: accepted, 2026-11-19

## Context

Every safety promise has to live in Mulligan's firmware, and nobody can flash a board yet. Bugs in the stop rules are the ones that matter most and the hardest to find on a robot.

## Decision

- The firmware is a PlatformIO project in `robot/firmware/` with two environments: `esp32s3` (Arduino framework) and `native` (Unity tests on the laptop).
- Everything that decides behaviour (message parsing, hire-key checking, the safety rules, ramps, the speed controller, encoder decoding, odometry) is plain C++ in `lib/` with no Arduino or ESP-IDF calls. Time comes in as an argument; nothing reads a clock itself.
- The board layer in `src/` only moves data between hardware and the core.
- Ed25519 checking uses Monocypher 4 (CC0 or BSD-2), vendored in `lib/monocypher/`, so the same code is tested on the host and runs on the robot, with no network needed to build.

## Consequences

- The host tests cover the rules exactly as they run on the robot. What they cannot cover is the board layer: pin polarity, interrupt timing, the BLE stack and the sensors. That is for the bench.
- Upgrading Monocypher means replacing the vendored files by hand.
