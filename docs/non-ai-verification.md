# Non-AI refinement evidence · 14 October 2026

Scope: [approved plan](non-ai-refinement-plan.md). No provider requests, secret reads, AI/voice changes, music-library replacement, decorative animation or Run GO/panic geometry changes. This is a source and emulator verification record, not complete paired-platform parity or a store release.

## Delivered source

- [Song editor](../src/ui/song-editor.tsx): artwork summary, native cursor/outlined trim, millisecond fields, units, isolated previews, volume/rate/trim/fades/curve/delay/loop/autoplay/crossfade, colors/categories/manual visual attachments/notes/Hits, draft protection and save recovery. Disabled legacy crossfade exposes accessible state. New-song defaults remain −18 dB, 800/1,800 ms fades, rate 1, delay 0, loop/autoplay/crossfade off and crossfade 2,000 ms.
- [Native audio](../modules/show-audio/): initially paused preview admission, continuous loop fades/mute, overlap ownership until outgoing completion, incoming refusal rollback, silent prepared route invalidation and runtime session purpose. Persistence is unchanged.
- [Full-sequence Rehearsal](../src/ui/rehearsal-screen.tsx): silent native Prepare, explicit contextual GO, pause/resume, previous, native seek, Hits, stop/panic and deliberate exit. Editing is blocked by the shared prepared-session gate. [Playlist metadata](../src/ui/song-metadata.tsx) shows behavior flags and trim/rate-adjusted duration.
- [Audience display](../src/ui/audience-display.tsx): independent hardware detection, cable guidance, private phone controls, fallback preview/precedence, image-only replace, confirmed removal, guarded silent test pattern and stale event barriers. See [display detail](audience-display-refinement.md).
- [Backup panel](../src/ui/BackupPanel.tsx) is shared by Library/Settings. [Backup progress](../src/storage/backup-progress.ts) reports measured work, pre-commit cancellation, restore counts, completed-archive share retry and conservative idle temporary cleanup. [Format](library-backup-format.md) documents bounds and portability.
- [Session stopwatch](../src/ui/SessionStopwatch.tsx) retains elapsed time, visibility and drag position above Run/Recovery. [Help](../src/ui/help-screen.tsx) provides concise walkthroughs; child-page navigation uses the correct parent tab. All new copy has ten-language coverage and three-theme semantic tokens.

## Automated/native checks

Final integrated source checks passed: TypeScript, zero-warning ESLint, **368 tests in 36 suites** including architecture, ten-language parity for **588 messages** and native OS copy, and token generation parity. The final editor large-text refinement also passed its 57 affected tests. Focused editor, rehearsal, audience, backup and stopwatch tests exercise production components/runtime with mocked native boundaries. These do not prove audible output or physical display/controller behavior.

Android native lint passed for ShowAudio, ShowController and ShowVisual; the x86_64/arm64-v8a development APK built successfully. The cold-start route correction was rebuilt and linted successfully. Production Hermes export passed. No iOS build was available in this Windows environment.

Production PCM and visual event-barrier regression programs exercise the actual Kotlin helper classes. [Native preview](../tests/native/preview-regression.js) and [OMS transport](../tests/native/oms-transport-regression.js) fixtures run in the Android development build against ephemeral, inaudible synthetic snapshots. They never edit the user library and always shut down their native session.

## Edge-case ledger

Automated entries name acceptance fixtures; native entries additionally require the executed native result. Physical-only scenarios remain pending even when their source path is checked.

