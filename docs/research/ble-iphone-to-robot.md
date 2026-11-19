# Bluetooth LE from iPhone to Mulligan

Researched 2026-11-19.

**Summary.** Keep decision 2 as it stands: wrap the existing React app in Capacitor and talk to the robot through `@capacitor-community/bluetooth-le`. The plugin is MIT-licensed and maintained (8.4.0 released 18 November 2026, for Capacitor 8). It supports write without response, notifications and reading the MTU on iOS and Android. Its web build runs on Web Bluetooth, so one `BleRobot` serves Chrome on the bench and the iPhone app. The 78-byte Unlock write needs no MTU work on any platform. Apple's docs say a write with response may be longer than a write without response; the Bluetooth Core Spec does this with Prepare and Execute Write, and NimBLE on the ESP32-S3 accepts it by default. The README's line that "the app asks for a larger packet size first" should change, because an iOS app cannot ask. Mulligan's traffic is tiny next to what iOS can carry. The control link needs three things the draft doesn't spell out: request a short connection interval from the firmware, send Drive on a "latest value wins" basis, and reconnect and unlock again whenever the app comes back to the foreground. TestFlight needs the Apple Developer Program (99 USD a year, charged in local currency; Apple does not publish an AUD figure on any page I could reach). It also needs Xcode 26 or later on a Mac; this Mac has only the Command Line Tools today. For the private PoC, internal testing covers it with no beta review. Before paying anything, a free Personal Team can put the app on the builder's own iPhone for 7 days at a time.

## 1. Capacitor Bluetooth LE plugins

### `@capacitor-community/bluetooth-le` (recommended)

