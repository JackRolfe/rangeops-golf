# Spec: App stage 2, Drive against a simulated robot

Status: ready-for-agent
Source: `docs/PLAN.md`, "The app", stage 2; the control link in `robot/README.md`.

## Problem

The Drive tab has to exist before Mulligan does, so the app and the firmware can be built at the same time. The app talks to a robot through one interface, `RobotLink`. Today the only robot behind it is a simulator; stage 3 adds `BleRobot` behind the same interface.

## What done looks like

- `RobotLink`: connect with a hire key, send Drive messages, receive Telemetry, disconnect.
- The messages are the control link's, byte for byte: Drive (4 bytes), Telemetry (8 bytes), Info (text), Unlock (the 78-byte hire key). A codec in `apps/player/src/robot/protocol.ts` encodes and decodes each, with tests. The simulator takes and gives bytes through that codec, so a mismatch shows up in tests.
- `SimulatedRobot` implements `RobotLink`, using the lane, pickup and lane-limit logic from the site demo (`apps/site/index.html`, the Drive section). It acts as the firmware would: locked until a valid hire key, stops when the stick is released, stops 300 ms after the last Drive message, holds the lane and the 30 m limit and says so in telemetry, caps the speed, counts balls.
- The simulator refuses a hire key that is the wrong length, the wrong version, badly signed, for another robot, not started or expired. Signature checking sits behind a `HireKeyVerifier` interface.
- The Drive tab: connect to the simulated robot, a joystick, a view of the lane, the telemetry (balls on board, battery, distance, state) and a plain message for each state and limit, including stop-on-release and the lane limit.

## Decisions (reversible, made here)

| Decision | Choice | Why |
| --- | --- | --- |
| Shape of `RobotLink` | Typed messages (`DriveMessage`, `Telemetry`, `RobotInfo`) whose fields map one to one onto the bytes. The codec is separate. | The app works with fields; `BleRobot` and the simulator both go through the same codec. |
| App-side link rules | A `DriveController` owns them: 20 messages a second while the stick is held, the sequence number wrapping at 255, and three zero messages with the thumb flag clear on release, spaced at the same 50 ms, then silence. | One place for the rules, shared by every `RobotLink`. |
| Hire key checks | Same order and names as the firmware branch (`bad_length`, `bad_version`, `bad_signature`, `wrong_serial`, `not_yet`, `expired`); valid while `start <= now < end`. | Matches `robot/firmware` and `robot/tools/hire-key.mjs` on the firmware branch. |
| Signature checking | `HireKeyVerifier` interface with two implementations: `ed25519Verifier(publicKey)` using WebCrypto, tested against the shared hire-key vectors from the firmware branch (copied into a test fixture), and `benchVerifier`, a stub that accepts only keys signed by the app's `benchSigner`, a checksum that is not cryptographic. The simulator in the app uses the bench pair. | The real signing key belongs to the backend; no signing secret goes into the app bundle. The Ed25519 path proves the layout matches. |
| Where the app gets a hire key | For the simulator, the Drive tab issues a bench key for the simulated robot (serial `SIM1`, bay 7, valid from 5 minutes ago for an hour). Keys from links come with the backend. | No backend yet. |
| Why the robot refused a key | `RobotLink.connect` rejects with `HireKeyRefused`. The simulator gives the reason; a real robot may not, so the reason can be `unknown`. | The control link doesn't define a refusal code yet. |
| Stick meaning | Simulator default is **robot terms** (up is forward, sideways turns), as R0 starts. Range terms, as in the site demo, are an option. | The simulator rehearses the real robot. |
| Lane | 30 m long; 4.5 m either side of the bay's centre line, the bay plus an empty bay each side, as the plan suggests for the pilot. Configurable. | `docs/PLAN.md`, Risks. |
| Speed | Full stick asks for 1.5 m/s; the cap is 1.1 m/s (4 km/h), and the speed flag is set while the cap is cutting the stick. Ramp 2 m/s², brake 6 m/s². | `robot/README.md` target spec. |
| Pickup and unloading | Ten balls at most. Unloading is by hand at the mat, so the simulator empties the robot once it has sat stopped at the bay for a second. | `robot/README.md`, Pickup. |
| What the lane view shows | The simulator's own world (robot, balls, lane). It is only shown for the simulator; a real robot is in front of the child, and telemetry has no position. | Telemetry carries distance only. |
| Leaving the Drive tab | Releases the stick and disconnects. | Never leave a robot driving off-screen. |

## Out of scope

`BleRobot` and Capacitor (stage 3), hire keys from the backend (stage 4), the proposed clear-fault Drive flag (firmware ADR 0003; add when it is accepted).

## Tickets

In blocker order, under `issues/`:

1. `01-control-link-codec.md`: Drive, Telemetry, Info and hire key encoding.
2. `02-hire-key-checks.md`: checks, verifier interface, Ed25519 and bench verifiers. Blocked by 01.
3. `03-robotlink-and-simulated-robot.md`: the interface and the simulator. Blocked by 01, 02.
4. `04-drive-controller.md`: the app-side link rules. Blocked by 03.
5. `05-drive-tab.md`: joystick, Drive screen, lane view, Drive tab. Blocked by 03, 04.
