# Cold Ready media controls · 24 October 2026

## Goal and preflight

The preceding protection pass made progress: an exact signed APK, 780 passing tests, ongoing status, battery/unknown-reading fixes and bounded lock/stop/relaunch evidence. The full customer-readiness goal remains active. This pass addresses the unresolved ability to start a silent, newly prepared show through an Android media remote before the first song has played. Preserve both platform safety contracts, local media, fixed GO/panic geometry and all unrelated work. No AI/provider calls, dependencies, show-schema changes or automatic audible priming.

The existing APK's failed observations show an active Show Control media session while Android's `Media button session is null` and its audio-playback history is empty. On a fresh boot of the same APK, another preparation selected Show Control; its private AudioTrack reported started followed by a client-volume mute. This is intermittent, not a reliably passing Ready path.

Android 15's [audio configuration](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-15.0.0_r1/media/java/android/media/AudioPlaybackConfiguration.java) excludes client-volume-muted players from active playback. Its [media-session stack](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-15.0.0_r1/services/core/java/com/android/server/media/MediaSessionStack.java) chooses media-button ownership from observed audio-playback UIDs. The app currently runs a private silent WAV with player volume zero. The evidence supports initial started/muted observation ordering as the cause of inconsistent cold routing; the exact new APK must verify the correction.

## Execution plan

1. Preserve the current source/artifact baseline and record the old Ready/native audio/routing state. An active session alone is insufficient evidence of media-button ownership.
2. Replace only the existing private silent transport's mutable cached WAV with the pinned Media3 `SilenceMediaSource`, whose PCM samples are generated zeros. Keep its player gain at unity so Android can observe the existing prepared task as active. Silence must come from the source, never imported media or a temporary zero-volume setting. Public media state remains truthful Ready/Paused at zero; no user cue, visual, voice, clock or pointer starts during preparation.
3. Remove the now-unused WAV writer. Preserve native failure handling, wake policy, command epochs, pause/stop/panic, preview isolation, foreground ownership and silent relaunch. iOS uses a different native control path and is not modified by this Android-specific correction.
4. Add an acceptance verifier that distinguishes the current app's selected media-button session from merely active, stale or other-app sessions. Exercise its failure cases with deterministic fixtures and use it on actual installed-APK observations.
5. Run required software/native checks, strict Android lint/build and immutable APK/source/signature validation. On the isolated emulator, test cold Ready before any song, lock/Home/Recents, NEXT/GO, pause/resume, stop and panic/reset, repeated preparation and silent relaunch. Reboot to clear OS audio-playback history and repeat without audible priming. Preserve the original library/settings. Audit the delta once before delivery.

## Verification record

The immutable internal APK is `Show-Control-Remote-Ready-2026-10-24.apk`, 154,691,949 bytes, SHA-256 `FCDC228BFDD066A4D32AED7D1A8B136F78BEBDB0DC2349B026D51F025C65B831`. Its installed base APK was pulled and matched. Signature verification passed with the existing internal/test certificate and provisional identity; arm64-v8a and x86_64 are included. The packaged UI bundle is byte-identical to the preceding protection APK: `FFFA2DDA37628A06022B57D299F8BA39EBA1A7701520FD089DB024E16E9A6ED6`. Nineteen embedded sources matched the frozen/promoted UI source records. There are no UI geometry or translation changes.

**Automated verified:** 791 tests in 59 suites, including 11 routing-evidence regressions; type, lint, architecture, 745-message/native-copy parity across ten languages and tokens. Native background, transport-failure, ownership, media-state and controller-epoch regressions passed. Strict Android audio release lint reported no issues; release assembly passed in 2m35s. The unchanged existing React `act` warnings remain in the full test log; this is not a warning-free test run.

The acceptance verifier rejects the actual preceding failure capture with `NO_MEDIA_BUTTON_OWNER`. It also rejects wrong apps, stale sessions/processes, another Android user, ambiguous active sessions, moving/nonzero/error state, completed cue orders and oversized evidence. It was corrected against actual AOSP record-heading formatting before acceptance; its first synthetic-only candidate was not used to declare a runtime pass.

**Simulator/emulator verified:** task-owned `ShowControl_QA_API35`, API 35, no audio output. Three independent reboots cleared Android's audio-playback history; each fresh-boot dump showed no selected media-button session or prior Show Control audio history before explicit preparation. No song, touch GO or audible priming was used to establish the initial route.

| Case | Recorded observation |
| --- | --- |
| Cold performance, PID 3246 | Prepared Ready at 00:00; Android selected the current Show Control session. The private AudioTrack reported started, 44.1 kHz stereo, `mutedState:none`; public playback remained PAUSED, position/speed zero. |
| First GO while locked | Android media-session NEXT started the first song directly. Pause froze it at about 646 ms; Play resumed from about 654 ms; Previous selected silently at zero; another NEXT started once; Stop reset to zero. |
| Touch panic during verified playback | The observed fixed Fade 2s control returned playback to silent Ready/Recovery. This is native state/UI evidence, not a measured audible fade curve. |
| Cold Rehearsal, PID 3098 | Explicit Prepare showed 0 active sounds out of 8, source clock 0:00.000 and a disabled seek control; Android had already selected the session. After 66.05 seconds locked, the same owner remained selected and publicly silent at zero. NEXT then started the song; Pause and foreground return restored the paused position near 0.7 seconds with one paused voice. |
| Rehearsal exit | Explicit Exit released ShowAudioService and its media-button session. No private transport or foreground owner was retained by an idle builder. |
| Third cold performance, PID 1400 | Again selected before any song. Both observed Show Control Recents cards were removed; reopening Recents confirmed No recent items. The same PID, foreground service ID 1001 and silent Ready routing remained. Locked NEXT then started the first song; Stop reset it. |
| Explicit Android Stop and relaunch | Process ended. Relaunch returned to the original Library without an audio service. Exit history recorded USER REQUESTED / STOP APP. No audible state or pending command was replayed. |
| Preservation | Original one-song `OMS_smoke_test`, notification denial/flags, no Doze exemption, Saver/DND off, charging/100%, font 1.0 and rotation 0/auto 1 were retained. No import, edit, deletion or provider request occurred. |

The generic `adb input --longpress` attempt while asleep was dropped by Android InputDispatcher because no window had focus; the native app remained Ready. It is excluded from remote/held-input acceptance. Actual AVRCP hardware, repeats and exact remotes still require their named matrix. The successful locked tests used Android's direct media-session dispatch path. Early boot/idle snapshots and a Recents driver assumption were rejected and retried from fresh observations; they are not fabricated successes.

The source's silence comes from the pinned [Media3 1.10.1 zero-PCM generator](https://github.com/androidx/media/blob/1.10.1/libraries/exoplayer/src/main/java/androidx/media3/exoplayer/source/SilenceMediaSource.java), independent of mutable cache bytes. The previous cached WAV is left unreferenced; no user file cleanup or migration was introduced. The existing native wake, failure and shutdown policies remain intact. Physical audible silence, power/thermal cost and two-hour operation are still unverified.

Raw evidence is under `.native-check/cold-remote-*`, with UI hierarchies under `.native-check/protection-v2-cold-*`: immutable source/build/check/signature records, exact installed identity, fresh-boot dumps, current-owner routing results, native command observations, panic and Recents checks, cleanup and the scoped audit. The `crit` audit found no further high/critical issue in this delta; it does not close unrelated release blockers.

Physical Android/iOS, exact remotes/Flic, iOS/Xcode, the existing ordered-group GO blocker, historical ANR and long-run release gates remain open. This is not a readiness claim for 1,000 customers or a store release. The broader goal remains active.
