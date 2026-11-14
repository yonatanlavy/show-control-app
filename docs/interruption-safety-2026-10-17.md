# Interruption safety · 17 October 2026

## Plan and scope

Harden incoming-call, alarm and competing-audio interruption handling on Android and iOS. Preserve local media, saved settings, background playback during healthy sessions, native command ownership and fixed GO/panic positions. No AI requests, dependencies, phone-state permissions or automatic changes to system sound settings.

1. Latch native interruption immediately, including newly admitted voices and PCM renderers. Cancel countdowns, overlaps and scheduled actions. Focus/session return cannot restart audio; a fresh deliberate preparation is required.
2. Keep Stop/Panic available with a stopped audio engine. Isolated previews fail separately. Reject stale notifications, commands and state reconciliation across preparation generations.
3. Close JavaScript command admission and queued work after interruption. Make Recovery explain the next action and disable playback choices until re-preparation. Explain media volume, silent mode and DND exceptions in preflight/help in all ten languages.
4. Run behavior regressions, complete existing automated checks, Android release build, emulator interruption/system-sound exercises and a current-turn final audit. Promote only this pass's authored files to the project and supply the updated APK.

Android, iOS and runtime agents own separate native/runtime files. Root owns UI, translations and delivery. Capture pre-turn baselines under `.native-check/interruptions-baseline`; preserve unrelated dirty work and previous APKs. No persistence schema changes.

## Policy and sources

Real interruptions stop the current run safely and retain the selected song; ordinary commands remain blocked until fresh preparation. Stop/Panic continue to work. Ending a call or regaining focus never authorizes playback. Healthy lock/background operation continues. Preview recovery requires a new explicit audition.

Android automatic ducking can bypass focus callbacks unless the request opts into pause-on-duck; new playback during a call is not guaranteed to receive the system's existing call mute. See [Android audio focus](https://developer.android.com/media/optimize/audio-focus). iOS interruption-end resume advice is advisory; Show Control requires deliberate preparation. See [Apple audio interruptions](https://developer.apple.com/documentation/avfaudio/handling-audio-interruptions).

