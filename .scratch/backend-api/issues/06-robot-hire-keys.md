# 06. Robot hire and signed hire keys

Status: ready-for-agent
Blocked by: 05
Spec: [../spec.md](../spec.md) (Hire keys); [ADR 0002](../../../docs/adr/0002-hire-key-signing.md)

## What

Robot and hire tables (seed the two demo robots). Hire key encoder in the exact 78-byte layout from `robot/README.md`, signed with Ed25519 through `node:crypto`; signing key file created on first start under `.keys/` (gitignored). `GET /hire-keys/public-key`. A `robot` add-on on a booking assigns a free robot (home bay first), creates a hire and returns the key and hire link; 409 when no robot is free. Cancelling the booking cancels the hire.

## Acceptance

- [ ] Unit tests: byte layout, little-endian times, bay byte, signature verifies with the public key, tampering fails
- [ ] Booking with a robot returns the hire link `APP_URL/drive?hire=<base64url>`
- [ ] Two overlapping robot bookings use both robots; a third gets 409 and is not charged
- [ ] Bay numbers outside 1–255 are refused at bay creation
