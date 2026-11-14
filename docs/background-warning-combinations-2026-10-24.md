# Combined background warnings · 24 October 2026

## Plan

The owner asked for practical protection against premature app closure. The existing native prepared-show foreground service, quiet ongoing notification, battery/thermal observations, setup repairs and deliberate silent recovery remain in place. This pass fixes a specific presentation gap: heat, low battery or recovery currently replaces the battery-restriction warning in the only ongoing notice.

1. Keep the existing urgent headline and include every independent observed warning in that same notification. Known restrictions and unavailable readings remain distinct; recovery stays first. Reuse all ten native translations and keep the notice quiet and free of private show data.
2. Treat the full warning content as part of native notification update identity, so a secondary risk can change while the headline stays the same. Preserve command epochs, actions, foreground lifetime, touch geometry and native playback ownership.
3. Exercise combinations, warning removal and unknown values using native policy regressions. Run software/native checks against the exact promoted candidate, retaining unrelated unfinished Rehearsal work in the authoring checkout. Inspect the installed Android notification under combined simulated conditions, lock and recovery without AI/provider calls or user media changes.

## Limits

Notification expansion and media-card presentation belong to Android. A posted foreground notification is not proof of visibility or process survival. User Stop/Force stop, system termination and manufacturer policies remain possible; settings and permission changes stay deliberate. iOS, physical devices/OEM behavior, acoustic output, exact remotes, external displays and long runs retain their existing validation gates.

## Delivered change

Android now builds one ordered set of protection messages: recovery, heat, low charge, known battery restrictions and unavailable protection readings. Normal prepared/running text appears only when no warning applies. The primary media headline keeps its previous priority; the full copy participates in notification identity and supplies the expanded notice and metadata subtitle. Removing a secondary risk updates that copy even when its headline is unchanged. The existing foreground lifetime, immediate-display request, quiet/ongoing/only-alert-once flags, native command epochs and private return action are preserved. No new notification, permission, dependency, persisted schema, provider call or playback behavior was added.

## Automated and build evidence

The promoted candidate passes **1,018 tests in 66 suites**, type, lint, architecture, **776-message/native-copy parity in all ten languages**, token checks and strict Android native lint/release compilation. Native background/transport-failure regressions pass, including fourteen new warning combinations, localized copy order, deduplication and secondary-risk removal. The initial missing-capability regression compile is retained as `background-combinations-red.log`; it is not a failing-before behavioral test of the old formatter. The ordinary previous-APK observation below establishes the actual missing-warning behavior.

The first full software run, concurrent with compilation, passed 1,017 tests and timed out one unchanged Rehearsal test at its five-second deadline. After compilation ended, the same-timeout focused suite passed all 32 tests and the full suite passed all 1,018. No test deadline or product code was changed to obtain that pass. Logs retain 46 existing React `act` warnings; they are not warning-free. Expo Doctor was not rerun for this native-copy-only change. Unfinished authoring-only Rehearsal tests and measurement work remain preserved and excluded from promotion.

Build `375f72be-e21f-48bc-ae82-947a39613b75` completed successfully; `:show-audio:lintRelease` reports **No issues found**. The immutable internal APK is `Show-Control-Background-Warnings-2026-10-24.apk`, **154,780,481 bytes**, SHA-256 `8FB9ED49BEE1F9155AA9F750B0AB144E847141D75E6B9F9C6D24607DAEB2AD92`. The pulled installed APK matches. It retains the internal/test certificate, provisional identity, arm64-v8a and x86_64. Only `classes3.dex` changes among the 72 DEX/native/manifest/resource payloads. The other 71 payloads and the entire JS/UI bundle are unchanged from Library Recovery; bundle SHA-256 is `ACC6632B0BAC13D8FB6C354C273B49F0011E35C69226357A644EE1EEE9234132`.

## Installed observations

Isolated API-35 device `ShowControl_LibraryLoad_QA`, no host audio, existing synthetic fixture only. These are UI/native-state observations, not acoustic, manufacturer-phone or long-run evidence.

| Scenario | Observed result |
| --- | --- |
| Previous exact Library Recovery APK, heat + 5% discharging + optimized battery | Its one notice contains only the heat warning. |
| Updated exact APK, same conditions | The same ongoing ID 1001 contains all three warnings. Native Ready position remains zero. |
| Actual notification expansion | All three warning paragraphs and Previous / GO / Stop all are visibly present. Android truncates the collapsed summary; users expand it for details. |
| Locked, no Doze exemption | Same PID 4756, prepared service, ongoing quiet notice and zero position after a measured **63.38 seconds**. This was not forced deep Doze. |
| Secondary risk changes while locked | Temporarily adding the fixture's exemption removes only the battery-restriction paragraph. Heat remains the headline and low charge remains visible; PID and position stay unchanged. This observation is not a measured notification-update deadline. |
| Restore original pressure/policy | Removing the exemption and resetting charge/heat leaves the battery-restriction warning as expected. |
| Fixed controls | Before/after GO `[32,2033][1049,2306]`, Fade all `[551,1875][1049,2001]`, Stop all `[32,1875][530,2001]` match exactly. The complete JS/UI bundle is also identical. |
| Fade all from silent Ready | No unintended playback; Ready remains at zero. This does not establish recovery behavior during audible playback. Recovery-first combined copy is covered by the native policy regressions. |
| Normal Exit | Service, notice and media ownership disappear. |
| Explicit Android Stop and relaunch | Process/service/notice/media owner disappear. Cold relaunch opens the existing library without recreating playback or a prepared service. |
| Synthetic ringing-call attempt | Emulator command accepted, but the observed audio mode stayed `MODE_NORMAL`. No interruption was established, so this attempt is **not a passing call-recovery test**. Real calls/alarms/focus recovery retain their device gate. |
| Cleanup | Original synthetic selection, English/Purple Night, notification denial/flags, no battery exemption, AC/100, thermal override off, Saver/DND 0, font 1.0 and rotation 0/auto 1 restored. User media and the separate original emulator library were untouched. |

Receipts remain under `.native-check/background-combinations-*` and `.native-check/library-load-ui-bg-combo-*`: scoped baselines/source hashes, first and final checks, native regressions, build/signature/payload/installed identity, actual expanded screenshot, lifecycle observations and cleanup. The single current-turn `crit` review audited the native copy, notification-key callers, priority, privacy, ownership and scoped promotion. No known critical/high issue remains in this delta.

The foreground notice reduces avoidable restrictions; [Android allows users to stop foreground-service apps](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping). [Manufacturer restrictions vary](https://developer.android.com/topic/performance/background-optimization), and an exemption is not a survival guarantee. iOS/Xcode, physical audio/calls, OEM phones, exact remotes, external displays, screen readers, forced deep Doze, two-hour runs, the historical renderer ANR and customer/store-release gates remain open. This internal APK is progress toward the broader quality goal, not a readiness claim for 1,000 customers.
