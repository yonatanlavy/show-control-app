# Background protection observations · 24 October 2026

## Plan

Keep the existing native prepared-show foreground service, immediate quiet ongoing notification, power/heat/battery warnings, idle repair guidance and deliberate recovery. Never start an idle service, evade user Stop/Force stop, request broad usage access, change OS settings automatically or restart audio.

1. Observe Android's own restricted standby category using the calling app's public API, separately from Doze exemption and explicit background restriction. Restricted standby joins the existing app-info repair when Doze exemption does not supersede it; relevant unavailable observations remain unknown. A known Doze exemption suppresses only the standby-category advisory, never explicit background restrictions or Battery Saver. Android versions before the restricted category report it unsupported/false.
2. Distinguish a posted show-notification record from native foreground ownership. Query only this app's active notifications and require the expected untagged foreground-service record. A missing record warns only when foreground ownership is reported active. A posted record cannot certify lock-screen/shade visibility, so include manual-check guidance and respect user dismissal.
3. Refresh native observations on notification channel/group changes as well as existing power, battery, thermal and polling signals. Observations never dispatch transport or create replacement-notification loops. Preserve fixed GO/panic geometry and all existing library/media/settings.
4. Add normalization, combined-policy, unknown/legacy, permission and lifecycle regressions. Verify type/lint/unit/architecture/translation/token checks, Android compile/lint/release build and scoped audit. Promote only this pass and record installed/emulator checks separately from iOS/physical/manufacturer/long-run gates.

## Platform references

