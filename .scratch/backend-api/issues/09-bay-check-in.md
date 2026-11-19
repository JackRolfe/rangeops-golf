# 09. Bay check-in by QR code

Status: resolved
Blocked by: 06
Spec: [../spec.md](../spec.md) (Check-in at the bay)

## What

Bay check-in codes (made with the bay, rotatable by staff). `POST /check-in/{code}` finds the account's booking at that bay running now or within 15 minutes, records the check-in, and returns the hire link if a robot was hired (idea 9).

## Acceptance

- [ ] Check-in 10 minutes early works; 20 minutes early gets `no_booking`
- [ ] Checking in twice keeps the first time
- [ ] Unknown code 404; someone else's booking isn't found
- [ ] The returned hire key is the one issued at booking

## Comments

Done. Codes are 128 random bits as 32 hex characters, made by the database, and never appear in public range or bay responses. The QR code should open `APP_URL/check-in/<code>`; the app posts the code to `POST /check-in/{code}`. Staff read and rotate codes through the console bay endpoints in 11.
