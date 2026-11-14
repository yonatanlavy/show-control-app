# Fresh show-protection guidance · 24 October 2026

## Plan

The ongoing native Android notification already retains prepared sessions and warns about battery restrictions, low charge and heat. The preparation panel currently reads only on mount, foreground return and explicit Recheck. A visible panel can therefore continue to display old power observations.

1. Refresh the existing preparation observations quietly every 30 seconds while the app is active and no show/settings action is in progress. Do not start a service, request permission or change transport/settings.
2. Keep the current content and controls stable during a quiet read. A failed read must replace reassuring observations with the existing unavailable/Retry state. Avoid overlapping automatic reads; invalidate responses after background/unmount and preserve explicit Recheck ownership.
3. Cover changing conditions, slow reads, background return, failures, preparation locks, settings actions and teardown. Preserve all ten existing translations, library data and fixed GO/panic geometry.
4. Run the full software/native checks, build an immutable internal APK, inspect its installed protection/notification behavior on the isolated emulator and perform the scoped final audit. Include the already-built feedback touch-target correction in the candidate and verify it before delivery.

## Limits and evidence

The immutable internal APK is `Show-Control-Protection-and-Controls-2026-10-24.apk`, 154,726,801 bytes, SHA-256 `AB5E3626A0E065B9C78149B5B45DACBE166615DD43896C5E62625D76174F887F`. Packaged/generated bundle SHA-256: `36D1E790BBB036EB11DAD097DED0C2A7E07D68A7079595E630F757214FEE1140`. Installed identity matches. Signature verification passed with the existing internal/test certificate and provisional identity; arm64-v8a and x86_64 are included. Eight frozen production Metro sources match the authoring/promoted files. All 72 DEX/native/manifest/resource payloads are unchanged from the preceding navigation APK.

**Automated verified:** 824 tests in 61 suites; type, lint, architecture, 759-message/native-copy parity in all ten languages, token checks, native background/transport/ownership/media/remote policy regressions and strict Android native lint/release build. Nine new recheck scenarios cover changing conditions, slow reads, failure/Retry, background/stale response, deliberate Recheck ownership, critical-session admission, another settings action, iOS low-power observations and teardown. Existing native-read timeout tests cover the five-second deadline. The full Jest log retains 45 existing React `act` warnings; it is not warning-free. No provider requests, permissions, dependencies, persisted schema or audio-engine changes.

**Simulator/emulator verified:** isolated `ShowControl_QA_API35`, API 35, no host audio output. This is UI/native-state evidence, not acoustic or physical-device proof.

| Scenario | Observed result |
| --- | --- |
| Cold Library | Original `OMS_smoke_test`, one cue; optimized battery and denied notifications visible. No playback service, notification or media owner starts. |
| Quiet foreground refresh | Simulated 20% discharging and heat status 3 while the same app remained open. Both warnings appeared without Recheck/navigation/foreground return. No service or permission prompt started. Observation was captured about 45 seconds after mutation; this does not certify a native hard deadline. |
| Explicit notification permission | Existing Allow action opens Android's permission prompt. Grant causes fresh Yes observations; original denial/flags restored after testing. |
| Prepared Ready | Position zero, PID 4133, foreground service ID 1001 and quiet ongoing/only-alert-once/no-clear notification with heat warning. GO/panic retain their fixed bounds. |
| Locked Ready and changed pressure | After 43 seconds asleep, the same process/service remains and position stays zero. Clearing heat and raising charge to 21% exposes the battery-settings warning while locked. No automatic playback. No battery exemption or forced deep Doze was used. |
| Deliberate locked GO/Pause | Native NEXT then Pause holds 591 ms. Foreground return shows Paused/Resume at that position; the settled notification remains ongoing. Panic reaches Recovery. |
| Explicit Android Stop/relaunch | Process/service/notification/media ownership disappear. Relaunch has no prepared session, service or sound-producing command replay. |
| Error/layout safety | [Feedback verification](feedback-layout-2026-10-24.md) records successful-save Arm clearance, full 48-dp Dismiss, malformed archive/audio rejection, Diagnostics, reachable landscape recovery actions at 150% text and Hebrew. |
| Cleanup | Original English/Dark Blue, font 1.0, rotation 0/auto 1, battery AC/100, thermal override off/status 0, no Doze exemption, notification denial/original flags, Saver/DND 0 and original selected show restored. Only the two hash-verified synthetic download fixtures were removed. No song was imported, changed or deleted. |

Evidence is retained under `.native-check/protection-refresh-*`, `.native-check/protection-v2-protection-refresh-*` and `.native-check/protection-pressure-refresh-*`: frozen/promoted source hashes, full checks, terminal build receipt `a51f1e20-d9b7-47f6-8a09-0bb684939041`, signature/artifact/source identity, native policy logs, UI/screenshot observations and cleanup. The preceding c2 feedback build also passed; it was not delivered separately. The final combined candidate contains its touch-target correction.

The ongoing current-turn `crit` audit reviewed the protection delta and affected callers, state ownership, timer cleanup, settings/preparation gates, offline behavior and source-only React Native design. No known critical/high finding remains in this scoped delta. Existing broader renderer ANR, decoder-timeout, iOS/Xcode, manufacturer-device, physical audio/controller/HDMI/microphone, cross-platform restore, two-hour and pilot gates remain open. Automated iOS observation tests are not an iOS build/device pass.

Foreground service/notification protection reduces avoidable termination. [Android explicit Stop](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping), Force stop, shutdown, crashes and manufacturer restrictions remain possible. [Battery exemption](https://developer.android.com/training/monitoring-device-state/doze-standby) does not provide a survival guarantee. No restart loop or automatic audible recovery was introduced, and this internal build is not a customer/store-ready certification.
