# Focus-return investigation · 24 October 2026

## Plan

The preceding goal turn made progress through scoped download/pairing fixes, 890 passing tests, exact-APK Android acceptance and an immutable candidate. The full customer-readiness goal remains active. This pass investigates the unresolved renderer/focus ANR instead of treating another successful build as a fix.

The preserved 23 October trace records a 5,011-ms focus-event timeout after returning from Android app-notification settings and receiving warm Settings/Preflight intents. Main waits in `RenderProxy::setStopped`; RenderThread waits in ART coordination while entering `FrameCommitWrapper::onFrameCommit`. JS, native-module and Expo async queues are idle in that snapshot. Guest CPU/IO/memory pressure and other system failures are also recorded. These observations do not establish an app bug, a platform bug or a host-only cause.

1. Keep the latest Downloads-and-Pairing c1 APK and production source unchanged. Verify the installed hash and original library/preferences on the isolated API-35 emulator. Do not arm, play audio, call AI, change system notification choices or touch media/keys.
2. Add a reproducible test-only focus-return harness: notification settings → app Settings → Preflight, with 0/50/150/300/600-ms intent spacing and ordinary, lock and Home return variants. Validate the actual OS page and final app page each time. Retain timing, command receipts, native errors, app memory and guest pressure.
3. On a mismatch/new ANR/pending observation, stop the scenario and preserve evidence. An observation deadline is not proof of an app ANR and never authorizes restarting the app or a still-running tool. Record live handles for reconciliation. Collect available diagnostic data without speculative renderer flags or disabling safety features.
4. Investigate any reproduction, fix verified in-scope causes, and repeat proportional checks. If the targeted sequence does not reproduce, record the stronger but bounded evidence and leave the historical incident open. Do not claim customer readiness, physical-device reliability or a resolved ANR from non-reproduction.
5. Apply the repository's final `crit` audit to the current-turn delta, restore preferences, remove only owned temporary files and close only the task emulator.

## Evidence

The tested APK is the unchanged internal `Show-Control-Downloads-and-Pairing-2026-10-24-c1.apk`, SHA-256 `88563A3F31EFB02891D4FEFD7DE7A4775634DE1527825C749D95057F4B90C771`. The installed checksum matches. No production source, dependency, permission, show, media, key or GO/panic layout changes belong to this investigation.

The existing user-facing protection is in this candidate: [immediate quiet prepared-show notification and repair actions](background-protection-actions-2026-10-24.md), [fresh preparation readings](show-protection-refresh-2026-10-24.md), and [battery/heat warnings and safe call recovery](show-protection-pressure-2026-10-24.md). Those reports retain their own build/device evidence. This investigation tests the settings-return path; it does not repeat their audio, permission or pressure simulations.

Test-only tooling: [PowerShell harness and instructions](../tools/android-focus-return/README.md). PowerShell parsing and the mutation-free schedule check pass: three return variants × five requested spacings = 15 distinct cases. The script refuses the wrong AVD, installed APK, active native owner, existing ANR or reused output directory. On a pending ADB observation it preserves the live PID/output handles and stops navigation. Evidence remains local under `.native-check/focus-return-*`.

Two initial runs stopped before executing any case because the optional guest-pressure read was denied and then its empty stdout was mishandled. These were harness errors, not app failures. Both terminal receipts have zero pending handles. The final harness retains nonzero pressure receipts and denial messages, labels pressure unavailable and handles empty stdout without inventing a successful reading.

Run `13976ae8-be5a-4870-bb23-3e54d999fe5a` completed all 15 cases with the expected Preflight page and no recorded Android ANR, including the final ANR assertion. It did not yet assert process identity or actual screen-sleep state. The next run completed five ordinary cases, then stopped when a strict `Asleep` assertion observed the real `Dozing` state. That is a tooling assumption, not evidence of an app freeze; its retained report records no ANR and zero pending handles.

Final run `19a52a51-50b9-4f47-9ac2-1dc3fb3e27b0`, 08:00:48–08:02:52 UTC, completed all 15 cases with the following observations:

| Check | Recorded result |
| --- | --- |
| Ordinary / Home / screen-off return | Five requested spacings each; correct final Preflight heading, no recorded ANR after each case and at the end. |
| Process continuity | App PID 3219 retained before each case, before warm intents, after the page observation and at completion. No relaunch counted as success. |
| Screen-off variant | All five captured power states were `Dozing`, followed by deliberate wake. This unsecured AVD does not prove a secure lock, battery deep Doze or suspended JavaScript. |
| Native ownership | No audio/download/voice service at initial, per-case and final idle guards. No preparation or transport command was requested. |
| Optional pressure telemetry | Guest `/proc/pressure` access denied; raw errors and nonzero receipts retained, availability explicitly false. App memory snapshots were retained. |
| Pending observations | Zero; every run has a terminal receipt. No observer deadline justified an app restart. |

The final audit tightened page checks to require one non-clickable app heading and both the exact OS app name and its notification-group label. Both actual source functions were executed offline against all 16 retained app pages and 15 system pages; all passed. Five false-positive fixtures (generic notifications, wrong system page/package, clickable navigation label and duplicate heading) were rejected. The harness parser and 15-case dry schedule also pass. The ordinary app unit/build matrix was not rerun because this delta changes only test tooling and documentation; the unchanged candidate's 890-test/build record remains in its [existing report](download-workflow-refinement-2026-10-24.md).

Cleanup returned to `Your shows`, original `OMS_smoke_test`, one cue, PID 3219 and no playback service/notification/media owner. Original font 1.0, rotation 0/auto 1, Saver/DND 0, denied notification access and flags, no Doze exemption, AC/100 and normal heat readings were observed. Only 78 investigation-owned temporary XML files were removed; all local evidence was retained and the task AVD was closed. No media or credential operations were performed.

The single current-turn project `crit` audit covered the four authored files, test-only scope, bounded commands, pending-handle preservation, privacy, page assertions, accurate evidence labels, cleanup and promotion. Safe findings in the harness were corrected and reverified. No production patch or replacement APK was made. This turn made progress by adding reproducible, stronger evidence; it did not resolve the historical incident.

## Interpretation and remaining gates

The preserved trace's renderer/ART waits are observations, not an established root cause. [AOSP's HardwareRenderer bridge](https://android.googlesource.com/platform/frameworks/base/+/master/libs/hwui/jni/android_graphics_HardwareRenderer.cpp) shows the renderer's Java frame-commit entry; this source reference does not identify the cause of the captured wait. No speculative renderer flag or production patch was introduced.

A passing bounded navigation test cannot close the historical 5,011-ms timeout or certify survival under system load. Timing includes ADB/UI-dump overhead, not exact delivered-intent spacing or frame latency. iOS/Xcode, physical/OEM behavior, long runs and the remaining parity/release gates remain open. The broad customer-readiness goal remains active.
