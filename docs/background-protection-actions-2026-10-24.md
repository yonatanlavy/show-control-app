# Background protection actions · 24 October 2026

## Plan

The owner asked for practical protection against premature closure. Existing native foreground ownership, ongoing quiet notification, power/thermal observations, preparation warnings and deliberate recovery remain the foundation. This pass makes the prepared-show notification request immediate display on supported Android versions and makes actionable battery/power warnings directly repairable without searching the panel.

1. Request immediate foreground-notification display using AndroidX, retaining quiet/ongoing/only-alert-once behavior, native ownership and prepared-session lifetime. No idle service, restart loop, new permission or automatic playback.
2. Put battery and power-saving settings actions beside their observed warnings. Retain exactly one visible battery action and put notification/preparation guidance above the detailed readings. Unknown observations stay unknown; opening Settings never implies the setting changed.
3. Reject callbacks after panel teardown, including a queued settings action. Preserve preparation gates, fixed GO/panic geometry, existing themes, ten-language copy and offline use.
4. Run focused regressions and the repository software checks, compile/lint the affected Android module, audit scoped diffs and promote verified source. Record any existing unrelated failures and device-validation limits separately.

## Delivered scope

Android's prepared-show notification now requests immediate foreground visibility using `NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE`. It retains quiet, ongoing, only-alert-once behavior and the existing native lifetime. This does not start a service while the app is idle or make a dismissed/blocked notification visible against the user's settings.

The shared preparation panel places battery and Battery Saver repair buttons inside their warnings. A resolved warning leaves one manual battery action available; unknown readings remain explicit. Notification/preparation lifetime guidance is visible without opening Help. Old settings/permission callbacks after teardown are ignored. All actions still require an idle session and a deliberate press, and observations are refreshed after returning from Settings. No schema, dependency, permission, provider, library/media or GO/panic geometry changes.

## Automated and build evidence

The promoted candidate passes **830 tests in 61 suites**, type, lint, architecture, translation/native-copy parity for **759 messages in all ten languages**, design-token checks and native background/failure policy regressions. Six new component scenarios cover inline battery/power repairs without duplicate visible buttons, visible lifetime guidance, unavailable optimization readings, obsolete battery and permission callbacks, and a warning resolved by a genuine fresh reading. The focused run passes 62 tests across four suites. Full logs retain 45 pre-existing React `act` warnings; they are not warning-free.

Strict `:show-audio:lintRelease` reports **No issues found**, and Android `:app:assembleRelease` succeeds. Build receipt `04d8ff63-ca13-4d4c-9f24-d2e6f1b5162a` ties the frozen/promoted source to the build. Only the three planned production/test files were promoted before building. Separate incomplete authoring changes to download/helper workflows were preserved and excluded: the authoring workspace's full run has 827 passes and three failures in those existing unfinished tests. Its type/lint/architecture/translation/token checks pass. The exact promoted candidate was independently checked in full and has no failed tests.

The immutable internal APK is `Show-Control-Background-Protection-2026-10-24.apk`, **154,727,113 bytes**, SHA-256 `D90595E4E81BF1646A3DE8D92DA1F280AC51343D5D585BB23A56D0CA88D380F9`. The installed APK checksum matches. It retains the existing internal/test signing certificate, provisional package identity and arm64-v8a/x86_64 ABIs. The packaged panel source matches the frozen source map, and the packaged/generated bundle hashes match (`151B4008FFF39B59759D8B0ABFC268139233CAA7A328833F23439F2C7BB2F255`). Compared with the previous Protection-and-Controls APK, 71 native/resource/manifest/DEX payloads are unchanged; only `classes3.dex` changes for the native notification addition.

## Emulator observations

Test device: isolated `ShowControl_QA_API35`, Android API 35, no host audio. These observations verify UI/native state, not acoustic output or physical-device survival.

| Scenario | Observed result |
| --- | --- |
| Idle app | Original `OMS_smoke_test` and one synthetic cue remain. No playback service, notification or media-button owner starts. |
| Optimized battery | Inline repair reaches Android's battery settings. Returning without changing policy retains the warning. The English action measures 48 dp high. |
| Explicit notification permission | Allow action opens the OS prompt. Grant produces freshly observed Yes values; it does not start playback. |
| Battery Saver | Simulated Saver produces a direct 48-dp power-repair button. It reaches the Android Battery Saver page. Original power state restored. |
| Prepared Ready | Foreground service ID 1001 and quiet ongoing/only-alert-once/no-clear notification are observed with the battery-settings warning. Native position remains zero. The immediate-display API is compiled; this is not a measured cross-device latency guarantee. |
| Locked Ready | Same PID/service and warning remain after approximately 45 seconds asleep; native position remains zero without a command. No Doze exemption or forced deep Doze was used. |
| Locked native GO/Pause | NEXT starts the synthetic cue; Pause retains 581 ms. Foreground return shows Paused/Resume, without replay. |
| Panic and normal exit | Panic from Paused stops/reset playback and opens Recovery. Normal exit removes service, notification and media ownership. |
| Android Stop/relaunch | Stop while prepared removes process/service/notification/media ownership. Cold relaunch has no native session/service or automatic playback. |
| Control geometry | Ready and Paused GO/Resume bounds remain `[42,1582][1038,1855]`; panic remains `[556,1403][1038,1550]`. |
| Hebrew and large text | RTL guidance renders correctly. At 150% text, the inline battery repair remains readable and reachable after scrolling, with a target above 48 dp. Android's font configuration recreates the activity; the panel is reopened after recreation. |
| Cleanup | English/Dark Blue, font 1.0, rotation 0/auto 1, AC/100, heat override off, Saver/DND 0, no battery exemption and original notification denial/flags restored. Library/media/keys were not changed. The task emulator is closed after final cleanup. |

Evidence remains in `.native-check/background-actions-*`, `.native-check/protection-v2-background-actions-*` and `.native-check/protection-pressure-background-actions-*`. The one ongoing current-turn `crit` audit reviewed scoped diffs, callers, teardown/admission, truthful readings, offline behavior, native notification ownership, accessibility/RTL and artifact identity. No known critical/high finding remains in this delta.

Android user Stop/Force stop, OS termination and shutdown remain possible; [Android documents explicit user stopping](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping). [Immediate notification display](https://developer.android.com/reference/androidx/core/app/NotificationCompat.Builder#setForegroundServiceBehavior(int)) does not guarantee process survival. iOS/Xcode, manufacturer-specific phones, physical audio/remotes/displays, screen readers, tablet/landscape, forced deep Doze, long runs and customer/store-release gates remain unverified for this candidate. No AI/provider requests were made.
