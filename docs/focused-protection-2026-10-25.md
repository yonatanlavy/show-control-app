# Focused protection checks · 25 October 2026

## Plan

The previous goal turn made progress: four reproduced retained-UI failures fixed, 14 added cases, 1,161 passing tests and an exact signed/installed Android candidate with unchanged native payloads and safety bounds. Its owned emulator is confirmed closed. The full customer-readiness goal remains active.

The preserved 23 October focus ANR still shows main waiting in RenderProxy/setStopped and RenderThread entering the Java FrameCommit callback through ART. Idle JS/native-module queues and one stack snapshot do not identify its cause. The inspected [AOSP renderer bridge](https://android.googlesource.com/platform/frameworks/base/+/master/libs/hwui/jni/android_graphics_HardwareRenderer.cpp) confirms that callback boundary, not a root cause. Do not apply speculative renderer flags or call another non-reproduction a fix.

Independent source inspection finds preparation protection panels using mount/global foreground lifetime instead of route focus for reads. Test that actual component before editing: off-screen mounting, hidden polling/foreground return, live-session reads, stale results and settings-return leases.

1. Preserve the current APK/source/library and existing native notification policy. Use synthetic native/status fixtures only, no AI, purchases, keys or real media.
2. Reproduce hidden/critical advisory-read admission failures. If confirmed, admit automatic reads only for a focused, active, idle panel with no pending system-settings interaction. Reuse existing narrow critical/settings observations; no new runtime timer controls audio.
3. Invalidate pending display observations on blur/critical/settings changes, preserve ordinary reading layout during quiet checks and recheck on eligible return. Keep the initiating settings lease alive through real foreground return or deliberate windowed Recheck even if its React route blurs. Never infer a setting change from opening its OS page.
4. Test settings/permission completion, late callbacks, background/blur, repeated focus, unmount and lease races. Update only affected navigation fixtures; run full type/lint/unit/architecture/ten-language/token checks and one crit audit.
5. Build an immutable Android candidate with unchanged native and safety-layout hashes. On the exact owned QA emulator, verify real notification-settings return and the current-artifact focus matrix without restarting on observation deadlines. Record non-reproduction honestly, restore test preferences and close only the owned device. Physical/iOS/ANR/two-hour/store/customer gates remain open until their actual evidence exists.

## Reproduced defects and correction

All six targeted tests failed on the prior production component: a blurred panel reads on mount, a retained hidden panel keeps polling, foreground return rereads a hidden panel, a critical-session mount still reads, a just-critical foreground return still reads, and a result arriving after blur changes the old display. Their red results are retained in `.native-check/focused-protection-red.json` and its log. None proves the historical renderer/ART ANR's cause.

Protection reads now require focused navigation, known active AppState, no critical show session and no outstanding system-settings interaction. Focus, critical and settings transitions invalidate old display observations and remove the periodic timer; returning eligible performs a fresh quiet read. Automatic foreground/periodic reads preserve layout while pending; a failed accepted observation still clears stale reassurance and offers Retry. Stale repair/Recheck callbacks cannot launch OS settings or release an unrelated lease.

AppState observation remains mounted long enough to settle the initiating OS-settings lease even when its React route blurs. Merely returning an app-active event without first leaving does not release it. Notification permission and nested native settings wrappers retain their ownership. After genuine return or deliberate windowed Recheck, the lease's narrow boolean observation schedules one fresh focused read. It never assumes that opening a settings page fixed the restriction.

The slow-initial-read/windowed-settings combination exposed a potential trap in the first refinement: invalidating a loading read must not leave the owning Recheck button disabled forever. The final component keeps that explicit return path available while waiting on its own settings window, omits a false “checking” spinner while checks are paused and rejects the obsolete initial result. It does not release a pending native launch or permission dialog prematurely.

There is one production file change. No native background/notification/thermal policy, playback, command, schema, media, backup, permissions, dependency, key, translation, theme, Run geometry or core data change. Native locked/background warning ownership remains independent of these preparation-only React reads.

## Automated evidence

The final frozen suite passes **1,175 tests / 72 suites**, type checking, zero-warning ESLint, architecture, **797 messages/native-copy parity across ten languages**, and token checks. Four authored source/test hashes and complete results are `.native-check/focused-protection-source-ledger.json` and `.native-check/focused-protection-checks.json`.

**14 cases are added**, bringing the actual protection-panel suite to 74. A 73-case focused run was clean before the final old-repair-callback case; the final full suite covers all 74. The three surrounding suites passed 137 cases before that final addition. The first integration run correctly failed seven cases in two fixtures because their router fakes omitted useFocusEffect; the two affected fixtures now implement focus-effect setup/cleanup rather than bypassing the production behavior. The actual critical/settings stores replace the old private critical boolean fake in the panel tests.

Full raw logs retain 47 pre-existing React act/virtual-list warnings in other fixtures, with the same message categories as E-66/E-67. They are not suppressed or called warning-free. The protection-focused suite emits no console errors. The test renderer's queued zero-time callbacks are settled before asserting timer counts; no elapsed polling interval is skipped.

| Combination | Verified result |
| --- | --- |
| Initially hidden, hidden polling, or hidden foreground return | No native advisory read |
| Critical mount or newly critical foreground event | No native advisory read or false busy check |
| Slow observation + blur | Late result cannot change the hidden panel |
| Ten blur/refocus cycles | One fresh read per return; zero timer while blurred, one while focused, zero on teardown |
| OS settings + origin route blur + real app return | Lease survives blur, settles on return, no hidden read, fresh read on refocus |
| Initial slow read + windowed OS settings + Recheck | Recheck stays usable; lease settles; one fresh read; stale initial result ignored |
| Old hidden Recheck callback + open settings lease | Cannot release the lease; actual foreground return still can |
| Another settings owner + new focused panel | Reads wait; one fresh read starts after release |
| Old repair callback + another pending owner | No second OS-settings launch |
| Unknown initial AppState + active event | No read until active is observed |
| Pending quiet read + preparation + Exit | Late critical result ignored; no live reads; fresh eligible read after Exit |
| Permission denial, fallback page, unavailable status, teardown, EN/HE/AR, large text and iOS guidance | Existing actual component cases remain passing |

The single current-turn `crit` loop covers the production component, three test files, build/verification automation and this evidence. It retains fresh imperative guards, independent native ownership and original source identities. It does not certify physical/OEM audio, customer readiness, an iOS build or an ANR fix.

## Exact build and installed evidence

The fresh offline Android release build plus strict audio/commerce library release lint pass: `.native-check/focused-protection-build-46d94a3a-a93b-4129-a437-d441ff66c7e2.json` and its log. All **72 native libraries, DEX, manifest and resource payloads match E-67**. The packaged protection component matches its frozen source, and existing live UI/source hashes match the prior candidate. No iOS compiler was available.

Internal/test APK: **Show-Control-Focused-Protection-2026-10-25.apk**, **154,854,137 bytes**, SHA-256 **3B6B67E3D53045BB212C85FAE3549C90C5262D7DF20F1D6EFCDBBE8C1710CAA4**. Bundle SHA-256: `6148524871EAF2B55AF8D113468D1EC17ACAAF90AAEE1DD1871F265F7220966F`. Signature verified with the existing internal/test certificate; provisional package `app.showcontrol.working`, version 0.1.0/code 1, arm64/x86_64 retained. The installed base APK checksum matches.

On the explicitly owned `ShowControl_QA_API35` emulator at `emulator-5562`, the preserved synthetic Library opens with `OMS_smoke_test`. Its real **Review battery settings** shortcut opens Android's **App battery usage** page. No policy is changed. Back returns to the expanded panel, retains the battery-restriction guidance and enables the repair action again; the settings lease no longer blocks it. No idle playback service exists. This is installed return/navigation evidence, not a count of native calls or proof of a manufacturer battery policy.

The existing focus-return harness then passes **15/15** current-artifact cases in run `782e061c-ad97-4f58-92e9-b92432c24f37`, **03:55:27.625–03:57:34.695 UTC**. App PID **3787** is retained; every expected Preflight page and post-case/final no-ANR report passes. There are zero pending observation handles, no preparation/transport request and no app restart. The matrix combines normal, screen-off/wake and Home returns with five requested spacings. Those include ADB/observer overhead; they are not frame latency, secure lock, deep Doze, physical survival or an ANR fix. The historical 5,011-ms incident remains unresolved.

After the matrix, explicit Rehearsal Prepare remains silent: Ready, zero of eight active sounds and source zero. The directly inspected screenshot and XML retain the exact E-67 safety bounds: GO `[32,2033][1049,2306]`, Stop `[32,1875][530,2001]`, Fade `[551,1875][1049,2001]`. Deliberate Exit removes every app service and returns to the same synthetic selection. Installed evidence is `.native-check/focused-protection-installed-results.json` plus retained captures.

Cleanup removes only **41 current-run-owned remote XML/PNG files**, preserving local evidence and all media. Notification permission and original sensitivity flags, battery/charging and Doze exemption match baseline; Saver/DND/airplane/font/rotation preferences also match. No rotation correction was needed. The owned emulator is closed after final checks. No real library, AI/provider, purchase, receipt/key or physical-device access occurred.

Physical/OEM audio and battery behavior, iOS/Xcode, named controllers/Flic/HDMI, cross-platform restore, two-hour runs, SDK privacy, configured store transactions and performer/customer rollout gates remain open. No emulator or software check alone establishes readiness for 1,000 customers. The broader goal remains active.
