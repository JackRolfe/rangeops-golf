# 02. Hire key checks

Status: ready-for-agent
Spec: ../spec.md
Blocked by: 01

## What

`apps/player/src/robot/hireKey.ts`: `checkHireKey(bytes, { serial, nowUnix, verifier })` returning `ok` or the first failed check, in the firmware's order; `HireKeyVerifier`; `ed25519Verifier(publicKey)` with WebCrypto; `benchSigner`/`benchVerifier`, clearly marked as not cryptographic; `issueBenchKey({ serial, bay, start, end })`.

## Acceptance

- [ ] Every case in the shared vectors (copied from `robot/firmware/test/vectors/hire_keys.json` on the firmware branch) gives the expected result with `ed25519Verifier`.
- [ ] Bench keys pass `benchVerifier`, and changing any byte of the body or signature fails it.
