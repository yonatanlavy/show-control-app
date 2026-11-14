# Direct background-protection repairs · 24 October 2026

## Plan

Keep the native prepared-show foreground service and its quiet ongoing notification, including battery, heat and recovery advisories. Do not start an idle service, change OS settings automatically, restart after user Stop or resume audible playback after termination.

1. Expose the first actionable protection repair directly in the compact Library card. Expand its context before launching a deliberately selected repair so waiting, denial, fallback, failure and Recheck remain available.
2. Keep all simultaneous warnings visible. Unknown/failed readings must never produce a reassuring success or an automatic repair. Preserve idle/critical-session gates, stale-callback rejection, ten languages, semantic components and fixed GO/panic geometry.
3. Finish verification of the carried post-commit backup reconciliation fix, preserving durable restores and reopening instead of replaying an import.
4. Run software checks, scoped audit, Android native lint/build, package an immutable internal APK and record installed Android checks where available. Keep iOS, manufacturer-device, physical audio and long-run gates explicit.

## Evidence

The immutable internal APK is `Show-Control-Protection-Repairs-2026-10-24.apk`, 154,758,621 bytes, SHA-256 `75C0D4BF06FAC7ED2778D960A3D4567DC1456E5DEFD27D615C7DBB2A55989355`. Its packaged bundle SHA-256 is `23B2BE9D5771916F776F8E82B1330350FC5F8FD2DEBAF8F25A2ED3E69EDAD964`. The installed APK matches. Signature verification passed with the existing internal/test certificate and provisional identity; arm64-v8a and x86_64 are included. Nine frozen production Metro sources match the authoring/promoted files. All 72 native/DEX/manifest/resource payloads are unchanged from Revision History v2.

**Automated verified:** 938 tests in 63 suites; type, lint, architecture, token checks and 772-message/native-copy parity in all ten languages. Android background/failure policy regressions, strict native lint (No issues found) and release assembly pass. Eleven new direct-repair cases cover priority, combined warnings, deliberate permission requests, denial, errors/Retry, stale callbacks, unknown/failed reads and iOS. The carried backup recovery adds fourteen regressions. A final test-only synchronization correction passes the complete 938-test suite, retaining the previous 45 React act warnings; the affected Retry suite itself has none. Expo Doctor was not rerun.

**Simulator/emulator verified:** isolated `ShowControl_QA_API35`, API 35, host audio disabled. This is native-state/UI evidence, not acoustic, physical-device or long-run proof.

| Scenario | Observation |
| --- | --- |
| Idle Library | Original `OMS_smoke_test`, one cue; optimized battery and denied notifications visible. No playback service, notification or media owner starts. |
| Direct battery repair | The compact Library action reaches Android battery settings. Returning without a change expands the context and preserves the warning. English action is 48 dp; Hebrew at 150% text remains readable, reachable and above 48 dp. Landscape actions also remain visible after scrolling. |
| Notification permission | Explicit Allow opens Android's prompt. Grant produces fresh Yes observations; it does not start a playback service. Original denial and flags restored after the checks. |
| Prepared/locked Ready | Silent at position zero; foreground service ID 1001 and quiet ongoing/only-alert-once/no-clear battery-warning notification. Same PID/service after 46.6 seconds asleep, without a battery exemption or forced deep Doze. |
| Locked native controls | Deliberate NEXT starts the synthetic cue; Pause settles at 336 ms. Foreground return restores Paused/Resume at that position. Panic enters Recovery. |
| Stable safety controls | Ready and Paused GO/Resume remain `[42,1582][1038,1855]`; panic remains `[556,1403][1038,1550]`. No Run style or geometry changed. |
| Android explicit Stop | Process/service/notification/media ownership end. Cold relaunch has no prepared session or automatic audio. |
| Backup checks | Picker cancellation, completed export, same-archive share reuse and malformed-ZIP rejection pass. See [backup recovery](backup-commit-recovery-2026-10-24.md). No valid backup was imported during installed checks. |
| Cleanup | Original English/Dark Blue and selected one-cue show, font 1.0, portrait/auto-rotate, notification denial/flags, AC/100, thermal override off, Saver/DND 0 and no exemption restored. Only the hash-verified malformed fixture and owned device evidence copies were removed. The completed test backup remains in private app storage. |

Evidence is retained under `.native-check/background-direct-*`, `.native-check/protection-v2-background-direct-*` and `.native-check/protection-pressure-background-direct-*`. Software receipt `d5e9a3cf-7224-4cf3-b952-3fb9e7d92669` and terminal build receipt `cf000aa0-f1af-4590-88f3-0ceead0ea1a6` precede the final test-only synchronization check. The scoped crit/React review covers the carried recovery files and direct repair delta, admission, teardown, truthful readings, immutable native sessions, accessibility, source/artifact identity and cleanup. No known critical/high finding remains in this delta.

The ongoing-notification foundation and earlier evidence remain in [background protection actions](background-protection-actions-2026-10-24.md). Android foreground services reduce avoidable termination; [explicit Stop/Force stop](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping), system pressure and shutdown remain possible. Android also warns against starting an idle foreground service solely to avoid [Doze/App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby). No restart loop, new permission, dependency, schema migration, provider request or automatic audible recovery was added.

iOS/Xcode, manufacturer-specific phones, physical audio/remotes/displays, screen readers, tablets, forced deep Doze, two-hour runs, the historical renderer/focus ANR and customer/store-release gates remain open. This is an internal test build, not complete parity or customer-readiness certification.
