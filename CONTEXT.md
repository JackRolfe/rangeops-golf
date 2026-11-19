# RangeOps domain terms

Terms as the code, specs and tickets use them. Add to this as terms settle.

## Ranges and bays

- **Range**: one driving range. Has a time zone and a currency, and everything below belongs to one.
- **Bay**: one hitting position at a range, numbered 1 to 255 (the number goes into a hire key's single byte).
- **Bay-hour**: the unit a bay is booked and priced in. Bookings start on the hour.
- **Peak / off-peak**: the two prices of a bay-hour. An hour is peak if it starts inside one of the range's **peak windows** (weekday and local times).
- **Check-in code**: the secret in the QR code at a bay. Scanning it while holding a booking for that bay checks the booking in.

## Accounts and money

- **Account**: one person, identified by email, signed in by **sign-in link**. One account works at every range.
- **Range staff**: an account allowed to use a range's console endpoints.
- **Booking**: a bay for one or more bay-hours, with optional **add-ons**: `robot`, `club_hire`, `lesson`. Its **source** is `rangeops` (taken in the app) or `external` (taken by another system and handed in).
- **Order**: what an account paid for: a booking, a bucket, a pass or ball credit. Money is integer cents.
- **Bucket**: a fixed number of balls, sold as a **bucket code** (`XXXX-XXXX`) that staff or a ball machine **redeem**. Where it was paid for doesn't matter to redemption.
- **Pass**: a monthly membership at one range, giving a percent off bays and buckets while valid.
- **Ball credit**: prepaid balls held on an account at one range, spent on buckets.
- **Payment provider**: whatever takes the money. Today only the fake provider exists.

## Robots

- **Mulligan**: the robot. In the backend it is a **robot** record: serial (4 characters, as advertised over Bluetooth), home bay, last reported status.
- **Hire**: a robot assigned to a booking's bay for the booking's hours.
- **Hire key**: the 78-byte, Ed25519-signed token that lets one phone drive one robot during one hire. Carried to the phone in a **hire link**.
- **Fleet**: a range's robots with their latest status and hires, as the console sees them.
