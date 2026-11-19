# 02. Hire key checks

Status: resolved
Spec: ../spec.md
Blocked by: 01

## What

`apps/player/src/robot/hireKey.ts`: `checkHireKey(bytes, { serial, nowUnix, verifier })` returning `ok` or the first failed check, in the firmware's order; `HireKeyVerifier`; `ed25519Verifier(publicKey)` with WebCrypto; `benchSigner`/`benchVerifier`, clearly marked as not cryptographic; `issueBenchKey({ serial, bay, start, end })`.

## Acceptance

- [x] Every case in the shared vectors (copied from `robot/firmware/test/vectors/hire_keys.json` on the firmware branch) gives the expected result with `ed25519Verifier`.
- [x] Bench keys pass `benchVerifier`, and changing any byte of the body or signature fails it.

## Comments

Done in `apps/player/src/robot/hireKey.ts`. All 17 shared vectors (copied to `src/robot/fixtures/hire_keys.json`, test only) pass with `ed25519Verifier` on Node's WebCrypto. The bench signature is FNV-1a run out to 64 bytes and is labelled as not cryptographic.
