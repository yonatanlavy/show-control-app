# Background readiness · 17 October 2026

## Plan

Help performers reduce premature closure while respecting platform lifecycle and explicit user termination. Preserve offline playback, immutable runs, silent process-death recovery, saved library/settings and fixed GO/panic geometry. No AI, dependencies, direct battery-exemption request, boot restart, watchdog restart or automatic OS-setting changes.

1. Android: preserve a prepared show when its Recents task is removed; keep previews/diagnostics scoped and disposable. Add an immutable notification shortcut to controls, ongoing foreground media notification with truthful battery advisory, and read-only power/restriction/notification/service status. Public settings actions are deliberate and report fallback/failure truthfully.
2. Runtime: detach a destroyed interface without stopping the prepared native owner; restore the same process's immutable native snapshot/state without dispatching or replaying playback. A dead process has no native session and always reopens silent. Keep the visible critical screen awake, releasing that screen flag outside the session/foreground.
3. UI: shared Background readiness card in Preflight and Settings, focused status/error/refresh/settings actions and help in all ten languages. No Run overlays or control movement. Settings changes never count as verified until re-read.
4. iOS: report observable Low Power Mode and configured background-audio guidance. No fake persistent notification or silent keepalive. Native snapshot reattachment is read-only; force quit never restarts audio.
5. Verify status/null/error/race cases, notification and Recents/lock/background/stop-app behavior on Android, source-review iOS, run required automated/build checks, audit only this turn's changes, promote verified files and deliver a new internal APK.

## Ownership and compatibility

Android agent owns its native module/service/helpers and lifecycle regression. Runtime agent owns session/engine contracts, AppProvider teardown/adoption, screen-awake hook and their tests. UI/iOS agent owns the shared panel/tests, translations/native copy and iOS status/snapshot bridge. Root owns the TypeScript native facade/platform adapter, screen/help integration and delivery. Capture baselines under `.native-check/background-baseline`; preserve unrelated dirty state. No persisted cue/library schema change.

## Platform limits and sources

Battery exclusion is not a promise of survival. Separate Doze exemption, explicit background restriction, power saver, notification permission/channel and foreground-service state; unknown reads stay unknown. Media-session notifications are exempt from Android notification permission denial, so denial does not block shows. The OS's Stop/Force stop and process termination always win. No background setting is changed automatically.

