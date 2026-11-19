# 10. Bluetooth rules from the iPhone research

Status: claimed
Type: task
Blocked by: none
Spec: [spec.md](../spec.md#ble)

## What

The control link in robot/README.md (commit b69c2f2) now carries rules from [docs/research/ble-iphone-to-robot.md](../../../docs/research/ble-iphone-to-robot.md). For the firmware:

1. After connecting, ask for a 15–30 ms connection interval, latency 0, supervision timeout 6 s.
2. Forget the hire key when the phone disconnects, so the next connection must write it again. Test it on the host.
3. The 78-byte Unlock write arrives as a long write (Prepare and Execute Write) whenever the MTU is small, as on iPhones. Make sure the Bluetooth library hands the callback the whole value.

## Acceptance

- [ ] Connection parameters requested on connect.
- [ ] A host test shows a disconnect locks the robot and resets the Unlock read-back; a fresh write of the same key unlocks it again.
- [ ] Long writes reach the Unlock callback assembled, or are handled; what only a real board can confirm is written down.
