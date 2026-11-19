# 06 Hand over buckets against codes

Status: ready-for-agent
Type: task
Blocked by: 02

`src/domain/buckets.ts`: code normalising (case, spaces, dashes; no ambiguous characters), code generation, and the handover decision for an order (hand over, already handed over at a time, refunded, not found). The fake applies it; the Handover screen shows the result and recent handovers.

## Acceptance

- Vitest: normalising, a code is handed over once only, refunded and unknown codes refused.
- Screen: entering a seeded code shows the bucket, entering it again shows "already handed over".
