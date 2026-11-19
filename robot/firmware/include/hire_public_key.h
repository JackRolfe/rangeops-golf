// Written by robot/tools/hire-key.mjs. Do not edit by hand.
// BENCH KEY. This is the public half of the hire-key TEST key, whose seed is
// published in test/vectors/hire_keys.json, so anyone can sign keys this
// firmware accepts. Run `node robot/tools/hire-key.mjs keygen` before the
// robot is anywhere other phones can reach it. See docs/adr/0004.
#pragma once
#include <stdint.h>

#define MULLIGAN_BENCH_KEY 1

namespace mulligan {
static const uint8_t kHirePublicKey[32] = {
    0x7e, 0x21, 0xc9, 0x90, 0xba, 0xfc, 0xd6, 0x8f,
    0x6d, 0x0f, 0x01, 0xb6, 0x2a, 0x67, 0x95, 0xb1,
    0x88, 0xcd, 0x90, 0x77, 0x06, 0x0d, 0xfa, 0xff,
    0x08, 0x2f, 0xf7, 0x8b, 0x38, 0x2e, 0x63, 0x4d,
};
}  // namespace mulligan