| # | Edge | Acceptance / evidence |
| --- | --- | --- |
| 1 | Trim start at/after end, negative or beyond source | Editor and domain validation reject before save; song-editor/domain tests |
| 2 | Millisecond trim/delay/fade values | Exact timing round-trip/editor tests; no seconds rounding |
| 3 | Save fails after draft edit | Recoverable draft + retry; song-editor/store-recovery tests |
| 4 | Back with unsaved name/notes | Save/discard/stay protection; song-editor tests |
| 5 | Paused tuning edit then silent seek | Native initialPaused + AppProvider test + preview native fixture |
| 6 | Preview leaves editor/backgrounds | Native Stop and stale callback rejection; editor/arm-flow tests |
| 7 | Rapid preview replacement/error | Generation and cue identity exclude stale callbacks; arm-flow tests |
| 8 | Legacy playlist crossfade | Disabled checked/disabled switch, legacy semantics preserved; editor/domain tests |
| 9 | Loop boundary during panic | Continuous gain clock; PCM program + native transport fixture at 0.7/1/2× |
| 10 | Loop boundary during manual advance | No recurring envelope dip; PCM program + native overlap fixture |
| 11 | Extra GO during overlap/countdown | Native transition remains owned; runtime + native fixture |
| 12 | Incoming ninth voice refused | Outgoing selection/playback retained; deliberate retry; native fixture |
| 13 | Incoming decode fails | Atomic admission rollback on iOS; source audit, runtime fault fixtures; physical corrupt-codec drill pending |
| 14 | Ready/stopped route removal | Android prepared route invalidates without active voices; native source/build; physical cable drill pending |
| 15 | Route removal during countdown | Scheduled work cancelled, deliberate recovery; native source; physical drill pending |
| 16 | Delayed command captured previous song/session | Native generation/selection guards; command/runtime fixtures; device drill pending |
| 17 | Process dies/relaunches | No automatic audio resume; runtime startup fixtures; physical process drill pending |
| 18 | Final song ends or advances | Stop without wrap; runtime stack-exhaustion fixture and native order bounds; physical natural/manual completion pending |
| 19 | Display hardware absent | Separate detected/ready state, actionable setup; audience tests/emulator |
| 20 | Display disconnect/reconnect | Audio untouched; renderer state and barrier; audience/scene tests; physical HDMI pending |
| 21 | Disable/re-enable audience output | Clear visual latch on both platforms; barrier tests/source audit |
| 22 | Old visual start after Stop/Panic | Monotonic blackout and generation floor reject stale work; production barrier program |
| 23 | Video shorter than song | Muted renderer holds final frame; both-platform source, physical playback pending |
| 24 | Cancelled media/backup picker | No mutation/error toast for cancellation; storage/UI tests |
| 25 | Video disguised as cover image | Native probe rejects wrong media kind; storage import fixtures; physical picker decode pending |
| 26 | Low storage/interrupted archive | Staged writes, bounds/checksum/transaction rollback; library/backup tests |
| 27 | Saved ZIP share fails or file disappears | Same-file retry or explicit new export; backup-panel/workflow tests |
| 28 | Run → Recovery → Run, hide or rotate timer | Session clock/position persists; stopwatch tests; native UI rotation evidence below |
| 29 | Countdown before any main voice | Seek disabled, pause/previous/safety available; real AppProvider rehearsal tests |
| 30 | Stop after progress | Rehearsal cursor returns to trim start; rehearsal tests |
| 31 | Foreground missed VOICE_START | Authoritative native count survives progress notifications; runtime rehearsal tests |
| 32 | Stale staging still in use | Active leases protect cleanup; only recognized old temporary paths; backup-workflow tests |
| 33 | Initial output enumeration arrives after silent preparation | Filter unchanged added-output reports, retain real removal/noisy signals; eight production route regressions + cold Android Rehearsal prepare |
| 34 | Auxiliary tools retain landscape widths on portrait return | Recreate only the auxiliary layout owner when its row mode changes; explicit sizing/wrap states; two emulator rotation cycles restore all six control bounds |

## Emulator observations

14 October 2026, `Medium_Phone_API_35`, Android 15/API 35, x86_64 development build. This available emulator had no prior music library. QA used only the existing synthetic 30-second WAV (SHA-256 `a79c60a668102d470f4dc35b0a8844750d61e1a9487e7611d2d530bb6589af1c`), imported through the system picker into one test show. The original computer music library was untouched.

