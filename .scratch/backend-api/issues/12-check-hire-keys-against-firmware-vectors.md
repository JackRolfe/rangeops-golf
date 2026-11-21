# 12. Check hire keys against the firmware's shared test vectors

Status: resolved
Blocked by: 06, and the robot firmware session's `robot/tools/hire-key.mjs` and vectors under `robot/firmware/test/`
Spec: [../spec.md](../spec.md) (Hire keys)

## What

Another session is writing `robot/tools/hire-key.mjs` and shared hire-key test vectors under `robot/firmware/test/`. Once they are on `main`, add a test in `apps/api` that loads the vectors and checks that `encodeHireKey` produces byte-identical output for the same inputs and key (Ed25519 is deterministic, so signatures should match too), and that our verifier accepts their keys. Don't edit their files; if the layouts disagree, raise it in the notes folder instead of changing either side.

## Acceptance

- [ ] Test reads the shared vectors file from `robot/firmware/test/` and passes
- [ ] Any mismatch with `robot/README.md` is written up, not silently fixed

## Comments

Done early: the firmware session's vectors exist on `feature/robot-firmware-r0-c75956` (checked at 20cf7e0, `robot/firmware/test/vectors/hire_keys.json`, 17 cases). `test/hire-key-vectors.test.ts` derives the signer from their public test seed and checks that the public key matches, every case decodes to its fields, bad signatures fail, validly signed keys verify, and `encodeHireKey` gives byte-identical keys (Ed25519 is deterministic). Run against a copy of their file with `HIRE_KEY_VECTORS=<path> npm test`: 18 passed, no mismatches with robot/README.md. In this branch the file is absent, so the suite skips; it runs by itself once both branches are on main. Their files were not edited.

Not acted on: the research session proposes a v2 key of 82 bytes with a signed "issued at" (`docs/research/robot-clock.md` on its branch). That is a proposal only; README still says 78 bytes, so the API follows that. If v2 is adopted, `src/hires/hireKey.ts` is the one place to change.
