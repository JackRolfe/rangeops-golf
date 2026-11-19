# 10. Fleet status

Status: ready-for-agent
Blocked by: 06
Spec: [../spec.md](../spec.md) (Fleet)

## What

`GET /ranges/{rangeId}/fleet` for staff: robots with last reported status and their current or next hire today. `POST /robots/{robotId}/status` from staff or the account holding the robot's current hire. Staff create and edit robots.

## Acceptance

- [ ] Fleet shows the current hire's bay and end time
- [ ] A hirer can post status only during their hire
- [ ] A robot out of service is never assigned to a hire
- [ ] Serials must be 4 characters of A–Z or 0–9 and unique