- Actual native preview fixture passed five groups: isolated single pass, absolute source time, pause/silent seek/resume, initially paused changed tuning with no playing event before Resume, clamp/Stop and armed-preview rejection/isolation.
- Actual native transport fixture passed eight groups: performance seek refusal without source jump/ACK, paused absolute rehearsal seek at 2×, panic across short loops at 0.7/1/2×, delayed/paused overlap with repeated GO suppression, incoming shorter than overlap and eight-voice crossfade refusal/deliberate retry. Final cleanup left zero voices and no prepared show.
- Cold-start Rehearsal after the route fix stayed Ready, purpose rehearsal, zero voices, with no route-loss event. UI preparation required explicit GO; touch GO produced playing/one voice, Pause produced paused, silent ten-second seek, Stop and Exit returned to preparation.
- Editor summary/defaults/waveform and translated labels were inspected in English and Hebrew. Hebrew large text at 1.6× and landscape were inspected; timing/unit cards now stack rather than splitting their values. Arabic RTL Settings, ten-language selector and all three theme selections were inspected. Full screen-reader and ten-language device walkthroughs remain pending.
- Audience setup correctly reported absent display hardware and retained private controls. Physical HDMI/visual playback remains pending.
- Native backup export produced a local ZIP and the Android share sheet with Drive available. Dismissing sharing returned a truthful saved result (one show, playlist, song and payload) plus Share saved backup; no recipient/destination was selected.
- Stopwatch advanced to 01:26 across Run → Recovery → Run, paused at 01:27, and retained 01:27 through hiding and rotation. Two final orientation cycles (timer hidden/shown) restored all four auxiliary controls. Portrait GO `[42,1582][1038,1855]` and panic `[556,1403][1038,1550]` stayed identical. No decorative animation was added.

The scoped final `crit` audit closed optional-property/disabled-switch, initially paused preview, countdown seek, stopped progress, foreground voice-count, trimmed-video, native rehearsal-seek admission, cold-output enumeration and auxiliary-footer rotation findings. Final source promotion is hash checked; only scoped authored files are copied, with originals preserved. Font scale 1.0, portrait/automatic rotation, English and Dark Blue are restored; test playback exits silently.

## Ten combinations

| # | Combination | Acceptance / evidence |
| --- | --- | --- |
| 1 | Rate + trim + fade | Preview source-time/native PCM tests; physical pitch/acoustic envelope measurement pending |
| 2 | Rate + delayed crossfade | Rate/fade PCM regression and native delayed overlap at 1×; complete 0.7/1/2× audible delay/overlap matrix pending |
| 3 | Short remainder + long incoming delay | Native scheduler preserves wait and permits shortened overlap/gap; source tests; physical gap timing pending |
| 4 | Short loop + longer panic | PCM/native fixture at three rates |
| 5 | Loop + manual advancement | Native overlap fixture, no automatic looping envelope dips |
| 6 | Paused countdown + rapid GO | Runtime and native fixture resume once, no queued advances |
| 7 | Paused overlap + remote semantic input | Native coordinator fixture; exact physical remote input pending |
| 8 | Eight voices + crossfade | Native capacity refusal/retry fixture preserves outgoing voice |
| 9 | Locked playback + route loss | Native fail-silent source/build; physical locked wired/Bluetooth drill pending |
| 10 | Restore + visuals + portable controller mappings | ZIP/library round-trip fixtures preserve media/rules/maps, disable output and require rebinding; Android ↔ iOS system transfer pending |

## Open paired-platform gates

macOS/Xcode (or suitable iOS build service), physical Android/iOS audio and HDMI, exact controller/Flic hardware and licensed Flic iOS integration, screen-reader device walkthrough, cross-platform system share/Drive transfer and two-hour runs need recorded device/OS/build/hardware/date evidence. No claim of perfect playback, universal remote compatibility or complete parity is made from this pass.
