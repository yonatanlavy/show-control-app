# Background hardening · 23 October 2026

## Scope and execution plan

Reduce avoidable shutdowns with the existing native playback service and ongoing notification. Keep explicit OS termination authoritative, recovery silent, GO/panic fixed, and local show data unchanged. No AI/provider calls, new permissions, dependencies, watchdogs or boot restart.

1. Audit current background status, notification ownership, settings actions and preparation admission against the reliability contract.
2. Supervise native transport failure and include observed Power Saver in notification advisories, preserving recovery priority.
3. Block preparation throughout device permission/settings interactions, without replacing unrelated task retries. Keep notification repairs visible and explain idle service state.
4. Verify lifecycle/race/error regressions, types, lint, architecture, translations, tokens and Android compilation. Audit only this turn's files, then promote the verified source and package an internal APK.

## Evidence boundaries

The earlier background implementation and its emulator evidence are recorded in [17 October's report](background-readiness-2026-10-17.md). They are not new physical-device evidence. Android may terminate services, and Android 14+ may let users dismiss ongoing notifications. Battery exclusion reduces restrictions; it cannot guarantee survival. iOS has no Android-style persistent notification.

Current source findings include the permission-dialog/preparation race, hidden notification repair actions, unexplained normal idle-service readings, unhandled native transport-player failure, and missing Power Saver notification advice. This report will record completed checks and limitations after validation.

## Implemented behavior

Device actions acquire a process-owned lease before calling the OS. Preparation checks that lease synchronously and requires an active interface. The panel holds its outer settings lease until an observed return or deliberate recheck, while nested permission calls retain their own lease through completion. No unrelated task error, success message or Retry is owned by this lease. Foreground download reconciliation now preserves earlier task feedback and only surfaces its own failure when no earlier failure owns recovery.

Observed notification blocking has a direct repair action. General permission denial remains advisory because media notifications are exempt. Normal idle-service readings have an explanation. All new copy uses the ten-language catalogue and existing semantic components, with no Run layout or decorative-motion change.

The Android transport error listener latches a terminal failure, mutes/cancels playback, retains immutable Recovery identity, and permits only Stop/Panic until deliberate exit. Released-player callbacks and duplicate failures cannot poison another owner. Power Saver joins the existing battery advisory; recovery instructions outrank that advice. No restart policy was added.

The complete checks also exposed a download-history race. A poll captured before attachment could restore a ready row after SQL committed and native staging was removed. Completed items now retain Attached history, captured destination and local completion precedence over stale ready polls. Pending and retained old button callbacks cannot attach twice. Distinct jobs and native error/cancelled states remain independent.

## Automated acceptance and scope audit

The initial complete run recorded 639/641 passing tests in 53 suites. One legacy rehearsal case exceeded the five-second runner limit; its unchanged 16-test suite passes separately with a 30-second runner budget. The other failure exposed the download race described above. Corrected download tests use deferred commits, captured stale polls and fake timers rather than depending on polling luck. Final affected verification is recorded in the local evidence ledger.

Passing checks already include type, lint, architecture, token consistency, 734 messages/native OS copy in ten languages, both focused Kotlin suites and clean production audio/controller Kotlin compilation. Android packaging and installed observations are recorded below when complete. These checks are not physical-device proof.

Regression coverage includes unknown readings, failed reads, settings fallback, unknown targets, critical-session rejection, denied/rejected permission, same-frame preparation, overlapping/nested leases, interface replacement, return without prior departure, windowed-settings recheck, unmount during launch, obsolete read results, rapid taps, large-text stacking, Power Saver advice with battery exclusion, recovery priority, released-player identity, terminal safety-only admission, 100 concurrent duplicate-failure races, shutdown guards, prior import errors/Retry, retained success feedback, fresh reconciliation failure, stale download polls, post-commit old callbacks, independent new jobs, and native cancellation/error history. Actual transport error injection and extended locked/idle behavior remain pending.

Final audit covers only this pass's explicit file ledger and affected callers. The pre-existing dirty tree, media library, provider keys, dependencies, permissions and persisted show schema are preserved. No provider requests were made. iOS/Xcode, physical audio/HDMI/remotes, OEM battery behavior and two-hour runs remain recorded release gates.

## Final software/build evidence

All 643 unique current cases across 53 suites have passing evidence after replacing the two failed suites with their affected reruns; the raw initial failures remain retained. The final download/whole-workflow rerun passes 35/35 and rehearsal passes 16/16. Current full TypeScript, full lint plus affected-file lint, architecture, ten-language/native-copy parity and token checks pass. The native failure/policy suites and production Kotlin compilation pass. Expo Doctor was not rerun; dependencies and lockfile are unchanged.

Android release assembly passed with 1,040 tasks (75 executed), an embedded interface bundle and arm64-v8a/x86_64. The generated bundle source map matches the final background panel, provider, download panel and lease helper contents. All 21 scoped source/test/document files were explicitly promoted with matching hashes. The internal artifact retains the existing test certificate and provisional app identity; it is not a store/customer release.

APK signature and payload validation passed. `Show-Control-Background-Safety-2026-10-23.apk` is 154,651,549 bytes, SHA-256 `C2878C7CA4DF8E5DAF77C55DD9FF10B0168ECE27575EABE3F8678C54CA4823AD`. Update installation succeeded without wiping app data. Temporary emulator storage thresholds were restored to null/null before launch.

The loaded emulator initially reported a Pixel Launcher ANR; choosing Wait recovered the launcher. The installed background panel's battery advice, media-permission exemption, normal idle-service explanation and direct repair buttons are visually legible. The battery and notification Settings screens opened and returned to fresh readings without changing the existing choices; preparation remained excluded during these interactions. Existing Settings tab/theme labels show clipped secondary words on this Android rendering and remain a broader UI follow-up.

The subsequent warm `showcontrol://preflight` navigation produced a Show Control ANR at 15:01:06 UTC, before any preparation or GO. Android reported a 5,011 ms input-dispatch timeout for `FocusEvent(hasFocus=true)`. The actual app DropBox trace shows the main thread awaiting `RenderProxy::setStopped`, with RenderThread in `FrameCommitWrapper::onFrameCommit` awaiting ART thread coordination. JavaScript, native-module and Expo async queues were idle in the captured trace. Concurrent guest CPU/memory pressure and earlier launcher/Bluetooth failures do not establish the cause. This remains an unresolved app-visible rendering/navigation failure, not a passed check or a proven host-only issue. No speculative rendering workaround was applied.

Current installed acceptance is partial: idle guidance and external-settings round trips passed; silent preparation, ongoing-notification return, shortcut and force-stop/relaunch smoke checks were not completed after the ANR. The app was force-stopped without wiping data. Font, rotation, DND, storage thresholds, battery exclusion and notification preferences were restored or left at their recorded baseline. The APK is available for internal investigation only; this pass does not claim complete interface/customer readiness. Physical audio, OEM restrictions and long-idle evidence remain pending.

Android platform references: [foreground services](https://developer.android.com/develop/background-work/services/fgs), [background restrictions](https://developer.android.com/topic/performance/background-optimization) and [media playback services](https://developer.android.com/media/media3/session/background-playback). These support a user-visible playback service and truthful battery guidance; they do not promise immunity from OS termination.