- [Calling-app standby observation](https://developer.android.com/reference/android/app/usage/UsageStatsManager#getAppStandbyBucket()) does not require querying other apps.
- [Standby exemptions](https://developer.android.com/topic/performance/appstandby) explain why a known Doze exemption supersedes the standby-category warning. Explicit background restrictions remain a separate observation.
- [Active notification records](https://developer.android.com/reference/android/app/NotificationManager#getActiveNotifications()) describe posted, undismissed records rather than what a user can physically see.
- [Android 14 ongoing-notification dismissal](https://developer.android.com/about/versions/14/behavior-changes-all#non-dismissable-notifications) prevents an honest promise of an undismissable notice. User/system termination remains possible.

## Evidence

Existing background-protection evidence is documented separately in background-protection-actions-2026-10-24.md and background-quick-repairs-2026-10-24.md. This pass retains that foreground service and notification lifetime rather than starting a service while idle.

The final authoring software matrix passes **960 tests in 64 suites**, type, lint, architecture, translation/native-copy parity for **776 messages in all ten languages**, and design-token checks. Nineteen added scenarios cover standby/exemption interaction, combined restrictions, native foreground ownership versus a posted notification record, missing/unknown/legacy readings, duplicate advisory suppression, idle absence, prepared-session repair blocking and iOS separation. Standalone native background/failure regressions also pass, including pre-31 APIs, unknown/future buckets, exemption priority, recovery priority, teardown and concurrent failure races. The existing 45 React act warnings remain; Expo Doctor was not rerun.

The single scoped crit audit caught and corrected an overly broad standby warning: Android Doze exemption also exempts standby-bucket restrictions. The final tests ensure that exemption suppresses only that advisory. The audit also corrected one test's exact-text assertion to include the compact list's visible bullet; this was a test assertion failure, not a hidden product warning. Earlier run receipts are retained. No dependency, permission, persisted schema, media, controller mapping, native command semantics or GO/panic layout changes are included.

Physical devices/manufacturer power managers, iOS/Xcode, screen readers, tablets, deep Doze and two-hour runs remain separate gates. A notification or battery exemption cannot prevent explicit user Stop/Force stop, system termination or shutdown. No AI provider requests were made.

## Final artifact

`Show-Control-Background-Checks-2026-10-24-v2.apk`, **154,772,341 bytes**, SHA-256 `60D6F24C83DCD509BE9E3B9819D4E78A035C234AD937481368CD748FCD08E205`. Installed checksum matches. Internal/test signing is verified; provisional identity and arm64-v8a/x86_64 remain. This is an internal candidate, not customer/store certification.

The final promoted candidate independently passes all **960 tests in 64 suites** and type checking. Strict Android `:show-audio:lintRelease` reports **No issues found** and release assembly succeeds. Source check receipt `74efa50b-a45c-4892-9675-d13ee5c53f87` and native build receipt `48092dee-7517-4574-badb-74bb48779c37` identify the final frozen source. Eleven production/test files were promoted; unrelated authoring work, including pending collection-list changes, was preserved and excluded.

All four changed production Metro sources match their frozen contents; generated and packaged bundle SHA-256 is `35B68A19EF6EE6A4991068149CE68093C81D4769240C55E52FB367B207EFFB74`. Relative to Audience Rendering, all **66 native-library/resource/manifest payloads** are unchanged and one DEX changes for the protection observations. The new native field/broadcast markers are packaged. Earlier `Background-Checks` and failed test receipts remain historical and are superseded by this v2 artifact.

## Installed observations

Test device: isolated `ShowControl_QA_API35`, Android API 35, host audio disabled. UI/native observations are emulator evidence, not acoustic, physical or long-run verification.

The earlier candidate establishes the unchanged new-copy layout in English and Hebrew RTL, 150% English text and Hebrew landscape. Actual restricted bucket 45 produced the standby warning and a 48-dp app-info action; returning without changing policy did not imply success. Idle readings distinguished no running service, no foreground ownership and no posted show notification without creating a missing-notification alarm. The new notification guidance and accessible labels remain readable after scrolling. These layout checks predate the exemption correction; final-candidate lifecycle and policy checks are recorded separately below.

| Final v2 scenario | Observed result |
| --- | --- |
| Exemption interaction | Temporarily exempting the test app produced Android bucket 5 and a fresh Device settings checked summary. Attempting to force restricted while exempt still returned 5; the bucket-45/exemption combination is covered by deterministic regressions, not claimed as an installed observation. |
| Restore before preparation | Temporary exemption removed and verified absent. Standby restored to active. The initial unquoted removal command was rejected; the corrected quoted command succeeded before any preparation. |
| Prepared Ready | Silent at position zero; same original one-cue show. Foreground service ID 1001 and quiet ongoing/only-alert-once/no-clear notification with the battery-settings warning. General notifications temporarily allowed on this test device. |
| Locked Ready | Same PID 4938, foreground service and notification record after **66.7 seconds asleep**; position remains zero. No battery exemption or forced deep Doze was used during this interval. |
| Native locked commands | NEXT starts the synthetic cue; Pause retains **1,116 ms**. Foreground return shows Paused/Resume and the corresponding position without replay. This is native-state evidence with host audio disabled. |
| Safety geometry/panic | Ready and Paused GO/Resume remain `[42,1582][1038,1855]`; panic remains `[556,1403][1038,1550]`. Touch panic enters Recovery and resets native position to zero. |
| Android explicit Stop/relaunch | Android Stop removes process, service, notification and media ownership. Cold relaunch returns to the library without native session, service or automatic audio. |
| Cleanup | Original English/Dark Blue and original selected one-cue show retained. Notification denial and exact original flags restored; font 1.0, rotation 0/auto 1, standby 10 and no exemption verified. Battery remains AC/100, heat override off. No ANR reported since this boot; the historical ANR is not declared fixed. |

Evidence is retained under `.native-check/protection-observations-*`, `.native-check/protection-v2-protection-observations-*` and `.native-check/protection-pressure-protection-observations-*`. The final source, packaged source-map and native markers match; the single scoped crit audit and component review found no remaining critical/high issue in this delta after the exemption correction. Only owned device XML/PNG evidence was removed after retaining local copies; the idle task emulator is verified closed with its serial and owned processes absent. Both-platform physical lifecycle, exact hardware, manufacturer-specific behavior, iOS compilation, genuine missing-record fault injection, screen-reader operation, tablet coverage and long runs remain unverified. No claim of indestructible persistence or complete parity is made.