Silent/ringer mode is distinct from media volume; iOS playback sessions may sound while the Ring/Silent switch is silent. DND/Focus can have call/alarm exceptions and media policies. The app neither claims to detect every policy nor changes these settings. See [Apple audio sessions](https://developer.apple.com/documentation/avfaudio/avaudiosession) and [Android notification policy](https://developer.android.com/reference/android/app/NotificationManager).

## Evidence boundaries

Automated behavior and emulator tests do not prove physical telephony, audible output, wired/Bluetooth routes, HDMI, exact remotes, iOS build or two-hour performance. Record passed checks and remaining hardware gates here before delivery. No claim of all possible bugs fixed.

## Implemented and reviewed

- Android requests pause-on-duck callbacks. A shared atomic focus epoch gates PCM, including voices allocated during focus loss; returning focus cannot release it.
- Android reads only public system audio policy/mute status. Preparation and playback admission check immediately; a native monitor checks prepared/audition sessions once per second, including Ready and paused states. Known media mute/total-silence DND blocks admission; an observed DND-filter change invalidates preparation. Unknown reads are not presented as verified status. Short policy changes entirely between observations may be missed; this is not instantaneous DND protection.
- Simulated-call testing prompted explicit mode checks in addition to focus callbacks. The Android path also reads public audio mode: ringing, in-call and call-screening modes block admission and latch recovery. Android 12/API 31+ observes mode changes immediately; older versions and unavailable listeners use the existing one-second native monitor. Normal mode never clears the interruption latch. Communication mode is allowed for the app's calibrated duplex microphone. No phone-state permission or call metadata is requested. Early fixed-delay call attempts were inconclusive because they could end before ringtone mode was established; the final harness waits for confirmed MODE_RINGTONE before asserting recovery. See [Android mode observation](https://developer.android.com/reference/android/media/AudioManager.OnModeChangedListener).
- iOS closes its final output synchronously, invalidates queued cleanup by preparation epoch, cancels pending actions/voices and never follows interruption-end resume advice. Stop/Panic bypass engine-running admission. Media-service loss/reset requires a new prepared engine. These changes are source-reviewed, not compiled on this Windows host.
- Voice duplex sessions retain microphone/Bluetooth flags while removing external-app mixing. Media reset/loss disarms and invalidates calibration; reset recreates the orphaned voice engine without restarting recording. Old permission/model completions are rejected. UI and director boundaries reject microphone calibration during critical sessions, including retained Retry callbacks. No recognition or provider requests were made.
- The runtime cancels queued/in-flight ordinary commands, adopts safety-event generations, clears pending countdown/progress and ignores stale healthy-looking state until deliberate preparation. Healthy foreground reconciliation still works.
- Recovery disables unusable playback actions, provides an explicit silent exit to preflight/rehearsal, and stays open if shutdown fails. It cannot emit a success toast for failed shutdown. Run exposes Recovery through Touch Guard and blackout after a fault/interruption; GO/panic layout styles are unchanged. Preflight/help/error explanations cover all ten languages.

## Automated edge-case evidence

| Cases | Evidence |
| --- | --- |
| Permanent focus loss; transient loss; duck loss; returning focus | Production Kotlin focus-gate regression |
| Voice created after loss; loop/reset after loss; seek after loss; panic during short loops | Production gate/PCM and existing PCM regressions |
| Denied recovery focus; loss during recovery; stale recovery epoch; repeated loss | Production Kotlin gate regression |
| Total-silence DND; same-filter media mute; DND changed; DND switched off; repeated unchanged status | SystemAudioPolicy production-helper regression |
| Unknown policy read; unknown mute read; unknown followed by known; ringer silent/vibrate not inferred | SystemAudioPolicy production-helper regression |
| Pending Replay; pending Hit; pending scheduled action; late command rejection after call/route/fault | Runtime interruption-barrier regression |
| Late STATE; late progress; late VOICE_START; old generation; missed interruption on foreground | Runtime interruption-barrier regression |
| Interrupted preparation; fresh deliberate preparation; Stop/Panic while interrupted; healthy background reconcile | Runtime interruption-barrier regression |
| Guard plus blackout plus interruption; disabled GO; fixed GO/panic size; reachable Recovery | React Native component regression and final Android emulator checks below |
| Rapid recheck; failed shutdown; rehearsal recovery; ringer/DND help search; policy error priority | Recovery/help component regressions |
| Saved calibration Retry after arming; stale enabled button before re-render; direct director calibration | UI/director regressions without microphone/provider calls |

The Foundation-only Swift regression covers prepare/latch/stale notification/final-mute races but is **unexecuted**: Swift/Xcode is unavailable. It is not included in passed-test counts.

## Verification record

Final automated gate: **567 tests in 48 suites**, zero failures; TypeScript, lint, architecture suites, all ten translation catalogues (682 messages) and token generation check pass. Production Kotlin focus/PCM, policy/call-mode and existing PCM regressions pass. The final Android release build succeeded. Existing Jest act warnings and Gradle deprecations remain; no warning-free claim is made. Dependencies/configuration are unchanged; Expo Doctor was not rerun in this pass (the preceding build recorded 21/21).

## Installed APK verification

Test device: existing Medium_Phone_API_35 emulator, Android 15/API 35, x86_64, 17 October 2026. Updated in place without wiping Show Control data. Its audio output is disabled, so these are OS-event/state/layout checks, not audible or physical-phone evidence.

- Confirmed incoming ringtone mode before evaluating the app. Silently Ready and playing-loop sessions both enter Recovery; a playing session with Touch Guard and Stage Blackout exposes Recovery and the normal readout. Call end and subsequent NEXT/PLAY/PLAY_PAUSE/STOP receipts leave GO disabled. No call metadata is read by the app.
- Final APK: DND total silence during playback safely stops and remains interrupted after DND is disabled and media keys are pressed. The pre-repair focus-only candidate's timing was inconclusive for calls; the corrected synchronized test was rerun against the final artifact.
- Final APK: a separate foreground fixture obtained ducking audio focus; releasing focus, returning to the app and media presses cannot resume the interrupted run. Temporary focus-loss behavior also passed on the earlier audited candidate; production focus/PCM regressions cover the final unchanged path.
- Stop/Panic work after interruption. Explicit Recheck exits silently to preflight; Arm prepares silently and GO remains deliberate. Relaunch/update begins silent.
- GO bounds remain `[42,1582][1038,1855]`; panic remains `[556,1403][1038,1550]` in Ready/interrupted portrait captures at 1080×2400. No Run layout styles were changed. Hebrew/RTL preflight sound guidance was visually inspected. English, ring/media volume 5, DND off and the original library/settings were retained/restored. No AndroidRuntime crash was recorded during the test session.
- Current-turn `crit` and React review completed. Independent reviewers found and helped repair stale cleanup, missing isolated-preview feedback and calibration Retry bypasses. No remaining confirmed high-severity source finding was identified; physical-device gates below remain open.

Artifact: `Show-Control-Interruptions-2026-10-17.apk`, 154,555,169 bytes; SHA-256 `28DAD5C47F8F8F4F2FCFA10D038FD674C772E677081EF03DFF44654DDE95F79B`. Embedded JS bundle, arm64-v8a/x86_64 native payloads and signature verified. This uses the existing internal/debug certificate, not store production signing. The installed artifact was tested without AI or provider requests.

Still unverified: Xcode/iOS compilation; physical Android/iOS calls, alarms, Focus/silent switches and real media volume; audible wired/Bluetooth paths; exact remotes/Flic; HDMI; lower Android API call-monitor timing; full large-text/tablet/landscape accessibility matrices; cross-platform restore and two-hour runs. The one-second fallback cannot guarantee observation of every brief policy/mode change. No complete parity or bug-free claim is made.
