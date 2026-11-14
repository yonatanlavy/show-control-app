# Show protection follow-up · 24 October 2026

## Execution plan

Continue the user's request to reduce premature closure, with no AI requests, new dependencies, show-schema changes or GO/panic geometry changes.

1. Preserve the unfinished root-transport experiment separately and restore its audio-service file to the exact previously built baseline. The ordered OMS group blocker remains open in `oms-root-transport-2026-10-24.md`; this protection patch does not claim to fix it.
2. Retain the existing native media-playback foreground service and quiet ongoing notification for prepared performance/rehearsal sessions, including Ready and paused states. Keep OS/user termination and deliberate recovery limits truthful.
3. Treat unavailable power/background-policy readings as unknown in the native notification and shared preparation card. Explain incomplete checks in the expanded panel; do not show a successful check from missing observations. Android versions before API 28 have no Android background-restricted setting; manufacturer controls still require manual review.
4. Bound advisory status reads to five seconds, release their UI loading state on failure and allow Retry. Reject late observations through existing request ownership. Never time out or retry an audio command, change a system setting or start an idle service as a consequence.
   Also report the successfully posted Show Control foreground notification rather than Media3's default-provider flag. The app overrides notification ownership; the default flag cannot observe its manual `startForeground` call. Read this status on its owning main looper and report inactive while closing or after a notification failure.
5. Add meaningful policy, platform and panel regressions, run the repository/native checks, build an immutable internal APK and inspect installed background/notification behavior on the isolated Android emulator. Audit the changed files before delivery.

## Evidence

The immutable internal APK is `Show-Control-Show-Protection-2026-10-24-v2.apk`, 154,692,325 bytes, SHA-256 `4D9C9AD184718F167324E0C6D4E785582104D5343CB36239D448459A97DD8493`. Its packaged bundle SHA-256 is `FFFA2DDA37628A06022B57D299F8BA39EBA1A7701520FD089DB024E16E9A6ED6`. The pulled installed APK matched this identity. Signature verification passed using the existing internal/test certificate and provisional app identity; arm64-v8a and x86_64 are included. Nineteen embedded Metro sources matched frozen authoring/promoted content.

**Automated verified:** 780 tests in 58 suites; type, lint, architecture, 745-message/native-copy parity in ten languages, token checks and native background/transport/ownership/media/remote policy regressions. The final status-only audio-service correction passed strict Android native lint and the release build. The full test log contains 45 existing React `act` warnings, matching the prior native-matrix log; it is not a warning-free test run. No provider requests, dependency/permission changes or data migrations were made.

**Simulator/emulator verified:** isolated `ShowControl_QA_API35`, API 35, no audio output. This is UI/native-state evidence, not audible, hardware or long-run proof.

| Scenario | Observation |
| --- | --- |
| Cold Library | Original `OMS_smoke_test` retained; battery warning visible; no audio service or automatic permission prompt. |
| Expanded protection panel | Optimized battery, denied notification access and normal idle service-off values visible. Explicit Allow opened the Android permission prompt; granting it reread both permission observations as Yes. |
| Prepared Ready | Silent at 00:00; foreground service ID 1001 with ongoing/only-alert-once/no-clear flags, quiet transport actions and the battery warning. |
| Exemption and Battery Saver | Adding the test app's Doze exemption changed the message to prepared. Actual Battery Saver while unplugged changed it to the battery warning; clearing Saver restored the normal prepared message. The first attempt while charging did not enable actual Saver and is not a successful warning test. |
| Recents card dismissal | UI reported No recent items after swiping the observed Show Control card. Its prepared native service and PID remained active; this does not prove every Activity was destroyed. |
| Screen locked/backgrounded | After 32.98 seconds, the screen was asleep and the same PID 3496 and foreground notification remained. This was an exempted, prepared silent session, without forced deep Doze. |
| Playback and native Pause while locked | Deliberate touch GO started the synthetic cue; after Home/lock the OS reported PLAYING. Direct media-session Pause settled at 288 ms, with an ongoing notification. Foreground return restored Paused/Resume at the same position. |
| Android Active apps Stop | Process and service ended. Relaunch returned to Library with no prepared audio service; exit history recorded USER REQUESTED / STOP APP. No audible state was resumed. |
| Safety geometry and cleanup | Ready and Paused GO/panic bounds matched. Restored denied notification flags, no Doze exemption, Saver/sticky/DND 0, battery AC/100, font 1.0, rotation 0/auto 1 and the original show. No media was imported, edited or deleted. |

Unknown-reading, stalled-read timeout/Retry, late-response ownership and failure paths are automated evidence; no artificial native fault hook was added to produce those UI states on the emulator. Foreground status now derives from the successfully posted custom notification on its owning main looper, instead of Media3's default-provider state. See [MediaSessionService](https://developer.android.com/reference/androidx/media3/session/MediaSessionService) for custom notification ownership.

Evidence is retained under `.native-check/protection-v2-*`: source ledger/audit, check receipts, two sequential build receipts, final signature/artifact/source identity, installed identity, UI hierarchies/screenshots, native service/media/notification observations and cleanup. The first candidate was superseded by the final status-corrected build; only the final hash above is delivered.

## Audit and remaining gates

The current-turn `crit` audit checked the protection delta and the status correction. Native timing/command ownership, preparation locks, library data and GO/panic layout were preserved. The unfinished root-transport experiment remains recoverable under `.native-check/oms-root-deferred`; it was excluded from this candidate. The restored service differs from the last verified baseline only in its background-status read.

Two locked Ready NEXT injection attempts did not start the cue in this bounded run. The dispatch cause is unresolved and those attempts are not successful remote evidence. The later native Pause test passed after a deliberate touch start. Locked Ready remote GO, exact remotes/Flic and hardware behavior remain open. The existing OMS ordered-group GO blocker and historical rendering/focus ANR are also unresolved outside this protection delta; this is not a customer/store-ready or generally bug-free build.

Existing protection evidence remains in [the preceding report](show-protection-2026-10-24.md). Physical Android/iOS, manufacturer devices, iOS/Xcode, audio routes, HDMI/microphones, cross-platform restore and two-hour runs remain open. Battery exemptions and ongoing notifications reduce avoidable restrictions; they cannot prevent [Android's explicit Stop](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping), Force stop, shutdown, crashes or every manufacturer policy. No restart loop or automatic audible recovery was added.