| | Finding |
| --- | --- |
| Latest release | 8.4.0 on npm, published 2026-11-18 ([npm](https://www.npmjs.com/package/@capacitor-community/bluetooth-le)). Earlier 8.x releases: 8.2.0 (May 2026), 8.3.0 (Aug 2026). The repo uses npm releases and has no GitHub Releases; the last commit is `chore(release): 8.4.0` on 2026-11-18 ([commits](https://github.com/capacitor-community/bluetooth-le/commits/main)) |
| Capacitor support | Plugin 8.x targets Capacitor 8.x, with a version table back to Capacitor 2 ([README, Versions](https://github.com/capacitor-community/bluetooth-le#versions)). Peer dependency `@capacitor/core >=8.0.0` (npm metadata). Current `@capacitor/core` is 8.6.2 |
| Open issues | 41 open issues; 47 open issues plus PRs ([GitHub](https://github.com/capacitor-community/bluetooth-le/issues), counted 2026-11-19) |
| Maintainers | Listed in the README: pwespi (301 commits) and Philip Peitsch (peitschie), who cut the recent releases ([contributors](https://github.com/capacitor-community/bluetooth-le/graphs/contributors)). Published under the capacitor-community npm organisation, which includes Ionic staff |
| Licence | MIT ([repo](https://github.com/capacitor-community/bluetooth-le)) |
| Platforms | Web, Android, iOS. Only the central role, only BLE (no classic) ([README, Introduction](https://github.com/capacitor-community/bluetooth-le#introduction)) |

Feature support, from the plugin's own platform table ([README, API](https://github.com/capacitor-community/bluetooth-le#api)):

| Method | Android | iOS | Web |
| --- | --- | --- | --- |
| `writeWithoutResponse` | yes | yes | yes |
| `write` (with response) | yes | yes | yes |
| `startNotifications` / `stopNotifications` | yes | yes | yes |
| `read` | yes | yes | yes |
| `requestDevice` (chooser) | yes | yes | yes |
| `requestLEScan` | yes | yes | behind a Chrome flag |
| `getMtu` | yes | yes | no |
| `requestConnectionPriority` | yes | no | no |

What the source does, read from the repo on 2026-11-19:

- **MTU on Android.** After service discovery during `connect`, it calls `requestMtu(512)`, the constant `REQUEST_MTU = 512` in [`Device.kt`](https://github.com/capacitor-community/bluetooth-le/blob/main/android/src/main/java/com/capacitorjs/community/plugins/bluetoothle/Device.kt). No app code is needed.
- **MTU on iOS.** `getMtu` returns `maximumWriteValueLength(for: .withoutResponse) + 3` ([`Device.swift`](https://github.com/capacitor-community/bluetooth-le/blob/main/ios/Sources/BluetoothLe/Device.swift)). It reads the value iOS negotiated and can't change it.
- **Write without response on iOS** calls `writeValue(_:for:type: .withoutResponse)` and resolves straight away. It never checks `canSendWriteWithoutResponse` (same file). At Mulligan's rate this is fine (see section 4). It does mean a backlog would be silent.
- **Every call goes through one JS queue,** so plugin calls run one after another ([`src/queue.ts`](https://github.com/capacitor-community/bluetooth-le/blob/main/src/queue.ts), used in [`bleClient.ts`](https://github.com/capacitor-community/bluetooth-le/blob/main/src/bleClient.ts)). A slow call delays the Drive writes queued behind it.
- **Web fallback.** The plugin takes the Web Bluetooth API as its feature guide, and its web implementation ([`src/web.ts`](https://github.com/capacitor-community/bluetooth-le/blob/main/src/web.ts)) runs on `navigator.bluetooth` ([README](https://github.com/capacitor-community/bluetooth-le#introduction)). One `BleRobot` written against `BleClient` therefore runs in Chrome and in the iOS and Android shells. Use `requestDevice` rather than `requestLEScan` for picking the robot, because scanning is behind a flag on the web.
- **iOS setup:** `NSBluetoothAlwaysUsageDescription` in `Info.plist`, or the app crashes when it touches Bluetooth. `bluetooth-central` in `UIBackgroundModes` only if Bluetooth is needed in the background ([README, iOS](https://github.com/capacitor-community/bluetooth-le#ios)).

Web Bluetooth itself ships without a flag in Chrome on Android, ChromeOS, macOS and Windows, including writes with and without response and notifications. Safari has "no plan to support it in the near future" ([Web Bluetooth CG implementation status](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md), updated June 2026).

### Alternatives

| Plugin | Status | Why not first choice |
| --- | --- | --- |
| Capawesome Bluetooth Low Energy | Paid, "only available to Capawesome Insiders", needs a licence key. Android and iOS only, **no web**. Write without response, notifications, `requestMtu` and connection priority (both Android only). 8.x for Capacitor 8 ([Capawesome docs](https://capawesome.io/plugins/bluetooth-low-energy/)) | Costs money and has no web build, so Chrome bench testing would need a second code path. Its extras (peripheral role, Android foreground service) aren't needed here |
| `@capgo/capacitor-bluetooth-low-energy` | 8.2.9 on npm (2026-11-12). MPL-2.0. Repo created December 2025, 9 stars ([GitHub](https://github.com/Cap-go/capacitor-bluetooth-low-energy)) | Too young to judge; I did not review its feature set |
| `cordova-plugin-ble-central` | Apache-2.0, 2.1.0 on npm (2026-11-18), 52 open issues ([GitHub](https://github.com/don/cordova-plugin-ble-central)). Capacitor can run Cordova plugins | No web build. Unverified on Capacitor 8 |

Ionic has no first-party Capacitor Bluetooth plugin of its own that I could find. The community plugin is the de facto one.

## 2. MTU and the 78-byte Unlock write

**iOS chooses the MTU, and the app cannot request one.** Apple's [Accessory Design Guidelines](https://developer.apple.com/accessories/Accessory-Design-Guidelines.pdf) (Release R32 Update 1, dated 2026-10-30, section 57.11 MTU Size) say Apple devices "will support and request an MTU size larger than the default during the Exchange MTU Request handshake". As ATT client, the device "will request the optimal MTU size based on factors such as the Bluetooth topology, connection event length, maximum data length, and protocol". The accessory "should select an MTU equal to or greater than the device's MTU request". CoreBluetooth has no API to request an MTU. The only way to learn it is `maximumWriteValueLength(for:)`, "the maximum amount of data, in bytes, that can be sent to a characteristic in a single write type" ([Apple docs](https://developer.apple.com/documentation/corebluetooth/cbperipheral/maximumwritevaluelength(for:)); same wording in the `CBPeripheral.h` header). WWDC 2017 put it the same way: "Apple devices determine the optimal MTU" and "Accessories should support a large MTU" ([What's New in Core Bluetooth, slides](https://developer.apple.com/videos/play/wwdc2017/712/)).

**What iOS typically negotiates: unverified.** Apple publishes no figure. Developer reports commonly give 185 bytes on recent iPhones, and larger on some newer models. I could not confirm either from an Apple source, so the design should not depend on any number above the spec default of 23.

**A 78-byte write with response works at any MTU.**

- Bluetooth Core Spec 5.4, Vol 3, Part G, [section 4.9.4 Write Long Characteristic Values](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core-54/out/en/host/generic-attribute-profile--gatt-.html): it is used when the value "is longer than can be sent in a single ATT_WRITE_REQ PDU", using `ATT_PREPARE_WRITE_REQ` and `ATT_EXECUTE_WRITE_REQ`. Section 4.9.1 says write without response "only writes the first (ATT_MTU – 3) octets" and "cannot be used to write a long characteristic".
- Apple, [`CBCharacteristicWriteType`](https://developer.apple.com/documentation/corebluetooth/cbcharacteristicwritetype): "When you write with a response, you can write a characteristic value that's longer than permitted when you write without a response". It points to Part G sections 4.9.3 and 4.9.4.
- iOS logs posted in an [Apple Developer Forums thread](https://developer.apple.com/forums/thread/744886) show CoreBluetooth doing a "write long value" (prepared writes) for a single `.withResponse` call. That thread also shows the limit: the peripheral's prepare queue (512 bytes there) caps the total. 78 bytes is far under any queue.

So `Unlock` stays as it is: write with response, 78 bytes, one call. No chunking and no MTU check.

**Android.** [`BluetoothGatt.requestMtu`](https://developer.android.com/reference/android/bluetooth/BluetoothGatt#requestMtu(int)) asks for a larger MTU. Since Android 14 the stack requests 517 when the first GATT client asks and ignores later requests. The Capacitor plugin requests 512 after connecting (above), so on Android the key fits in a single write either way.

**Chrome (Web Bluetooth)** exposes no MTU at all. Write with response is still a GATT write, so the OS stack underneath does the long write if needed. I did not test that.

**ESP32-S3 / NimBLE.**

- ESP-IDF (latest v6.1.1, 2026-11-16): `CONFIG_BT_NIMBLE_ATT_PREFERRED_MTU` defaults to **256**, changeable with `ble_att_set_preferred_mtu()` ([Kconfig source](https://github.com/espressif/esp-idf/blob/master/components/bt/host/nimble/Kconfig.in); also in the [ESP-IDF Kconfig reference](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/kconfig-reference.html)). `CONFIG_BT_NIMBLE_ATT_MAX_PREP_ENTRIES` defaults to 64 (same file), so prepared (long) writes are on by default.
- NimBLE's hard maximum is `BLE_ATT_MTU_MAX 527`, and the default before exchange is 23 ([`ble_att.h`](https://github.com/apache/mynewt-nimble/blob/master/nimble/host/include/host/ble_att.h)).
- NimBLE-Arduino (2.5.2, 2026-10-25) defaults the preferred MTU to **517** ([Command_line_config.md](https://github.com/h2zero/NimBLE-Arduino/blob/master/docs/Command_line_config.md)). Its `syscfg.h` has queued writes on, with 64 prepare entries and a 30 s timeout ([`syscfg.h`](https://github.com/h2zero/NimBLE-Arduino/blob/master/src/syscfg/syscfg.h)). Characteristic values can be up to 512 bytes (`BLE_ATT_ATTR_MAX_LEN`).
- One firmware trap: in raw ESP-IDF NimBLE, a long write reaches the access callback as one **chained mbuf**. Read it with `OS_MBUF_PKTLEN` and `ble_hs_mbuf_to_flat()`, not by looking at the first buffer's length. NimBLE-Arduino's `onWrite` hands over the assembled value.

## 3. iOS in the background and on a locked screen

From Apple's [Core Bluetooth Background Processing guide](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html) (archived, but it is still the reference):

- **Without a background mode,** a suspended app "is unable to perform Bluetooth-related tasks". Events "are queued by the system and delivered to the app only when it resumes to the foreground". Locking the screen or switching apps suspends the app. In a Capacitor app the WebView's timers stop too, so Drive messages stop.
- **With `bluetooth-central`,** the system wakes the app for delegate events, and it "has around 10 seconds" for each wake. Background scanning is coalesced and slower. Apple asks that such apps be "session based" and warns that apps spending too long in the background "can be throttled back by the system or killed".
- **State preservation and restoration** (`CBCentralManagerOptionRestoreIdentifierKey`, `centralManager(_:willRestoreState:)`) lets iOS reconnect and relaunch the app after it was killed. That suits accessories that must stay linked, not a hold-to-drive toy.
- **App Review** [guideline 2.5.4](https://developer.apple.com/app-store/review/guidelines/#software-requirements): background services may be used "only... for their intended purposes". Declaring `bluetooth-central` for an app that has no background job is an avoidable review question.

**For Mulligan:** declare no background mode. When the app is backgrounded, Drive stops, the robot's 300 ms watchdog brakes it, and that is the right outcome. Apple doesn't document whether iOS keeps the link open for a suspended app, so assume it may or may not be there on return. On resume (`App` `resume` / `appStateChange` in Capacitor) the app should:

1. Treat the stick as released. Never resume sending a stick position from before the suspension. Require a fresh touch.
2. Check the link (`getConnectedDevices` or the queued `onDisconnect` callback). If the link has dropped, reconnect, write Unlock again and restart Telemetry notifications.
3. Show "Reconnecting" until a fresh Telemetry notification arrives, and show the robot's reported state (it may be 3, "link lost").

## 4. Connection interval, latency and throughput

**Apple's connection parameter rules** ([Accessory Design Guidelines R32 U1](https://developer.apple.com/accessories/Accessory-Design-Guidelines.pdf), section 57.6). The central decides; the peripheral may request:

- Interval Min ≥ 15 ms and a multiple of 15 ms. Interval Max at least 15 ms above Min, or both exactly 15 ms.
- Peripheral latency ≤ 30.
- Supervision timeout from **6 to 18 seconds**, and greater than Interval Max × (latency + 1) × 3.
- Interval Max × (latency + 1) ≤ 6 s.
- Requests outside these rules "may be rejected". iOS does not read the Peripheral Preferred Connection Parameters characteristic, so the firmware must send a Connection Parameters Request or L2CAP update.
- When Min and Max are both 15 ms, some devices (Apple Watch is named) offer 30 ms instead. Apple's older [QA1931](https://developer.apple.com/library/archive/qa/qa1931/_index.html) (2017) gave a 2 to 6 s supervision timeout; the current guidelines replace that.

**What that means at 20 Hz.** Drive goes out every 50 ms. With a 15 to 30 ms interval, each message waits at most one interval to go out, so it adds 15 to 30 ms of latency, well inside the 300 ms watchdog. The iPhone's starting interval is unverified. NimBLE's own initial defaults are 30 to 50 ms (`BLE_GAP_INITIAL_CONN_ITVL_MIN/MAX` in [`ble_gap.h`](https://github.com/apache/mynewt-nimble/blob/master/nimble/host/include/host/ble_gap.h)). That works, but asking for a shorter interval is better.

**The supervision timeout is not the stop signal.** Under Apple's rules the link can take 6 s or more to be declared lost. The firmware must keep stopping on its 300 ms Drive watchdog, as the draft says, and never wait for a disconnect event. The app should show "link lost" after about 1 s without Telemetry, not wait for `onDisconnect`.

**Throughput is not a concern.** Drive is 4 bytes × 20 Hz = 80 bytes/s (0.64 kbps); Telemetry is 40 bytes/s. In Apple's WWDC 2017 figures, the slowest case (write with response, default MTU) reaches 2.5 kbps. Write without response reaches 37 kbps at the default MTU, and up to 394 kbps with L2CAP, extended data length and a 15 ms interval ([WWDC17 712 slides](https://developer.apple.com/videos/play/wwdc2017/712/)). Mulligan uses about a quarter of the slowest case.

**Flow control for write without response.** If `canSendWriteWithoutResponse` is false, delivery "is best-effort and may not be guaranteed". The property becomes true again "after the current writes have been flushed", and then `peripheralIsReady(toSendWriteWithoutResponse:)` is called ([`canSendWriteWithoutResponse`](https://developer.apple.com/documentation/corebluetooth/cbperipheral/cansendwritewithoutresponse), [`writeValue(_:for:type:)`](https://developer.apple.com/documentation/corebluetooth/cbperipheral/writevalue(_:for:type:)), `CBPeripheral.h`). WWDC 2017 explained why this exists: such writes "would be dropped due to memory pressure". At 80 bytes/s the buffer won't fill, but dropped Drive messages are possible in principle. That is what the sequence number and the watchdog are for. The Capacitor plugin doesn't expose this flag, so the app protects itself instead (see the recommendation).

**Android:** [`requestConnectionPriority(CONNECTION_PRIORITY_HIGH)`](https://developer.android.com/reference/android/bluetooth/BluetoothGatt#CONNECTION_PRIORITY_HIGH) requests "a high priority, low latency connection". The plugin exposes it on Android only.

## 5. TestFlight and Apple accounts

| Item | Finding |
| --- | --- |
| Cost | "The Apple Developer Program is 99 USD per membership year. Prices may vary by region and are listed in local currency during the enrollment process" ([enrol page](https://developer.apple.com/programs/enroll/); [purchase and activation](https://developer.apple.com/support/purchase-activation/)). Apple has no AU-specific page: `developer.apple.com/au/...` returns 404. Third-party sources give **A$149**; that figure is **unverified**, and the real price shows during enrolment |
| Free option first | Without a paid membership, Xcode signs as a **Personal Team**: up to 3 devices and 10 App IDs, with provisioning that expires after **7 days**, after which you rebuild and reinstall ([Choosing a membership](https://developer.apple.com/support/compare-memberships/)). Enough for the R0 bench on the builder's own iPhone. No TestFlight |
| Mac and Xcode | A Mac is required ("To build iOS apps, you will need macOS"). "Capacitor 8 requires a minimum of Xcode 26.0" ([Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup)). Uploads to App Store Connect "must be built with Xcode 26 or later using an SDK for iOS 26" since 28 April 2026 ([Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)). **This Mac** (Apple M4, macOS 15.6.1) has only the Command Line Tools. Xcode 26.0/26.0.1 runs on macOS 15.6. Xcode 26.6 needs macOS Tahoe 26.2, and Xcode 27 needs Tahoe 26.6 ([Xcode system requirements](https://developer.apple.com/xcode/system-requirements/)). Plan to update macOS before the next SDK deadline. The date of the next deadline is unverified |
| Usage string | `NSBluetoothAlwaysUsageDescription` is "required if your app uses the device's Bluetooth interface" ([Apple](https://developer.apple.com/documentation/bundleresources/information-property-list/nsbluetoothalwaysusagedescription)) |
| Internal testers | Up to 100 App Store Connect users on the team. No beta review ([TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)) |
| External testers | Up to 10,000 by email or public link. The first build added to a group goes to App Review; later builds "may not require a full review" (same page) |
| Build expiry | "You can test a build for up to 90 days" (same page) |
| Beta rules | TestFlight builds "should be intended for public distribution and should comply with the App Review Guidelines", and can't be given in exchange for compensation ([guideline 2.2](https://developer.apple.com/app-store/review/guidelines/#beta-testing)). The submission checklist asks for "any other hardware or resources that might be needed to review your app". For a robot, a demo video and notes are the practical answer. Whether reviewers accept that for external TestFlight is unverified |
| MFi | Not needed. Apple says MFi "is required for creating certain types of Bluetooth accessories — for example, accessories leveraging the iPod Accessory Protocol over Bluetooth Classic or accessories using HomeKit over Bluetooth Low Energy" ([Apple accessories](https://developer.apple.com/accessories/)). A custom GATT service over Core Bluetooth is neither. The accessory should still follow the Accessory Design Guidelines' Bluetooth LE chapter (advertising at 20 ms for the first 30 s, the connection parameters above, no pairing unless an ATT request is rejected for authentication) |

For the private PoC, with no children and no public demos yet, internal testing is all that's needed. Only the builder and helpers added to App Store Connect, with no review. External testing becomes relevant at a pilot range.

## 6. The alternatives

### (a) React Native with `react-native-ble-plx`

- Maintenance: 3.5.1 (2026-02-18), Apache-2.0, 33 open issues, last commit 2026-03-09 ([GitHub](https://github.com/dotintent/react-native-ble-plx)). Its compatibility table is only tested up to React Native 0.74 and Expo 51, while React Native is at 0.88. It can't run in Expo Go ([README](https://github.com/dotintent/react-native-ble-plx#compatibility)). `react-native-ble-manager` is more active (13.0.1, 2026-11-14, 4 open issues, [GitHub](https://github.com/innoveit/react-native-ble-manager)).
- Reuse: React Native renders native views (`View`, `Text`), not the DOM or CSS ([React Native docs](https://reactnative.dev/docs/intro-react-native-components)). Every screen of the existing app would be rewritten: tabs, the joystick, the accuracy chart and IndexedDB storage. Pure TypeScript domain code (`apps/player/src/domain`, `RobotLink`, `SimulatedRobot`) carries over. There's no Web Bluetooth path, so Chrome bench testing needs a separate web build.
- Risk: a second UI codebase to keep level with the web app, and a BLE library that has slowed down.

### (b) A small SwiftUI app that does only Drive

- CoreBluetooth used directly gives full control: `canSendWriteWithoutResponse`, `maximumWriteValueLength`, state restoration if ever wanted, and no plugin layer.
- Reuse: none of the TypeScript. The message encoding, sequence numbers, the stop rules and the telemetry decoding would be written twice (Swift and TS). Games, booking and balls would stay in the web app, so a child would switch apps to drive.
- Effort: learning Swift, SwiftUI and CoreBluetooth delegates from scratch. That is the biggest learning load of the three for a beginner, though the app itself is small.
- Risk: two clients drifting apart on the control link, and two places to fix a bug.

### Side by side

| | Capacitor + community plugin | React Native + ble-plx | SwiftUI Drive app |
| --- | --- | --- | --- |
| Reuses the React UI | All of it | None (domain code only) | None |
| Chrome bench testing with the same code | Yes (plugin web build) | No | No |
| Beginner effort | Lowest: add Capacitor, write `BleRobot`, learn enough Xcode to sign and upload | High: new UI framework, rewrite | High: new language and framework |
| BLE control | Good enough: no `canSendWriteWithoutResponse`, no MTU request on iOS (no one can) | Similar | Full |
| Main risk | One maintainer doing most releases; WebView suspension (harmless here) | Library slowing down; two UIs | Two control-link implementations; separate app for Drive |
| Still needs Mac, Xcode, Apple account | Yes | Yes | Yes |

## Recommendation for the plan

**Decision 2 in [docs/PLAN.md](../PLAN.md#decisions): keep the recommendation and name the plugin.** Wrap the React app in Capacitor 8 with `@capacitor-community/bluetooth-le` 8.x. Write one `BleRobot` against `BleClient`; it runs on Web Bluetooth in Chrome for the bench and natively in the iOS and Android shells. Start on a free Personal Team on the builder's own iPhone. Pay for the Apple Developer Program only when someone else needs the app through TestFlight, and use internal testers only while Mulligan is a private PoC.

| Trade-off | Accepted because |
| --- | --- |
| Depends on a community plugin with one main maintainer | MIT licence and small surface. If it stalls, `BleRobot` is the only file that changes. Capawesome's paid plugin is a drop-in fallback for native, but has no web build |
| No `canSendWriteWithoutResponse` from the plugin | 80 bytes/s is far below what iOS carries; the sequence number and watchdog cover a dropped message |
| WebView is suspended in the background | The robot is meant to stop then |
| Still needs a Mac with Xcode 26+, and a paid account for TestFlight | Every option needs these |

Concrete changes:

**Firmware**

1. After connecting, request connection parameters inside Apple's rules: interval min 15 ms, max 30 ms, peripheral latency **0** (so Drive is not skipped), supervision timeout 6 s. Use `ble_gap_update_params` in ESP-IDF or `NimBLEServer::updateConnParams` in NimBLE-Arduino. Don't rely on the Peripheral Preferred Connection Parameters characteristic; iOS ignores it.
2. Leave the preferred MTU at its default (256 in ESP-IDF, 517 in NimBLE-Arduino), keep prepared writes enabled, and read Unlock as the full assembled value (chained mbuf in raw ESP-IDF). Reject an Unlock that isn't exactly 78 bytes.
3. Support Data Length Extension, as the Accessory Design Guidelines ask. It is on in NimBLE on the ESP32-S3; `ble_gap_set_data_len` if needed.
4. Advertise at 20 ms for the first 30 s, then one of Apple's listed longer intervals (for example 152.5 ms).
5. Keep the 300 ms Drive watchdog as the stop rule, independent of the 6 s supervision timeout. On disconnect, also drop the unlocked state, so the next connection must write a valid key again.

**App (`BleRobot`)**

1. Send Drive "latest value wins": a 50 ms timer sends the current stick state. If the previous `writeWithoutResponse` promise hasn't settled, skip this tick rather than queueing, so the plugin's serial queue never builds a backlog.
2. Connect, then write Unlock with `write` (with response), then start Telemetry notifications, then read Info. Do no MTU step on any platform. Optionally log `getMtu()` on native for diagnostics.
3. On Android only, call `requestConnectionPriority(HIGH)` after connecting.
4. On app resume, follow the steps in section 3: stick released, reconnect and unlock if needed, show "Reconnecting" until Telemetry arrives. Show "link lost" after about 1 s without Telemetry.
5. Add `NSBluetoothAlwaysUsageDescription` and declare no `UIBackgroundModes`.
6. Pick the robot with `requestDevice` filtered on the service UUID or the `Mulligan-` name prefix. That works on web and native alike.

**Docs:** in [robot/README.md](../../robot/README.md#control-link-draft), replace "the app asks for a larger packet size first, which phones do routinely" with this: the key is sent as a write with response, which the Bluetooth stack splits into prepared writes when it is longer than the MTU allows. iOS apps cannot request an MTU.
