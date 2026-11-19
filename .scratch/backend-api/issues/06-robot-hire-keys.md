# 06. Robot hire and signed hire keys

Status: resolved
Blocked by: 05
Spec: [../spec.md](../spec.md) (Hire keys); [ADR 0011](../../../docs/adr/0011-hire-key-signing.md)

## What

Robot and hire tables (seed the two demo robots). Hire key encoder in the exact 78-byte layout from `robot/README.md`, signed with Ed25519 through `node:crypto`; signing key file created on first start under `.keys/` (gitignored). `GET /hire-keys/public-key`. A `robot` add-on on a booking assigns a free robot (home bay first), creates a hire and returns the key and hire link; 409 when no robot is free. Cancelling the booking cancels the hire.

## Acceptance

- [ ] Unit tests: byte layout, little-endian times, bay byte, signature verifies with the public key, tampering fails
- [ ] Booking with a robot returns the hire link `APP_URL/drive?hire=<base64url>`
- [ ] Two overlapping robot bookings use both robots; a third gets 409 and is not charged
- [ ] Bay numbers outside 1–255 are refused at bay creation

## Comments

Done. A robot is held by a `pending` hire inside the booking transaction (a Postgres exclusion constraint stops one robot being hired twice), and the key is signed only once payment succeeds. If no robot is free the booking rolls back before any charge. Hire keys come back on the booking as hex, base64url and `APP_URL/drive?hire=<base64url>`. Robot serials are unique across all ranges, since a key binds a serial. The bay-number range (1–255) is a database check; the bay creation endpoint in 11 validates it too.

ADRs renumbered to 0010 and 0011 because the firmware branch already uses 0001–0004.
