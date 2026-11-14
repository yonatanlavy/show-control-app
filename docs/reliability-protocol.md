# Reliability and recovery protocol

## Principle

A professional system is not one that claims never to fail. It detects what it can, fails silent when uncertain, preserves work, exposes a simple manual fallback, and lets the performer rehearse recovery until failure has choreography.

This document governs engineering behavior, QA, release evidence, and the operator guidance surfaced in the product. It does not certify the current scaffold as show-ready.

## Safety invariants

1. No uncertain state causes automatic audible playback or replay.
2. Panic fade and stop have highest command priority and are available by touch while armed.
3. Controller failure cannot remove touch control; future automated triggers cannot remove manual equivalents.
4. Route loss/change, interruption, relaunch, process death, and engine fault never surprise-resume audio.
5. An armed run uses a compiled immutable revision. Editing cannot mutate it.
6. Live media is local, app-owned, validated, and bound by checksum/identity—not a streaming URL, cloud placeholder, or picker URI.
7. Persistence is atomic. A failed edit/import/migration leaves the previous committed revision recoverable.
8. Duplicate, repeated, stale, and rapid controller inputs produce deterministic tested results.
9. A green check means an observed condition passed; unobservable PA/RF/cable/venue conditions are named, not guessed.
10. Safety, recovery, backup, and diagnostic information needed to understand a failure remain free.

## Engineering failure behavior

| Event | Required behavior | Forbidden behavior |
| --- | --- | --- |
| Missing/changed/corrupt media | Block arming; identify cue/asset; offer locate/reimport/remove | Substitute similarly named file or stream |
| Engine prepare failure | Remain out of Run; preserve snapshot/revision; log redacted code | Enter a partly armed screen |
| Voice limit reached | Refuse new non-safety voice, emit capacity event, preserve active voices; panic still preempts | Kill an arbitrary active cue silently |
| Duplicate/held input | Suppress by defined phase/repeat/debounce policy | Fire multiple `GO`s unpredictably |
| Dispatch without acknowledgement | Show uncertain command; do not retry audible command; expose recovery | Assume success or auto-replay |
| Audio interruption/focus loss | Follow native safe pause/fade/stop policy; mark interrupted; require deliberate resume | Continue or resume secretly |
| Route loss/change | Safe stop/fade; show old/new route and uncertainty; return through recovery/preflight | Silently reroute to speaker or resume |
| Controller disconnect | Keep touch controls; warn; allow reconnect/test or continue by touch | Exit Run or disable panic |
| Healthy app background/lock | Continue playback and supported control through iOS audio background/remote commands or Android MediaSessionService; keep exact state | Suspend merely because UI is hidden, or claim verified before device gates pass |
| Calls/Siri/alarms/audio-focus loss | Enter Interrupted/safe state; require explicit resume | Auto-resume after the interruption |
| Output-route removal | Immediately mute/stop before device-speaker fallback; require route recovery | Leak show audio from the phone/tablet speaker |
| Process/OS kill or crash | Persist no “playing” assumption; relaunch to recovery, never audio | Restore audible state automatically |
| Save/import/disk-full failure | Roll back transaction; retain previous revision; clean staging where safe | Leave a half-visible show/media record |
| Migration failure | Restore pre-migration copy or open read-only recovery/export path | Continue with mixed schema |
| Commercial/network failure | Hide optional surface; leave all core paths operational | Block library, Run, panic, recovery, import/export |

## Programming protocol

- Use final DRM-free local files. Do not program from Spotify, Apple Music streaming, YouTube, venue Wi-Fi, or a cloud-only placeholder.
- Prefer WAV/AIFF or a cross-platform format proven by the app's device matrix. Reimport after editing instead of altering bytes behind an existing asset.
- Trim silence intentionally; set per-cue level; choose fade duration/curve; verify end behavior. Default to manual `GO` around audience dialogue.
- Auto-follow only inside duration-controlled sequences such as a fixed montage, pre-rendered reveal, or bows.
- Build independent Hits for ad-lib punctuation and at least one neutral transition/emergency bed. Keep a backup finale accessible.
- Keep controller grammar simple: one tactile action for `GO`, one distinct action for panic, optional distinct navigation. Avoid double/hold sequences for destructive or finale actions.
- Rehearse the exact compiled revision that will be performed. Export it after the final change and verify the backup on the second device.
- Loudness-match cues through a representative PA and check mono summing. Until in-app analysis exists, this is an external production step.

## Operator pre-show protocol

### Before a run of shows

- Freeze the known-good app/OS configuration. Disable automatic OS/app updates where controllable. The app's initial Expo update configuration is disabled; verify the installed build identity.
- Remove/disable unrelated notifications, calls where possible, alarms, and voice-assistant announcements. Use Do Not Disturb/Focus. Lock-screen/background support is required, but test it rather than relying on it; keeping the visible armed screen available remains operationally useful.
- Carry: primary and backup controller, spare/charged batteries, manual touchscreen path, power, second cable, second adapter/interface, DI as appropriate, second device or emergency playlist, and written cue order.
- Verify the exported bundle imports and plays locally on the backup device. A copied archive is not a backup until restored and tested.

### At the venue

