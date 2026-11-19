# 0002. Hire keys: who signs them, with what, and how they reach the phone

Date: 2026-11-19
Status: accepted

## Context

The robot only drives for a phone that writes a valid 78-byte hire key ([robot/README.md](../../robot/README.md#control-link-draft)). The robot checks the Ed25519 signature offline against a public key in its firmware. The backend issues keys for hires.

## Decision

- The backend holds one Ed25519 signing key. Locally it is a PKCS#8 PEM at `apps/api/.keys/hire-signing-key.pem`, created on first start if missing, gitignored, and never logged. `HIRE_SIGNING_KEY_PATH` points elsewhere. `GET /hire-keys/public-key` gives the raw 32-byte public key to flash into firmware.
- A hire key covers exactly the booked hours: start and end are the booking's. Checking in early does not move the start.
- The key reaches the phone in a link, `APP_URL/drive?hire=<base64url of the 78 bytes>`, returned when the booking is made and again at check-in. The API also returns the key as hex and base64url.
- Every robot add-on becomes a hire and a key the same way, whether the booking came from the app or from another booking source.
- Cancelling a booking cancels the hire record, but a key already on a phone stays valid until its end time, because the robot cannot be told offline. Staff see the robot as free in the fleet.

## Consequences

- Rotating the signing key means reflashing every robot. A later version of the key format could carry a key id; the version byte leaves room for that.
- Each robot needs a clock it trusts, which is an open question on the robot side.