Primary references: [Media3 background playback](https://developer.android.com/media/media3/session/background-playback), [notification permission exemption](https://developer.android.com/develop/ui/views/notifications/notification-permission), [Doze settings](https://developer.android.com/training/monitoring-device-state/doze-standby), [system Stop](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping), [Apple background modes](https://developer.apple.com/documentation/xcode/configuring-background-execution-modes).

## Evidence

Implemented in 45 scoped source/test/document files. Existing sources were baselined separately from the pre-existing dirty tree and promoted explicitly to `C:/dev/personal/show-control-app`; original files remain recoverable. No manifest permissions, dependencies, stored show schema, media files, API keys or provider requests changed.

Android explicitly registers its Media3 session, publishes a quiet ongoing foreground notification, and returns to controls with an immutable launcher PendingIntent. Notification metadata warns about observed battery restrictions; recovery takes priority. The service remains `START_NOT_STICKY`, retains prepared performance/rehearsal sessions on task removal, and disposes previews/diagnostics. Native status reads isolate unavailable observations and do not start audio. Settings are whitelisted public intents with truthful fallback results and native startup/armed admission checks.

Interface reattachment reads the immutable snapshot, authoritative state and command-ID watermark atomically. Bounded canonical validation, monotonic IDs, event ordering, pending-startup rejection and retained critical recovery prevent false-idle states and replay. A dead process has no prepared owner. Initial inspection exposes Recovery's Stop/Panic and then restores the requested idle route or the actual adopted session. Visible critical controls hold a scoped screen-awake tag, released on background/exit. Armed foreground HID capture reattaches without changing bindings or replaying inputs.

The shared preparation card has independent measurements, actionable warnings, local retry/fallback feedback and foreground rechecks. Long battery/channel values stack; narrow screens and large text stack all rows. RunScreen source is unchanged from the turn baseline, including GO/panic geometry.

### Automated acceptance

Final type, lint, unit/architecture, translation and token checks pass: **615 tests / 52 suites**, including **48 added JavaScript tests**; translation validation covers **729 messages in ten languages** and six Android audio strings per language. Android release assembly passes with an embedded bundle and arm64-v8a/x86_64. Production audio/controller Kotlin compilation and the new background policy regression pass, along with existing interruption-gate, system-policy and PCM regressions. Dependencies are unchanged; Expo Doctor was not rerun in this turn (previous recorded result 21/21).

The targeted regressions cover these edge cases:

1. Unavailable and malformed power/notification readings remain unknown.
2. Native read failures offer a local retry.
3. Unavailable settings pages report their actual fallback.
4. Unknown settings targets cannot launch arbitrary intents.
5. Armed actions and retained retries cannot open device settings.
6. General notification denial remains advisory for exempt media controls.
7. Unsupported platforms do not request Android permissions.
8. Outdated status reads cannot replace newer foreground readings.
9. Repeated settings taps cannot duplicate a pending action.
10. Large text and narrow layouts cannot squeeze a long status caption.
11. Both performance and rehearsal adopt their original immutable snapshots.
12. A null native owner opens idle without preparing or dispatching audio.
13. Malformed and oversized snapshot JSON fails silent.
14. Invalid cue data fails canonical validation.
15. Mismatched show/revision/purpose refuses adoption.
16. Invalid command watermarks refuse adoption.
17. A failed silent shutdown keeps the critical recovery gate closed.
18. Stop/Panic during inspection invalidates late adoption results.
19. Detachment removes listeners and cancels queued JavaScript work.
20. A replacement router never reuses or lowers command IDs.
21. Equal-time stale generic state cannot rewind authoritative native state.
22. Newer interruption events preserve the recovery latch.
23. Cancelling preparation before native admission releases the old interface gate.
24. Native preparation finishing after interface teardown is retained.
25. Late controller setup cannot shut down a surviving prepared show.
26. An obsolete provider completion cannot unlock a newer interface.
27. A pending native startup cannot be falsely reported as an empty owner.
28. Preview, shutdown and destroyed owners do not survive task removal as shows.
29. Recovery notification copy outranks a simultaneous battery warning.
30. Late screen-awake activation cannot release a newer foreground tag.
31. Confirmed empty startup returns to Preflight, Settings or Library as requested.
32. Adopted interrupted/unknown sessions keep accessible Recovery controls.

### Installed Android evidence

Android 15/API 35 x86_64 emulator, AVD `Medium_Phone_API_35`, existing `app.showcontrol.working` installation and QA16 library retained. No AI features or provider requests were used. Cold start on the corrected APK returned to requested Preflight with no native audio service. Battery settings opened and foreground return re-read status; an emulator-only Doze exclusion was observed positively and then explicitly removed and verified absent. General notification permission remained denied, while Media3 still published the foreground media notification with its battery advisory.

The native show service remained foreground after removing the confirmed Show Control task from Recents. Task absence, unchanged process ID and paused reattachment were recorded. The notification shortcut returned to Ready without starting a song. The QA loop ran; background native media pause succeeded. Direct Android media-session pause while locked succeeded, and reopening retained paused native playback. Visible Run set `KEEP_SCREEN_ON`; after actual task dismissal `mHoldScreenWindow=null` confirmed release. System Stop terminated the native process/service, and relaunch opened Preflight without recreating audio. This is playback-state evidence: the emulator was started without audio output, so no acoustic quality or physical remote claim is made.

Continuous playback progress and the system media-card animation prevented idle-based UI dumps in two attempts. Direct native screenshots plus subsequent static paused-state readback were used. A shell-injected pause key while locked did not deliver; direct media-session dispatch did. Exact locked hardware-input behavior remains a physical-device gate. A large-text screenshot was inspected, but the requested landscape orientation was not established, so this is not a landscape acceptance pass. Font scale, automatic rotation, user rotation, DND, storage thresholds and the temporary battery exclusion were restored/verified; Show Control data was not wiped.

Lifecycle evidence was collected on the second candidate (`050A6A…`), followed by a one-line layout correction making the main readiness actions full-width. All source checks passed again, and the final artifact was installed: cold Settings navigation, the restored battery warning, status refresh and both complete button labels passed the visual/status smoke check. Native lifecycle source is identical between these two candidates.

### Platform limits

Emulator/source evidence does not certify physical audio, manufacturer battery policies, physical remotes, HDMI, iOS builds or long silent waits. Android's Stop/Force stop, low memory and OS shutdown can still terminate playback; no boot or watchdog restart is installed. Android 14+ system UI may allow notification dismissal. Battery exclusion reduces some restrictions, rather than guaranteeing survival.

iOS reports Low Power Mode and configured background audio and opens only its public app-settings page. Its engine remains module-owned: UI reattachment works while that native module survives; destroying it deliberately shuts down safely. It has no Android-style persistent notification or fake silent keepalive. Android external visuals also remain module-owned and safely black out if that module is destroyed; this pass does not claim seamless HDMI continuity across renderer destruction. Physical Android/iOS, exact remotes, OEM battery policies and extended background/lock testing remain release gates.

Final APK: `Show-Control-Background-2026-10-17.apk`, 154,638,313 bytes, SHA-256 `283687A53102ADB65194FC5E7ADFA1908A09A466AF90923B2BDEAE5877CD5E6F`. Internal build signed with the existing test certificate; not a store release. One packaging attempt exhausted the reused 2 GiB Gradle heap; a fresh single-use process with a temporary 4 GiB limit and one worker built successfully. No project memory settings were changed.
