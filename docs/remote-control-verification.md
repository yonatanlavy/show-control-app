# Remote hub verification — 14 October 2026

Scope: the screenshot-inspired Controllers hub, native silent learning/testing, standard media/HID inputs, Flic setup/recovery and profile safety. No live AI/provider request was made. Existing shows, music and keys were preserved; native fixtures were not persisted to the library.

## Automated and native evidence

- Final type and lint checks passed. The complete suite passed **282 tests in 28 suites**, including architecture checks. Translation parity passed for **481 messages** plus native OS copy in all ten languages; token generation was current. The final Android Hermes production export passed (4.4 MB bundle).
- Controller setup regressions cover adapter/device identity, exact overrides, immutable replacement, capacity, expiry, key release, repeats, queue/staleness, unknown media keys and volume reservation. UI checks cover every media action, native-unavailable/armed states, explicit save, overwrite/removal/cancel, per-action test counts, duplicate delivery, setup failure/retry, show changes, late completion and More navigation.
- Standalone Kotlin admission regression passed: silent media interception, armed refusal, preparation cancellation, controller command epochs, panic invalidation and unprepared rejection.
- Android `:show-controller:lintDebug :show-audio:lintDebug :app:assembleDebug` passed for x86_64 and arm64-v8a. Media3 dependency currency suggestions are explicitly excluded because versions are pinned; remaining native lint checks run with warnings as errors. Media-service admission allows trusted OS/media controllers and the app, rejecting unrelated clients. The native modules build with the available Kotlin lint analyzer (`android.lint.useK2Uast=false`).

## Android emulator evidence

Device: emulator-5560, Android API 36, development package `app.showcontrol.working`, existing library retained. This is emulator evidence, not physical Bluetooth certification.

| Scenario | Recorded result |
| --- | --- |
| Open More → Controllers | Premium remote overview, four action rows, mode picker, connection guide, mapping and silent test present. |
| Learn GO without pressing a button | Save disabled; silent native mode active. |
| Inject a custom HID PAGE_DOWN through the native bridge | Button identity appeared; Save enabled only after capture; zero active show voices. Cancel discarded it. |
| Ten system media presses through Android key delivery | GO 4, pause/resume 2, previous 2, stop 2; 10/10 count and action checks rendered; zero active show voices/countdown. No panic press was claimed. |
| Native test with repeated HID down | One eligible input, repeated input suppressed, zero show voices. |
| Try learning while a native snapshot is armed | Native refusal; test mode could not absorb live controls. |
| Native HID GO then panic during a 500 ms countdown | Countdown began, panic cancelled it, no late voice started after 600 ms. |
| Pause JavaScript debugger, send system NEXT, then resume | Native engine reached `playing`, `qa-song`, one deliberately attenuated fixture voice and zero remaining countdown. No JavaScript transport timing was used. |
| Pause JavaScript debugger, send STOP, then resume | Immediate native stop; final state verified silent, then temporary session shut down. |
| Hebrew portrait, landscape and 150% system text | Layout mirrored, physical remote/transport marks retained orientation; content stacked and scrolled. Corrected text alignment independently of parent mirroring. Existing library loaded after activity recreation. |

Normal display size/density/font scale, locale and theme are restored after checks. The Expo tools gear belongs to the development client and is not shipped Controllers UI.

## Edge and combination audit

The affected workflow explicitly handles: no module; missing Flic SDK; no show; disconnected keyboard; Bluetooth off; permission denial; scan cancellation; scan timeout; already-running pairing; wrong remote mode; unknown button; reserved volume key; release-only event; held repeat; bounce; queued reconnect; absent key-up on disconnect; identical buttons across devices; duplicate event delivery; stale setup session; show change during capture; navigation during setup; late setup completion; native setup failure; overwrite conflict; removal cancellation; profile capacity; native armed refusal; pending GO at panic; commands from an older prepared run; background expiry; process-local reset.

Combinations reviewed: two Flic buttons with the same primary key; exact mapping plus generic wildcard; media remotes plus headphones sharing an identity; iOS multiple coalesced keyboards; held press plus reconnect; queued press plus missing key-up; learn mode plus armed native engine; navigation plus pending setup; show switch plus pending save; rapid GO plus countdown plus panic; media Next/Stop while JavaScript is suspended; RTL plus large text plus a modal; full profile plus replacement; SDK failure plus touch fallback.

## Remaining gates

The final lifecycle audit also fixed temporary Android system pairing activity pauses: silent diagnostics stop, but pairing continues through the confirmation. Explicit navigation cancellation invalidates a pending permission request, preventing a late scan. The UI lifecycle regression passed; actual Flic pairing remains a named-hardware gate.

iOS source/pod integration is implemented but not compiled here. The licensed Flic iOS binary, Xcode/macOS (or build service), physical Android/iOS devices and named remotes are still required. Battery, RF range, actual Bluetooth pairing, external microphones/routes, two-hour runs and venue output are not certified by these tests. This work does not declare complete OMS parity or store readiness.