- Route show audio by cable through a suitable adapter/interface and DI to the mixer. Bluetooth control can be acceptable; Bluetooth audio transport is not the recommended mission-critical route.
- Test the exact output route, both channels/mono sum, gain structure, cue loudness, panic fade, and recovery with the venue's full technical system active.
- Test each performing position after the room fills where possible. RF behavior changes with phones, Wi-Fi, wireless microphones, LED processors, Bluetooth devices, and human bodies.
- Run app preflight and explicitly review warnings the app cannot observe: mixer mute/fader, DI/cable after the device, PA zones, RF environment, remote concealment, and human operator readiness.
- Perform at least a start/middle/finale cue and every essential Hit/controller action. Test controller loss and touch takeover.

### Immediately before performance

- Confirm show, set, revision/build, output route, device power, remote health, local files, screen awake, Focus/Do Not Disturb, backup readiness, and accessible recovery path.
- Arm deliberately. Do not edit after arming. If editing is necessary, leave Run, create/rehearse a new revision, and preflight again.

## Recovery drills

Every release candidate and operator should rehearse:

1. Panic fade from playing, paused, modal/recovery-open, controller input, and maximum-voice states.
2. Replay current only after deliberately confirming it is appropriate.
3. Skip and previous without accidentally triggering the selected cue.
4. Start an arbitrary recovery/finale cue by touch.
5. Controller disconnect during silence and playback; continue by touch; reconnect/test without firing a cue.
6. Audio cable/USB route removal during playback; confirm safe state; reconnect; re-preflight; deliberately resume/restart.
7. Call/alarm/other-audio interruption; return and reconcile state without surprise resume.
8. Healthy background/lock/foreground while playback and supported controls continue; then calls/Siri/alarms/focus loss into Interrupted with explicit resume; then OS process kill/relaunch into recovery without sound.
9. App restart with a readable last confirmed cue/revision and no claim that an unacknowledged command played.
10. Continue the performance without music using the written/emergency cue sheet.

## Engineering test matrix

### Automated

- Property/fuzz tests for valid/invalid show graphs, cue order, group cycles/depth/offset overflow, trim/timing bounds, selectors, capacity, and immutable compilation.
- Command sequences with simultaneous input, rapid/held/bouncing keys, out-of-order/stale events, missing ACK, panic preemption, stop during prepare/fade, shutdown, and engine generation change.
- Repository/media tests for atomicity, disk full, permission denial, process interruption points, orphan cleanup, duplicate content, corrupt database, migration rollback, and old-version fixtures.
- Bundle tests for traversal across both separators, absolute/UNC paths, symlinks, duplicate/case-collision paths, huge counts/sizes/ratios, checksum mismatch, unknown schemas, malformed Unicode/names, collision imports, and round trips.
- UI tests for panic availability, stable geometry, error clarity, touch fallback, accessibility states, EN/HE/RTL, Dynamic Type, and reduced motion.
- Architecture tests proving commercial/network/telemetry code cannot enter domain, audio, command router, repository, preflight safety, or recovery.

### Physical devices

Record model, OS version, build hash/version, storage/power/thermal conditions, output hardware, controller/firmware, network/RF setting, duration, and pass/failure artifact. Test at minimum:

- low/mid supported and current iPhone/iPad; low/mid supported and current Android phone/tablet;
- every advertised codec/sample-rate/channel combination;
- internal speaker only for recovery observation, wired analog adapter, USB audio interface, representative DI/PA, headphones, and route changes among them;
- two-hour and repeated full-show runs, maximum voices, fades/loops/trim/auto-follow/Hits, rapid controls, screen awake, reduced motion, largest text;
- incoming calls/alarms/notifications/assistant/other media, audio focus/session, background/foreground, lock/unlock, process pressure/kill, low battery, charging transitions, low storage, airplane mode, and thermal load;
- exact generic input classes claimed, at real performing range and in a populated RF environment, including disconnect, battery removal, reconnect, held/repeat, duplicate, and touch takeover.

A test in Expo Go, simulator/emulator, or one flagship phone does not satisfy this matrix.

## Incident handling

Classify as release-blocking: unintended audible cue/replay; panic unavailable or materially delayed; corrupt/lost show or failed restore; wrong media/cue triggered; silent unsafe route change/resume; remote event causes nondeterministic multi-GO; critical recovery inaccessible; or core playback blocked by entitlement/network.

For every incident preserve redacted build/device/OS/route/controller and command/event sequence, reproduction steps, expected vs actual, recovery used, audience impact, and whether the backup worked. Never collect the user's media, show/cue names, notes, or filenames without explicit case-specific consent. Add a regression test and repeat the affected physical matrix before resuming rollout.

## Release evidence levels

Use only these labels:

- **Contract/scaffold:** type or configuration exists; no runtime proof.
- **Automated verified:** named tests pass in CI/local environment.
- **Simulator/emulator verified:** behavior observed without physical hardware; audio/controller claims remain open.
- **Physical-device verified:** recorded build/device/OS/output scenario passes.
- **Named-hardware verified:** exact controller/interface/firmware scenario passes.
- **Performer pilot verified:** rehearsals and low-risk performances completed with incident log and backup.
- **Store released:** signed build approved and staged; not a universal hardware guarantee.

Never collapse these labels into “supported” without linking the applicable matrix.
