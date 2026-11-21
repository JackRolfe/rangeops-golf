# 09. Put the R0 control-link changes into robot/README.md and the app

Status: needs-triage
Type: task
Blocked by: none

## What

The R0 firmware implements two additions to the draft control link that are only recorded in ADRs so far:

- [ADR 0003](../../../docs/adr/0003-drive-flag-to-clear-a-fault.md): Drive flags bit 1 clears a fault.
- [ADR 0005](../../../docs/adr/0005-unlock-result-read-back.md): Unlock is readable and gives the last key-check result as one byte.

Add both to the tables in `robot/README.md`, and to `RobotLink` and `SimulatedRobot` in `apps/player`. The app session building the Drive tab has been told.

## Acceptance

- [ ] `robot/README.md` lists bit 1 and the Unlock read-back.
- [ ] The app can clear a fault and explain a refused key.
