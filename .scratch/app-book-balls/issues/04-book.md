# 04. Book a bay

Status: resolved
Spec: ../spec.md
Blocked by: 03

## What

Book tab: the next 14 days, free start times from availability, 1 to 3 hours, the free bays for that time, add-ons (robot only while one is free for every hour), an estimate, Pay with the test card, and a confirmation. "Your bookings": upcoming and past, cancel an upcoming one, and Drive for one with a robot.

## Acceptance

- [x] Component tests against the fake: book with a robot and see it in your bookings; a declined card says so; cancel.

## Comments

Done in `apps/player/src/book/`. Anyone can look at free times; signing in is asked for at Pay. Up to 3 hours in the picker (the API takes 4). A 409 reloads availability. Declined bookings show under 'Past and cancelled' as 'payment declined', as the API keeps them.
