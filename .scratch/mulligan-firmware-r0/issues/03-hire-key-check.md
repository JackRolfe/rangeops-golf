# 03. Hire-key checking and the anchored clock in the firmware core

Status: ready-for-agent
Type: task
Blocked by: 01, 02
Spec: [spec.md](../spec.md#hire-keys-and-locking)

## What

In `lib/mulligan_core/`: decode the 78-byte key, check it (length, version, signature with Monocypher, serial, time window) and return a result code. A `Clock` interface and the `AnchoredClock` from ADR 0002, fed with milliseconds from the caller.

The native build turns `test/vectors/hire_keys.json` into a header (a PlatformIO pre-script), so the Unity tests check exactly the signer's vectors.

## Acceptance

- [ ] Every vector in `hire_keys.json` gives its expected result.
- [ ] Anchored clock: unknown before a key, anchors on the first good key, counts up, does not re-anchor, rejects an expired key once time passes the end.
- [ ] A key that fails the signature does not anchor the clock.
