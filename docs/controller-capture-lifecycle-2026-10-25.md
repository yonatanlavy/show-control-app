# Native keyboard capture lifecycle

## Plan

E-71 made verified progress on typing safety. Current source and the prior readiness record already establish a five-second native incoming-readiness timeout, so this pass targets a newly identified capture race instead: queued stop/suspend cleanup can detach a newer keyboard capture. Native first-responder/typing protection, media/Flic independence, offline operation and fixed GO/panic positions remain required.

1. Reproduce stale cleanup against the actual Android callback using controlled SDK scheduling, then A/B test the immutable previous and updated APKs with the same separate native main-queue probe.
2. Add matching bounded native capture generations. Old setup, cleanup and keyboard callbacks cannot adopt or remove a newer capture. Repeated active setup preserves held/typing state; genuine stop/suspend/reconnect resets it deliberately. Keep locks short and free of UI/platform/runtime calls.
3. On iOS, preserve current key state across same-keyboard reattachment, reject callbacks from old handlers and reattach any remaining coalesced keyboard after disconnect. Keep source and actual iOS build/device evidence distinct.
4. Run software/native checks, strict Android build/lint, installed normal controls and cleanup, then one project crit loop and scoped promotion. No audio timing, schema, profile, media, provider, permission or UI layout change.

## Implemented and reviewed

The actual previous Android callback fails the controlled SDK regression with “Old stop cleanup detached a newer capture.” Capture instances now retain a short generation lease for setup, stop, suspension and callbacks. A late cleanup cannot remove the newer attachment. Pending setup does not advertise attached health; a successful main-queue installation publishes a fresh health event. Same-window active setup preserves the held/typing latch rather than turning a held key into a fresh press. Native media and Flic paths are unchanged.

The single current-turn crit loop caught an overstrict callback-head check in the first fix: a legitimate Window.Callback decorator could no longer forward input. That case was reproduced, covered and corrected; teardown also preserves a foreign callback owner. Old callback generations remain rejected. iOS has matching generation source, same-keyboard state preservation and remaining-coalesced-keyboard reattachment after disconnect. Its Swift tests and framework integration have not been compiled or executed on this Windows host.

