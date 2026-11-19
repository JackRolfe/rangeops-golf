# 08. Wire the stop switch's state to pin 2

Status: ready-for-human
Type: task
Blocked by: none
Spec: [spec.md](../spec.md#hardware-layer)

## What

BUILD.md wires the stop button into the relay coil's supply, but nothing tells the controller it was pressed. The firmware reads pin 2 with its pull-up and expects it pulled to ground while the button is released; open (pressed, or a broken wire) means stop. Until this is wired, the robot always reports state 4.

Find out whether the Jaycar SP0786 has a second contact block, or can take one. If it can, wire a normally closed contact between pin 2 and ground and add the step to BUILD.md's wiring section. If not, choose another way (for example a divider from the coil side of the button, kept under 3.3 V) and record it.

## Acceptance

- [ ] BUILD.md says how pin 2 is wired.
- [ ] On the bench, telemetry reads state 4 with the button pressed and not with it released.
