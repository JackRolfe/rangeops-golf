# 02. Hire-key tool and shared test vectors

Status: ready-for-agent
Type: task
Blocked by: none
Spec: [spec.md](../spec.md#hire-key-tool)

## What

`robot/tools/hire-key.mjs`, Node built-ins only (`node:crypto` Ed25519). Commands `keygen`, `sign`, `verify`, `vectors` as in the spec. Exports `encodeHireKey`, `signHireKey`, `decodeHireKey`, `verifyHireKey` so the backend can reuse them later.

Layout (78 bytes): version 1; serial, 4 ASCII bytes; start, u32 LE; end, u32 LE; bay, u8; Ed25519 signature over bytes 0–13.

`vectors` writes `robot/firmware/test/vectors/hire_keys.json` from a fixed test seed: the test public key, the robot's serial, and cases with a key, a "now" and the expected result: ok, bad length, bad version, bad signature (one bit flipped in the body, one in the signature), wrong serial, not yet started, expired, at the exact end (expired), at the exact start (ok), signed by another key.

`.keys/` is git-ignored.

## Acceptance

- [ ] `node --test robot/tools` passes: round trip, layout offsets, and the committed vectors equal what `vectors` produces now (byte for byte).
- [ ] `keygen` refuses to overwrite without `--force` and writes the private key with mode 600.
