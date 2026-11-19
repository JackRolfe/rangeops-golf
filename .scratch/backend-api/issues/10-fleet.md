# 10. Fleet status

Status: resolved
Blocked by: 06
Spec: [../spec.md](../spec.md) (Fleet)

## What

`GET /ranges/{rangeId}/fleet` for staff: robots with last reported status and their current or next hire today. `POST /robots/{robotId}/status` from staff or the account holding the robot's current hire. Staff create and edit robots.

## Acceptance

- [ ] Fleet shows the current hire's bay and end time
- [ ] A hirer can post status only during their hire
- [ ] A robot out of service is never assigned to a hire
- [ ] Serials must be 4 characters of A–Z or 0–9 and unique

## Comments

Done. States are the control-link telemetry states by name: idle, driving, at_limit, link_lost, stopped_by_switch, fault, low_battery, locked. `ballsOnBoard` is null when the robot does not count (telemetry 255). Fault flags are not stored yet. A partner portal has no way to read the fleet yet (needs an API key, out of scope).
