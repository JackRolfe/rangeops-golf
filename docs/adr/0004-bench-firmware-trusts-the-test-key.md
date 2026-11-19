# 4. Bench firmware trusts the public test key until a signing key is made

Status: accepted for the bench, 2026-11-19

## Context

The robot checks hire keys against a public key compiled into its firmware. The matching private key must never be committed. But a fresh checkout has to build and, once a board exists, be drivable on the bench without first setting up a signing key.

## Decision

- `robot/firmware/include/hire_public_key.h` ships holding the **test key's** public half. The test key's private seed is in the shared test vectors, so anyone with the repository can sign keys for a robot built this way. The header defines `MULLIGAN_BENCH_KEY`, and the ESP32 build prints a warning while it is set.
- `node robot/tools/hire-key.mjs keygen` makes a real key pair, keeps the private key in the git-ignored `robot/tools/.keys/`, and rewrites the header with the real public key and without `MULLIGAN_BENCH_KEY`.

## Consequences

- Fine for a private proof of concept on the builder's bench. Run `keygen` before the robot is anywhere other people's phones can reach it.
- Losing `robot/tools/.keys/` means making a new pair and reflashing.
