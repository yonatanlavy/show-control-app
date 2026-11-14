# Audition lifecycle · 24 October 2026

## Plan

The preceding turn made verified progress: Library windowing, keyboard usability, 977 tests and guarded restoration of its isolated fixtures. It also observed Android retaining an idle audition service/media session after Stop and editor exit. This pass corrects that lifecycle without changing show playback, library/media/defaults or GO/panic geometry.

1. Reuse Android's full native shutdown in the same command-queue turn as the preview ownership check. Resolve Stop only after teardown/detachment; duplicate stops join cleanup. Reject late audition preparation on a closing/destroyed owner. A main-show preparation that won queue admission remains untouched by preview Stop.
2. Cancel preview-only startup under the runtime lock, retaining the closing barrier until destruction. Do not cancel a show/diagnostic startup or allow a late preview to capture a newer show. Release failed auditions on both source platforms; preserve isolated error reporting and deliberate Retry. Apply the same completion-after-detachment rule to Android's existing failed-show preparation shutdown.
3. Exercise actual native runtime admission with deterministic startup/stop/prepare orderings, active/paused/natural-end/failed auditions, duplicate stops, deliberate fresh retry and protected main sessions. Verify software checks, Android compile/lint/build and the exact installed candidate using only original synthetic media. Do not make provider requests or edit the user's library.
4. Perform the scoped crit audit, promote only this delta, retain immutable evidence and deliver an internal APK. iOS/Xcode, acoustic output, physical devices/manufacturer behavior and long runs remain open; do not claim that an emulator proves customer readiness.

## Evidence

### Implementation and software checks

Android preview Stop now selects full teardown on the same command turn that checks audition ownership. It closes admission before releasing resources, waits for service destruction/runtime detachment, and joins duplicate stops. A main preparation that wins the queue first is preserved. Preview-only startup cancellation closes runtime admission under its ownership lock; main/diagnostic startups remain protected. Work arriving at a closing/destroyed audition owner is rejected, including a closed command queue. Failed auditions and failed main preparation return their errors after native teardown so deliberate Retry gets a fresh owner. A failed player stop or session release still attempts emergency mute and service termination.

iOS already performs synchronous full preview Stop. Its failed-audition path now also releases the engine/session/remote handlers before returning the error, with its main-show guard outside that cleanup. iOS is source-reviewed only on this Windows host; Xcode compilation and physical behavior remain unverified. No interface input, schema, defaults, library/media, dependency, permission, notification policy or UI layout changes.

Final software matrix: **977 tests in 65 suites**, type, lint, architecture, translation/native-copy parity for **776 messages across all ten languages**, and token checks pass. Forty-five existing React act warnings remain; no new warning was suppressed. Expo Doctor was not rerun. Seventeen additional native JVM scenarios compile the actual complete Android runtime and actual Stop/shutdown/startup-cancellation methods with controlled platform/player dependencies. They cover pre-creation cancellation, held startup, duplicate stops, main/diagnostic protection, both queue orderings, delayed completion, fresh Retry, stale owners and injected cleanup failures. This is explicit source-level evidence, not a complete Android service or device test.

Strict Android `:show-audio:lintRelease` reports **No issues found** and release assembly succeeds (build receipt `674e0f1c-0401-4f51-a19c-fc807d2ee7ce`, 2m57s). Final check evidence uses `.native-check/preview-lifecycle-final-*`; actual-source native receipts are in `.native-check/preview-lifecycle-native-final/`. Earlier software/native receipts are retained separately.

### Installed regression

Device: isolated `ShowControl_QA_API35`, API 35, hidden, host audio disabled. A separate same-test-signer instrument in `tools/preview-lifecycle-probe/` creates one uniquely named original two-second PCM file outside the library and temporary native snapshots at −96 dB. It has no product hook/network permission and writes no library row or setting. All original library tables/preferences/controller records are hashed opaquely before and after; no original media or provider keys are read.

The instrument first ran against the preceding immutable Large Libraries v3 APK. After Idle Stop passed, the paused-audition Stop case failed with **Native owner remains after completion**, reproducing the original bug. Its finally cleanup released that owner, removed only its own checksum-verified file and reported originals unchanged. This is an intentionally failing baseline, not a passed check.

