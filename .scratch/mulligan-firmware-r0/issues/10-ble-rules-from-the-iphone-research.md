# 10. Bluetooth rules from the iPhone research

Status: resolved
Type: task
Blocked by: none
Spec: [spec.md](../spec.md#ble)

## What

The control link in robot/README.md (commit b69c2f2) now carries rules from [docs/research/ble-iphone-to-robot.md](../../../docs/research/ble-iphone-to-robot.md). For the firmware:

1. After connecting, ask for a 15–30 ms connection interval, latency 0, supervision timeout 6 s.
2. Forget the hire key when the phone disconnects, so the next connection must write it again. Test it on the host.
3. The 78-byte Unlock write arrives as a long write (Prepare and Execute Write) whenever the MTU is small, as on iPhones. Make sure the Bluetooth library hands the callback the whole value.

## Acceptance

- [x] Connection parameters requested on connect.
- [x] A host test shows a disconnect locks the robot and resets the Unlock read-back; a fresh write of the same key unlocks it again.
- [x] Long writes reach the Unlock callback assembled, or are handled; what only a real board can confirm is written down.

## Comments

1. **Connection interval.** `onConnect(server, param)` calls `updateConnParams` with 12/24 (15/30 ms), latency 0, timeout 600 (6 s). Commit 3ed51c8.
2. **Disconnect.** `HireLock` now has `connected()` and `disconnected()`. A disconnect locks it, clears the key and resets the Unlock read-back to 1, so the next connection starts locked and reads 1. Host tests in test_hire_key. Commit b01657b. This also fixed a gap: before, the board locked on disconnect but left the last result readable to the next phone.
3. **Long writes.** No change needed. The Bluedroid-based Arduino BLE library in espressif32 6.9.0 (Arduino core 2.0.17) creates characteristics with `ESP_GATT_RSP_BY_APP` and handles prepared writes itself: each `ESP_GATTS_WRITE_EVT` with `is_prep` is appended to the value (`BLEValue::addPart`) and answered with the echoed value and offset; `ESP_GATTS_EXEC_WRITE_EVT` with the execute flag commits the whole value and calls `onWrite` once, so the Unlock callback sees all 78 bytes. Its Execute Write response reads `conn_id` and `trans_id` through the write-event struct, but both structs start with the same fields, so it reaches the right connection. Values may be up to 600 bytes (`ESP_GATT_MAX_ATTR_LEN`). Switching to NimBLE wasn't needed.

   Caveats found in the library source:
   - It appends parts in arrival order and ignores their offsets. Phones send them in order from 0, so this works; anything else garbles the key, the signature fails and the robot stays locked. Safe, not silent.
   - Its buffer of prepared parts is not cleared on disconnect. If a phone disconnects between Prepare and Execute, the next long write to Unlock is prefixed with the leftovers and reads back 1 (bad length) once; the commit clears the buffer, so writing the key again works. The app should retry the Unlock write once on a read-back of 1. Rare, since Prepare and Execute are milliseconds apart.

   **Confirm on a real board** (added to robot/firmware/README.md, bench check 5): a key written at MTU 23 reads back 0; the connection parameter update appears in nRF Connect's log; an iPhone connects, unlocks and drives.
