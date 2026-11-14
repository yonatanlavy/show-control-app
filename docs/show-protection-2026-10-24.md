# Show protection · 24 October 2026

## Plan

Make existing Android foreground protection easier to set up and keep its warning current. Preserve native command ownership, quiet ongoing notifications for prepared performance/rehearsal sessions, fixed GO/panic positions, and deliberate silent recovery after process death. Do not keep an idle library service alive or restart audio after OS Stop/Force stop.

1. Expose a compact, automatically checked background-readiness card in Library. Expand the existing shared setup panel for repairs, show unknown observations honestly, recheck after returning from Settings, and never prompt for permissions automatically.
2. Update the native warning promptly on power-saving/idle/unlock signals, retaining the bounded native polling fallback. Distinguish an unavailable battery reading from a successful check. Include blocked notification-channel groups.
3. Add concise guidance about ongoing show notifications, unrestricted battery use, manufacturer sleep/autostart controls, charging, and force-stop limits in all ten languages. Keep system-settings changes outside prepared sessions.
4. Exercise warning combinations, denied permissions, failed/stale reads and settings fallbacks. Run repository checks, native regression/lint/build checks, and targeted Android emulator checks. Record remaining physical-device/iOS gates without claiming immunity from OS termination.

## Platform basis

- [Android Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby): public battery-exemption observations and user-controlled Settings; foreground work must be tied to a real user task.
- [Android Task Manager](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping): the user can stop an entire app, including its foreground service.

No AI requests, new dependencies, persisted show-schema changes, battery-setting changes without a user action, or watchdog restart loops.

## Verification

The updated internal APK is `Show-Control-Show-Protection-2026-10-24.apk`, 154,688,973 bytes, SHA-256 `CB1FC61E54A80EF5A68F813AAA47630E949201A75C033E88490DF4D1AEED7701`. Its generated/packaged bundle hash is `E4C46DDF81D55D76B8043BC955F92435447B3ECB1E2D83408744C3A55CEC9641`. The installed base APK was pulled and matched this exact hash. Both arm64-v8a and x86_64 are present; signature verification passed with the existing internal/test certificate and provisional identity.

**Automated verified:** 775 tests in 58 suites; type, lint, architecture, 744-message/native-copy parity across ten languages, token checks; native Android background/transport/ownership/media/remote policy regressions; all 14 actual-source Expo Promise concurrency regressions. Android strict native lint reported no issues and the release APK built successfully. Eighteen embedded Metro sources matched authoring, promoted and frozen/previously verified content. Prior delayed-Hit/group-ownership work is preserved in this build; its wider device matrix remains separately tracked in [native work observations](native-work-readouts-2026-10-24.md).

**Simulator/emulator verified**, isolated `ShowControl_QA_API35`, API 35, no audio output:

| Scenario | Observed outcome |
| --- | --- |
| Startup, battery optimized, notifications denied | Library warning visible; no audio service or automatic permission prompt. Original `OMS_smoke_test` and its one synthetic cue retained. |
| Expand/collapse repair card | Same background panel exposes observed values and explicit repair actions. Unit regressions cover collapse, failed reads/retry, stale reads and denied access. |
| Explicit permission request | Android prompt appears only after tapping Allow general notifications. Allow granted access and the panel reread it. |
| Battery repair | Opened Android app battery usage; found Show Control through Search, then Allow background usage → Unrestricted. Foreground return reported actual Doze exclusion. Merely opening Settings did not claim a change. |
| Ready notification | ID 1001, mediaPlayback foreground service, ongoing/only-alert-once/no-clear flags; quiet status and semantic controls, no show/cue names. |
| Battery Saver enabled | Warning observed within the 385-ms command/observation window, while Ready remained silent. This is an observation window, not a rendering-latency benchmark. |
| Battery Saver cleared | Subsequent settled observation restored the normal prepared message. An immediate snapshot still contained the old warning; no synchronous-update claim is made. |
| Locked forced Doze | Same PID 3460, foreground service and ongoing notification retained after 54.5 seconds. This tested a prepared show with Doze exemption; it does not prove a long audible show or an optimized-device guarantee. |
| Notification return | Returned to Ready at 00:00 with unchanged GO/panic bounds and no command replay. |
| Synthetic playback, Home, lock, native Pause | OS session reported PLAYING at 8,968 ms; native Pause while locked returned Paused at 00:26. UI restored the paused source position and Resume action. The continuously updating playback screen did not reach UIAutomator's idle condition; OS state and the later paused UI are the evidence. |
| Doze exemption removed | Verified absent from the whitelist; bounded native polling updated the battery warning while paused playback and foreground ownership remained intact. |
| Android Active apps Stop | Process/service ended. Relaunch returned to Library with the original show and no audio service or notification recreation. Historical exit reason recorded USER REQUESTED / STOP APP. |
| Hebrew / 150% text | Compact warning, complete action label, logical RTL and scroll reachability visually inspected. Restored English and text 1.0 afterward. |
| Cleanup | Original denied-notification flags, no Doze exemption, power saver off, battery simulation reset, DND 0, rotation 0/auto 1 and original show retained. No media imported, deleted or edited. |

Evidence is retained under `.native-check/show-protection-*`: checks/build/signing, frozen source ledger and source proof, installed identity, UI hierarchies/screenshots, service/notification/media/Doze observations and cleanup. The first exemption-removal command was rejected by Android's argument parser; its observation is explicitly marked unsuccessful and superseded by verified `optimized-v2` evidence. No provider requests were made.

## Audit and remaining gates

The project `crit` audit and React review found no remaining in-scope high/critical issue in these changes. Settings/permission actions retain the preparation lock; warning reads and broadcasts never dispatch transport or restart a service. No persistence, media, signing configuration or GO/panic layout changes were introduced by the protection refinement.

Android may allow notification dismissal, and OS Stop, Force stop, shutdown, crashes, memory pressure and manufacturer restrictions can still terminate an app. There are no watchdog or boot restart loops and no automatic audible recovery. Manufacturer sleep/autostart settings are guidance rather than detected success. This APK is not a store release or proof of readiness for 1,000 customers.

iOS/Xcode and physical Android/iOS, manufacturer variants, exact remotes/Flic, wired/Bluetooth audio, HDMI/microphones, cross-platform restore and two-hour runs remain open. The historical rendering/focus ANR remains unresolved; no new crash entry appeared during this bounded emulator pass. Existing broad parity/release gates remain unchanged.
