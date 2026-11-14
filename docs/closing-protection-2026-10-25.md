# Avoidable app closures: 25 October

## Plan

Keep the existing deliberately prepared Android foreground media service, quiet ongoing notification, native wake policy, task-removal retention, power/thermal warnings and safe silent relaunch. Do not start an idle keepalive, restart killed audio, change system settings automatically, or add provider traffic.

1. Distinguish a prepared show without foreground protection from idle/remote-diagnostic service ownership. Keep unknown readings explicit.
2. Add bounded, cached Android 11+ previous-process exit observations, with reason/time only. Never read traces, descriptions, process summaries or media. Explain that historical exits are not proof of a current show failure. iOS/older Android retain unavailable observations.
3. Present translated preparation-only recovery guidance and an actionable pre-show checklist. Preserve GO/panic and all unrelated native-store work.
4. Verify normalization, lifecycle combinations, UI/RTL/accessibility, actual native policy regressions, full software checks, and an isolated Android release build. Record exact evidence and unverified physical/OEM/iOS gates.

## Existing protection

The service retains Ready, paused, countdown, playing and recovery sessions after Activity task removal; auditions exit. Its notification is ongoing, quiet, in the app language and retains independent battery/thermal/recovery warnings. A foreground notification is not a guarantee against user Stop/Force stop, Android memory pressure or manufacturer policy. Android 14 can allow dismissal of ongoing notifications while unlocked. Preparation offers deliberate battery, app-info, notification/channel and power-saver repairs and rechecks on return.

## Implemented

Android observations now distinguish a prepared main session from idle/remote diagnostics. Known foreground/service loss produces a preparation warning with deliberate Stop/exit/reprepare guidance; missing observations remain unknown. Existing battery, power-saver, channel, notification-permission, posted-record and pressure issues remain independent.

Android 11+ reads at most eight own-package exit records once per process, selects the latest valid previous main-process record and exposes only a bounded reason and timestamp. It excludes child/current-process records and invalid/future times; a newer normal exit takes precedence over an older crash. Unsupported/failed history stays absent. It never infers battery policy from a kill. The disclosure is historical and does not change the current readiness result, persist a trace, upload data, or issue transport commands.

The preparation panel includes a ten-language pre-show checklist. The existing quiet ongoing notification, native wake policy and task-removal policy are retained. GO/panic, the immutable show model, media pipeline, audio processing, permissions and dependencies are unchanged. Incomplete native-store lifecycle edits in the authoring checkout are preserved and excluded from this APK.

## Automated evidence

- 35 added shared-code regressions; 116 focused protection cases pass. Full candidate checks pass: 1,127 tests in 70 suites, types, zero-warning ESLint, architecture, 796 translated messages/native OS copy across all ten languages and generated-token parity.
- Actual Kotlin background policy regression passes, including existing lifecycle/warning combinations and new exit classification/filtering. Android release Kotlin compilation, strict audio-library release lint and release APK build pass.
- Frozen-source maps verify the packaged protection UI and unchanged live controls. Native marker checks find the new public exit reader/prepared-state fields in DEX. All native libraries, manifest and compiled resources are identical to E-64. The refined copy-only APK retains all 72 native/DEX/manifest/resource payloads of the initial closure candidate.
- Local Windows QA automation is retained in the authoring checkout as `.native-check/closing-protection-verify.ps1` and `.native-check/closing-protection-build.ps1`; it is not an app feature or portable user tool. Evidence directories: `.native-check/closing-protection-b535fa2f-6959-4c38-80b1-d30c57ac5ae8/` (initial/native behavior) and `.native-check/closing-protection-32da43d0-9372-4271-93b4-650d5c804c92/` (refined software/build/package).

The edge corpus covers missing/legacy native fields; nonboolean prepared flags; absent/iOS/malformed exit objects; all eight accepted exit categories; unsupported reasons; zero, negative, fractional, string, NaN, infinite and future timestamps; removed sensitive extra fields; empty history; current PID; child process; unordered records; normal-after-crash ordering; inactive/missing/unknown foreground states; diagnostic ownership; independent combined restrictions; historical-crash/current-readiness separation; disclosure-only historical copy; English/Hebrew/Arabic labels; settings/permission nonautomation; large-text rows; and preserved failed-read/retry/critical/teardown behavior.

| Combination | Evidence / result |
| --- | --- |
| Prepared + service active + foreground inactive | Explicit protection-loss issue, automated |
| Prepared + service absent + foreground reported active | Contradiction still warns, automated |
| Prepared + service/foreground unknown | Unknown, never checked-success, automated |
| Diagnostic service + no prepared show + no foreground | No false prepared-show failure, automated |
| Foreground loss + battery optimization + denied notifications | All independent issues retained, automated |
| Historical crash + healthy current settings | History does not become a live failure, automated |
| New normal exit + older crash + unrelated child record | Latest valid main-process exit wins, actual Kotlin policy |
| Locked Ready + battery optimization enabled | Quiet ongoing foreground notice with battery advisory, API-35 emulator |
| Battery exemption + Battery Saver enabled | Advisory remains; exemption alone does not clear Saver, API-35 emulator |
| Locked playback + system Pause + foreground return | Native pause retained at about 0.66 seconds; no automatic resume, API-35 emulator |

## Installed Android evidence

The owned API-35 QA emulator retained its synthetic library. The exact initial APK was checksum-verified after installation. Silent Prepare showed Ready, zero of eight voices and source position zero; foreground service 1001 used quiet ongoing flags. Background/lock retained foreground ownership. While locked, granting Doze exemption cleared the advisory to Prepared after the native recheck; enabling Battery Saver restored the advisory independently. Temporary exemption/Saver/battery simulation were restored. Explicit GO on the synthetic tone followed by native media Pause produced PAUSED and the same source position on return; its GO/panic footer bounds stayed unchanged.

Force stop removed the audio service. Relaunch returned to the selected synthetic library without restarting it; the new disclosure correctly reported “Stopped through Android.” The install/update record had earlier appeared as “System ended the process.” English history/checklist and Arabic 1.8× history were inspected; reason/time and reading order remained legible. A Recents swipe attempt did not establish task removal and is not counted as that proof. The source/automated task-removal policy and earlier evidence remain distinct.

The final audit corrected unsupported “export diagnostics from Settings” guidance in all ten languages to truthful reason/time troubleshooting guidance. No diagnostics-export feature is claimed. The initial APK is retained as evidence, superseded for delivery by the refined APK.

Final internal/test APK: `Show-Control-Closure-Protection-Refined-2026-10-25.apk`, 154,833,621 bytes, SHA-256 `C54081641AA9F6049205BD33C7EE08A9745E5EBA6284BB27594594B850AE62C7`. Package `app.showcontrol.working`, version 0.1.0/code 1, arm64/x86_64, existing internal/test certificate and provisional identity. No AI/provider requests or store transactions were made.

The refined APK was installed separately and its on-device checksum matched. Its real closure disclosure contains the corrected reason/time guidance and no diagnostics-export instruction; its preserved library opens without an audio service. Notification permission returned to denied with the original sensitivity flags, English, original theme, font scale 1, portrait/automatic rotation, Saver/DND/airplane off and no app Doze exemption. The owned emulator is closed after final captures and cleanup; no physical phone or other emulator is used.

This record does not certify physical-device, manufacturer battery-policy, exact remote, two-hour, iOS or store readiness. Android Stop/Force stop, memory pressure, shutdown and manufacturer policies can still terminate the app. Notification dismissal/visibility remains OS-owned; no idle keepalive or automatic audible restart is added.