The final APK passes all **12 installed cases**, repeated after the QA audit correction:

| Case | Verified native result |
| --- | --- |
| Idle Stop | No service created. |
| Paused Stop | Callback waits until owner destruction and detachment. |
| Active Stop | Native audition service releases. |
| Natural-end Stop | The idle owner releases after single-pass completion. |
| Duplicate Stop | Both callbacks finish against the destroyed owner. |
| Stop before new preparation | Both queued main and audition requests reject with OWNER_SHUTTING_DOWN. |
| Fresh main Retry | A new owner prepares silently after teardown. |
| Main preparation before Stop | The newly admitted main owner survives; after actual VOICE_START, preview Stop also leaves its main voice intact. |
| Stale destroyed owner | Direct stale audition/main preparations reject instead of hanging on a closed queue. |
| Invalid audition media | PREVIEW_FAILED is returned with no remaining service/startup owner. |
| Retry after audition failure | Fresh paused audition and Stop succeed. |
| Failed main preparation | INVALID_SNAPSHOT returns after detachment; a fresh audition then succeeds. |

The final audited instrument run is identified by the full UUID in `.native-check/preview-probe-audited-active.json`; its terminal receipt, case list, actual target checksum, `originalsUnchanged=true` and `ownedFilesRemoved=true` are retained in the corresponding `preview-probe-<UUID>` directory. The helper is uninstalled afterward.

Ordinary UI was also checked without instrumentation: the preserved original synthetic song opens silently, explicit Play preview advances the native cursor, and Stop after completion resets its cursor and removes service/notification/media ownership. Back to playlist retains that absence. Preparing ordinary Rehearsal afterward is silent at zero with zero voices and foreground ID 1001, ongoing/only-alert-once notification flags and native paused state; deliberate Exit clears all ownership. This is native-state evidence with no acoustic claim. The existing denied general-notification permission means these records do not prove shade visibility.

### Audit and artifact

The single scoped crit audit checked source ownership, callbacks, failed preparation, test isolation and original-data cleanup. It caught an unsupported `dumpsys activity instrumentation` command in the older helper pattern. All three affected helper wrappers now require the supported process-state header and reject any active-instrumentation observation or unavailable output. The final run actually observed live instrumentation through `dumpsys activity processes`; original and final terminal handles were inspected before starting another operation. [Android's process dump](https://github.com/aosp-mirror/platform_frameworks_base/blob/android15-release/services/core/java/com/android/server/am/ProcessList.java) delegates active-instrumentation reporting to ActivityManagerService. Syntax checks pass for all five affected PowerShell tools. Other product sources and unrelated authoring work are preserved.

`Show-Control-Audition-Cleanup-2026-10-24.apk`, **154,776,597 bytes**, SHA-256 `3615CD9CE00BC2D11209C70BFD13409C565A59B38F63653B42C1B5FDADBAD697`. Signature verification passes using the existing internal/test certificate and provisional package identity; arm64-v8a/x86_64 remain. Relative to Large Libraries v3, **71 of 72 native/DEX/manifest/resource payloads are unchanged; only classes3.dex changes**. The exact packaged UI bundle remains `831D56D6EF81D115B9F42EB96CD1CE20335CD463B730D7E30B0D216CBC121CCB`, so GO/panic and all visual geometry are unchanged. Installed probes verify this exact APK checksum. No AI/provider requests were made.

Final device policy remains font 1.0, portrait 0/auto 1, DND/Saver 0, standby 10, no Doze exemption, AC/100%, heat override off and the exact original denied-notification flags. English/Dark Blue and the original one-cue selection remain. No ANR has occurred since this boot; the historical ANR investigation remains open. The helper is uninstalled, all owned synthetic files are removed, and 15 device evidence files were deleted only after retaining local copies. The idle emulator's serial and owned processes are verified absent. Source, promoted production and immutable APK hashes still match after cleanup.

The scoped crit loop found no remaining critical/high issue in this delta after the teardown and QA-guard corrections. Physical iOS/Android, Xcode, acoustic output, manufacturer policy variants, named remotes/Flic, long runs and the historical ANR remain open. The active customer-readiness goal is not complete; an internal emulator-tested APK does not establish readiness for 1,000 customers.
