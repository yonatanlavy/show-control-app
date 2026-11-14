# Protection warnings and device pressure · 24 October 2026

## Execution plan

Continue the request to reduce premature closure without AI calls, restart loops, new permissions, media changes or changes to the fixed GO/panic geometry.

1. Preserve the existing native foreground ownership and cold-Ready remote fix. Show every detected preparation issue in the compact protection card, and put app-background restriction repair beside its warning.
2. Read battery percentage, charging and thermal pressure through public platform APIs on Android and iOS. Keep unavailable readings unknown. Warn about low battery when not known to be charging and severe heat; these observations never stop, resume or otherwise dispatch playback.
3. Refresh Android's existing ongoing notification on battery/power and thermal changes, with the existing bounded polling fallback. Recovery remains the highest-priority message. Give low battery and heat their own concise, silent messages in all ten languages.
4. Add boundary, combination, malformed-reading, denied-setting and stale-read regressions. Verify type/lint/unit/architecture/translations/tokens/native policy and Android builds. Exercise the installed candidate on the isolated emulator; retain the physical-device/iOS gates.

## Platform basis

- [Android thermal observations](https://developer.android.com/reference/android/os/PowerManager#getCurrentThermalStatus()): API 29+; earlier devices report thermal state unavailable.
- [Apple thermal state](https://developer.apple.com/documentation/foundation/processinfo/thermalstate-swift.enum) and battery observations: read locally without changing the user's settings.
- [Android user Stop](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping): the OS can stop even a foreground app. No prevention guarantee or automatic audible recovery is introduced.

## Evidence

The immutable internal APK is `Show-Control-Show-Protection-2026-10-24-v3.apk`, 154,708,201 bytes, SHA-256 `DA61D86904F0FD9900C5E4D4AAA35AC53097DA899424EDDFBA4AE18212E70032`. Packaged/generated bundle SHA-256: `84E901CC2A33924A7F9116987A59185900CECD8571FB42BFB1914100E0E830F3`. The pulled installed APK matched the delivered hash. Signature verification passed with the existing internal/test certificate and provisional identity; arm64-v8a and x86_64 are included.

**Automated verified:** 798 tests in 59 suites; type, lint, architecture, token checks, 758 messages/native-copy parity in all ten languages, and native background/transport/ownership/media/remote policy regressions. Strict Android native lint reported no issues and the release APK built successfully. Four changed production Metro sources matched frozen/promoted content; all 23 frozen source/test/resource files matched authoring and promotion. The existing 45 React `act` warnings remain; this is not a warning-free test run. No provider requests, dependencies, permissions, persisted show schemas or GO/panic layout code changed.

**Simulator/emulator verified:** isolated `ShowControl_QA_API35`, API 35, no audio output. These are native-state/UI observations, not audible, physical-device or long-run evidence.

| Scenario | Observation |
| --- | --- |
| Idle Library, optimized battery and denied notifications | Both problems remained visible in the compact card. No automatic prompt or audio service. Original `OMS_smoke_test` retained with one synthetic cue. |
| Explicit notification permission | App action opened the Android permission prompt. Allow was reflected by a fresh read. Original denial and permission flags were restored afterward. |
| Native pressure readings | Expanded panel showed 100% / charging / normal. Simulated 20%, discharging and thermal status 3 produced 20% / No / Too hot, with both explanatory warnings. No idle playback service started. |
| Prepared, hot and low | Ready remained at zero. PID 3414 held a mediaPlayback foreground service, ID 1001, ongoing/only-alert-once/no-clear notification and heat warning. |
| Threshold and priority | Clearing heat exposed the low-battery notification at 20%. Raising charge to 21% restored the battery-settings advisory. Known charging at 20% with exemption restored the normal prepared message after settling. An immediate charging observation retained an earlier warning and is superseded by `ready-charging-settled`; no synchronous-update claim is made. |
| Locked Ready | After 24.97 seconds, the screen was asleep, position remained zero, and the same PID/service/notification and media-button owner were retained. This bounded check used battery exemption and did not force deep Doze. |
| Warning updates while locked | Removing exemption, simulating 10% discharging and heat status 3 changed the native notification while the UI remained asleep. No audio started. |
| Deliberate native GO/Pause while hot, low and locked | NEXT entered PLAYING; Pause retained 624 ms with the ongoing warning and same PID. Foreground return restored Paused/Resume and the matching progress. |
| Local incoming-call simulation | Audio stopped and recovery guidance took priority over heat/battery warnings. Cancelling the simulated call left GO disabled and required deliberate recovery; no playback resumed. |
| Android explicit Stop | Process/service/notification disappeared. Relaunch returned to Library with no service, notification or media owner; no command replay. |
| Hebrew, 150% text | Hot/low/optimized warnings and the complete review action were visually inspected in RTL, with scroll reachability. All ten language dictionaries passed automated checks; this does not replace human translation review. |
| Safety geometry | Ready, paused and interrupted Run snapshots had identical GO `[42,1582][1038,1855]` and panic `[556,1403][1038,1550]` bounds. Interrupted GO was disabled while panic remained available. |
| Cleanup | English/Dark Blue, font 1.0, battery AC/100, thermal override off/status 0, no Doze exemption, notification denial/original flags, Saver/DND 0, rotation 0/auto 1 and no simulated calls. The original library remained intact. No media was imported, edited or deleted. |

Native policy regressions also cover malformed/missing battery values, zero/invalid scales, full integer ranges, all Android thermal status mappings, 0/1/19/20/21% boundaries, unknown charging, charging at low levels, unknown observations and recovery priority across active/Ready states. Platform/panel tests cover simultaneous issues, targeted repair, denied settings, foreground refresh, missing readings, failed reads, timeout/retry and stale responses.

Evidence is retained under `.native-check/protection-pressure-*` and `.native-check/protection-v2-pressure-*`: source baseline/audit/ledger, full checks, build receipt, strict lint, signature/APK/source identity, UI snapshots, native state observations and cleanup. The first emulator identity guard rejected whitespace-separated output before any settings mutation; the corrected exact-name guard verified the task-owned emulator.

## Audit and remaining gates

The current-turn `crit` audit reviewed only this protection delta and its callers. Native transport ownership, existing generated-silence cold-Ready fix, preparation locks, library data and fixed safety geometry were preserved. No known critical/high issue was found in this delta. Existing broader blockers, including ordered OMS group advancement and the historical rendering/focus ANR, remain separately tracked; this build is not generally bug-free or customer/store-ready.

iOS source implements the matching preparation observations, but Xcode compilation and physical iOS evidence are unavailable on this Windows host. Physical Android/iOS, manufacturer sleep/autostart policies, real heat/low-battery behavior, exact remotes/Flic, audio routes, HDMI/microphones, cross-platform restore and two-hour runs remain open. Previous background evidence is in [the follow-up](show-protection-follow-up-2026-10-24.md) and [cold Ready controls](cold-ready-remotes-2026-10-24.md).

Ongoing notifications and unrestricted battery use reduce avoidable restrictions. Android's explicit Stop, Force stop, shutdown, crashes and manufacturer policies can still terminate the app. No boot/watchdog restart loop or automatic audible recovery was added.
