# Premature closure protection: memory advisory

## Scoped plan

Retain the existing prepared-show foreground notification, task-removal retention, native wake policy, battery/standby/Saver/notification/heat checks, deliberate settings repairs, and silent recovery. Add Android's public current low-memory observation to preparation and the existing quiet notification. Never infer a memory problem from backgrounding, battery optimization, a previous exit, or a guessed RAM threshold.

1. Add regressions for a true, false, missing and malformed low-memory observation, combinations with existing risks, and refresh/clearing in the preparation UI.
2. Read `ActivityManager.MemoryInfo.lowMemory` through the existing best-effort observation boundary. Expose only a nullable boolean; retain no app/process inventory or byte counts. Older native/iOS builds remain unavailable for this Android-specific observation.
3. Add an actionable ten-language advisory and native notice text. Reuse the current bounded observation schedule and notification identity; add no listener, service, permission, dependency, task killer or automatic transport.
4. Run shared checks, native policy regressions and Android release/lint. Review the exact delta with the project crit workflow. Promote only these paths and identify the delivered artifact precisely.

No persisted schema, show, media, controller mapping, GO/panic geometry or iOS audio behavior changes. Android's memory flag is a current advisory, not a prediction or survival guarantee. Public evidence: [MemoryInfo.lowMemory](https://developer.android.com/reference/android/app/ActivityManager.MemoryInfo), [Doze exemptions](https://developer.android.com/training/monitoring-device-state/doze-standby), and [user stopping a foreground service](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping).

## Delivered behavior

The existing quiet ongoing Android notice remains owned throughout a deliberately prepared performance/rehearsal session, including Ready, paused, waits and recovery. Native task-removal/wake/foreground policy is unchanged. Battery optimization, explicit background/standby restrictions, Saver, notification permission/channel/posted-record observations, heat and low-charge guidance remain independent. Settings repairs are explicit and preparation-locked. Idle Library does not start an audio keepalive.

Android's current low-memory flag now joins those advisories. It does not infer a problem from a previous memory-related exit, an unknown observation, UI hiding or an arbitrary RAM percentage. Missing/failed/older/iOS readings are nullable and never labelled as a successful memory check. A true flag adds the compact warning and expanded explanation; a fresh healthy observation clears it without hiding other risks. Recovery, heat and low charge retain notification priority. Existing bounded observation and full-copy notification identity handle changes; no new timer, observer or service is introduced.

## Software and packaging evidence

- Before implementation: **25 failing / 134 passing** focused assertions. After implementation: **159 focused tests pass**, including ten-language guidance and clearing memory pressure while retaining battery restrictions.
- Full checks: **1,239 tests / 73 suites**, type, zero-warning ESLint, architecture, **800 messages/native copy in ten languages**, and generated tokens pass. There are 29 added shared tests. The full suite retains earlier React act/VirtualizedList diagnostics elsewhere; this is not a warning-free renderer claim.
- JVM policy tests exercise **384 memory/recovery/heat/charge/battery/Saver/playback combinations**, including false/null readings. Existing transport failure, ownership, system-media and remote-epoch regressions pass.
- Android `:show-audio:lintRelease :show-commerce:lintRelease :app:assembleRelease` succeeds offline in **5m 31s**. New native markers are in DEX; all ten memory-notification translations are packaged, including Hebrew `iw`.
- **65 native shared-library/manifest payloads** match E-69. Resource/DEX changes are expected. Run, primitives and Rehearsal source hashes are identical to E-69. Packager source-map hashes match all four changed production TypeScript/TSX sources.

Internal/test APK: `Show-Control-Closure-Safeguards-2026-10-25.apk`, **154,865,285 bytes**. SHA-256: `A09483E979D9851E5263D1933A4D4F7A2D1F9E87BC9869C429E3FA245C94348A`. Bundle SHA-256: `1C6704C744FC26C90BC94044D5799C273743AAA4BBBC561A661B960F0B027509`. Signature verified; provisional `app.showcontrol.working`, version 0.1.0/code 1, arm64/x86_64. This is not production signing or store release.

## Exact installed evidence

Owned API-35 `ShowControl_LibraryLoad_QA`, `emulator-5564`; installed base APK hash matches. The preserved synthetic fixture has 1,200 songs and 200 Hits. No AI/provider request, media import/edit, controller remapping or GO/Start command was made.

| Observation | Result |
| --- | --- |
| Separate same-test-signer native observer | `INSTRUMENTATION_CODE: 0`. The installed production reader matches an independent Android memory reading: **false**. No actual low-memory condition was induced. |
| Packaged warning policy | All **384** synthetic combinations pass through installed production DEX. Synthetic true flags do not prove OS pressure delivery or survival. |
| Silent preparation | Ready, zero active sounds, unchanged synthetic cue. Opening setup beforehand had no audio service. |
| Actual notification shade | Battery-restriction warning visible after a test-only permission grant. Foreground ID 1001, mediaPlayback, ongoing/only-alert-once/no-clear/foreground flags, importance 2, sound/vibration null. Android owns presentation/dismissal. |
| Locked/background | Same PID **3721** and foreground notice after **65.381 seconds**, Android `mWakefulness=Asleep`. Return stays Ready with zero sounds. This is bounded silent retention, not acoustic or two-hour evidence. |
| Fixed controls | GO `[32,2033][1049,2306]`, Stop `[32,1875][530,2001]`, Fade `[551,1875][1049,2001]`, unchanged on return. |
| Android explicit Stop | Public `cmd activity stop-app` removes process/service. Deliberate cold launcher return opens Library with the original synthetic show and no audio service or automatic playback. |
| Cleanup | Exact denied-notification flags restored; font 1.0, Saver 0 and DND 0 retained. Seven owned remote files and only the QA helper removed; local evidence/library retained; owned AVD shut down. |

The separate [observer](../tools/protection-probe/README.md) reads no library/media/key/receipt/input data and issues no transport. It is not shipped. Receipts live under `.native-check/memory-protection-*` and `protection-probe-*` in the authoring checkout.

QA setup corrections are retained, not counted as passes: the first helper build had a local source-path typo; an early observer attempt preceded helper registration, and its guard initially expected an expanded component name rather than Android's `.ProtectionProbe` abbreviation. Only `installed-probe-v2` with result code 0 is accepted. The first lock capture had an invalid elapsed-time conversion; only `lock-result-v2` supplies the measured duration.

## Audit and limits

The single project crit loop reviewed the scoped delta, nullable compatibility, native queue ownership, independent warning priority, stale/critical/settings admission, privacy, translations/resources, exact artifact, helper separation and cleanup. No known critical/high finding remains in this delta. Existing user/agent edits and music remain preserved. No schema, dependency, permission, automatic settings, task-killer, boot/watchdog restart or audible recovery change is introduced.

These protections reduce avoidable restrictions. Android Stop/Force stop, shutdown, crashes, memory pressure and manufacturer policies can still end an app. An ongoing notification or Doze exemption is not a survival guarantee. The historical Android focus ANR is unresolved; none occurred in this bounded owned boot. Physical/OEM/iOS, exact controllers/audio/HDMI, actual memory-pressure delivery, two-hour, store/privacy/licensing and customer rollout gates remain open. iOS/Xcode was unavailable on this Windows host; no new iOS native behavior is claimed.
