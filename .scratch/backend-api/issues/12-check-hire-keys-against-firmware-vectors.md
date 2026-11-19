# 12. Check hire keys against the firmware's shared test vectors

Status: needs-info
Blocked by: 06, and the robot firmware session's `robot/tools/hire-key.mjs` and vectors under `robot/firmware/test/`
Spec: [../spec.md](../spec.md) (Hire keys)

## What

Another session is writing `robot/tools/hire-key.mjs` and shared hire-key test vectors under `robot/firmware/test/`. Once they are on `main`, add a test in `apps/api` that loads the vectors and checks that `encodeHireKey` produces byte-identical output for the same inputs and key (Ed25519 is deterministic, so signatures should match too), and that our verifier accepts their keys. Don't edit their files; if the layouts disagree, raise it in the notes folder instead of changing either side.

## Acceptance

- [ ] Test reads the shared vectors file from `robot/firmware/test/` and passes
- [ ] Any mismatch with `robot/README.md` is written up, not silently fixed