Android main-queue behavior is grounded in the public [Activity.runOnUiThread contract](https://developer.android.com/reference/android/app/Activity#runOnUiThread(java.lang.Runnable)): a main-thread call runs inline while previously posted Handler cleanup remains queued. This is per-capture-instance ownership. It does not certify process-wide cross-module teardown, exact physical HID behavior or background keyboard delivery.

## Software and packaging evidence

- Final full checks pass: **1,249 tests / 73 suites**, types, zero-warning ESLint, architecture, **801 messages/native copy in ten languages**, generated tokens and native background/work policies.
- Actual Android callback SDK fixtures pass the stop/restart, suspend/restart, obsolete setup, obsolete callback, held typing, foreign-decorator and cleanup cases. The native lifetime matrix passes **80 lifecycle scenarios and 1,640 active reattachments**; the existing typing gate passes **128 scenarios** plus overflow/release/reset.
- The first shared run exposed a nondeterministic older background-panel test. Its fixture now explicitly defers the return observation, asserts that the memory warning remains while pending, then resolves it and asserts battery restrictions remain. The focused **85 panel tests** and two subsequent full runs pass. This is a test-fixture correction, not a claim of a production memory-read defect.
- Strict Android audio/controller/commerce release lint and release assembly pass offline in **3m 6s**. All **66 native library/manifest/resource payloads** and the JavaScript bundle match E-71. DEX contains the new lifetime/request/health markers. The separate QA helper is absent from the app.
- Seventeen production protection sources match the E-70 final ledger; Run, primitives and Rehearsal retain their E-69 hashes. Existing ongoing quiet notification, native wake/task-removal policy, battery/standby/Saver/notification/heat/memory advisories and explicit settings repairs remain present. No permission, dependency, persisted schema, profile, song, provider or layout change was introduced.

Internal/test APK: `Show-Control-Controller-Lifecycle-2026-10-25.apk`, **154,872,057 bytes**, SHA-256 `1FDA423803226780BEDEAB247F70A17C4B86254BD7AD151E95EA00DD4E781845`. JavaScript bundle SHA-256 `F5282958357B9E43F86AD83FF69CEDFC8E3539DCAAD062FDC517E2B9735649E0`. Verified existing internal/test certificate; provisional `app.showcontrol.working`, 0.1.0/code 1, arm64/x86_64. This is not a store release.

## Installed verification

Owned API-35 `ShowControl_LibraryLoad_QA`, `emulator-5564`, preserved synthetic library. Exact installed base-APK hashes match both immutable artifacts. The **same** separate main-queue helper binary, SHA-256 `53E6204A7CDCB6181E1939A19CACA88D04D45C828E71D924B9CC26C59849F5DC`, establishes the A/B result:

| Case | E-71 previous APK | Updated APK |
| --- | --- | --- |
| Stop→Start on one real UI turn, then drain queued cleanup | Listening lost | Listening retained |
| Suspend→Start on one real UI turn, then drain queued cleanup | Listening lost | Listening retained |
| Final explicit stop | Confirmed | Confirmed |
| Original Window.Callback restored | Confirmed | Confirmed |
| Instrumentation disposition | 1, expected regression with both specific false flags and no error | 0, all required flags true |
| Profile changes / transport commands / audio preparations | 0 / 0 / 0 | 0 / 0 / 0 |

The existing separate native focus/typing helper also passes against the new installed APK: suppressed typing/held events, then **3 isolated command broadcasts / 6 raw down-up events**, profile restored and zero actual audio preparations. This exercises native synthetic focus/admission, not physical keyboard delivery.

Ordinary silent Rehearsal preparation shows the preserved 1,200-song fixture, Ready, source zero and **0 / 8** active sounds. With a temporary QA notification grant, native foreground ID **1001** is mediaPlayback with ongoing/only-alert-once/no-clear/foreground flags, importance **2**, and null sound/vibration. The real nonexempt battery warning reads “Battery settings may interrupt your show · Tap to review controls.” GO `[32,2033][1049,2306]`, Stop `[32,1875][530,2001]`, Fade `[551,1875][1049,2001]` and Exit `[691,105][1038,231]` match E-71.

The same PID **3814** and foreground owner remain after **93.060 seconds** locked, with Android `mWakefulness=Asleep`. While locked, native media NEXT followed by Pause yields PAUSED near 0.9 seconds; visible foreground return remains Paused and retains the exact safety bounds. Native Play/Pause advances deliberately to **2,026 ms**. Touch Fade clears the displayed active sounds to **0 / 8**. These are emulator/native state observations, not acoustic or two-hour proof.

Android's public `cmd activity stop-app` removes the process and audio service. A deliberate cold launcher return opens Your shows with the original selected synthetic show and no audio/voice service. There is no automatic audible restart. The temporary notification grant is revoked and the exact original denied flags restored; font 1.0, Saver 0 and DND 0 are unchanged. Nine exact owned remote files and only the two QA helpers are removed; local receipts/library remain. The owned AVD is shut down. No ANR occurred in this boot; the older ANR remains unresolved.

One QA observation attempt failed before issuing controls because PowerShell had already parsed the timestamp; the final record uses an explicit DateTimeOffset conversion. Only `capture-lifecycle-locked-result.json` supplies the accepted measured duration. Old-APK instrumentation code 1 is accepted only with both expected lost-listening flags, confirmed cleanup/restoration and no error; it is not a product crash. Local evidence is retained under `.native-check/capture-lifecycle-*`; the separate [main-queue probe](../tools/capture-lifecycle-probe/README.md) is never shipped.

The single project crit loop reviewed the scoped baseline/delta, source callers, state-only locks, main-queue leases, health timing, callback composition, typing preservation, unchanged media/Flic/protection paths, test-fixture correction, exact artifact and cleanup. No known critical/high finding remains in this delta. All unrelated authored changes and music are preserved. No AI/provider request or store transaction was made.

## Remaining gates

Customer acceptance remains open: the historical Android focus ANR, iOS/Xcode, physical/OEM power behavior, actual calls/audio routes/HDMI, exact remote/Flic hardware and licensing, accessibility, long shows, privacy/store and customer rollout. No observed absence of a freeze closes the historical ANR. Android user Stop/Force stop, shutdown, memory pressure and manufacturer policies can still terminate the app; ongoing notification and battery exemption cannot guarantee survival. [Android user stopping](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping) remains deliberate and must never cause automatic audible recovery.
