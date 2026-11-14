# Non-AI adversarial QA · 14–15 October 2026

Use the isolated Android development app with synthetic local media and disposable shows. Preserve the computer's music library and existing tuning. Make no AI/provider requests and do not arm voice recognition. Source fixes must match Android/iOS contracts; Windows cannot provide Xcode or physical hardware evidence.

## Execution

1. Record the current source and app state. Prepare valid audio, empty/disguised audio, image/video and malformed backup fixtures outside the app's canonical library.
2. Exercise Library/playlist CRUD, duplication, reorder, trash/restore; song settings, exact timing, draft exit, audition, trim, rate, fades, delay, loop, autoplay, crossfade, colors/categories, artwork/visual pickers and Hits.
3. Exercise URL validation, downloader availability/cancellation/history/attachment, local file selection, duplicate/corrupt import and abandoned-work recovery. Do not download paid/copyrighted show music for QA.
4. Exercise backup picker cancellation, export/share cancellation, saved-archive retry, restore and malformed archives. Use controlled tests for disk-full and interrupted commit, rather than filling or damaging the device.
5. Exercise Rehearsal, Run/Recovery, rapid GO, pause/seek, Previous/Stop/Panic, independent Hits, generic media keys, background/process death, touch guard, blackout, timer and display setup without hardware. Exact remotes/Flic and physical output remain separate gates.
6. Fix observed defects and refine their UI. Verify typed contracts, lint, unit/architecture, translations/tokens, native build if affected, actual Android workflows and the final production bundle. Audit the current-turn ledger and promote only verified scoped source.

## Edge-case ledger

Record results rather than assuming every item passed. Cases: empty/whitespace names; pasted URL as a song name; duplicate show/playlist names; independent duplicate tuning; reorder at either end; deleting a selected show; restore after delete; cancelled audio picker; zero-byte audio; text disguised as MP3; duplicate media bytes; visual file passed to audio import; video disguised as a cover; cancelled visual picker; invalid/zero-length trim; millisecond precision; comma/Arabic decimal entry; unsaved Back; paused edit/seek; preview followed by background; no autoplay incoming; final song no-wrap; rapid GO during countdown/overlap; loop advance; eight-voice refusal; independent Hit; panic preemption; stale scheduled command; invalid URL scheme/credentials/private host; oversized URL; cancelled download; missing runtime/offline download; cancelled backup picker; malformed/traversal/future/checksum archive; failed share reusing saved ZIP; interrupted/low-storage save; route loss/process death; guard/blackout escape; timer Recovery/rotation; absent external display.

Combinations: rate/trim/fade; rate/delay/crossfade; loop/manual advance; paused audition/edit/silent seek; invalid exact timing/unsaved draft/Back; URL/selected-section/download cancellation; duplicate import/independent settings/delete; export/share failure/retry; restore/visuals/controller mappings; locked playback/media buttons/route recovery.

## Evidence

### Environment and scope

The actual Android development app (`app.showcontrol.working`, Android 15/API 35, emulator-5560) ran the production SQLite library and native audio/download modules. Rehearsal supplied the full-sequence test mode. Mutations used disposable Break-Lab shows, original synthetic WAV/MP3/image/video fixtures and MDN's public DTMF audio example. The computer's existing music library was not edited. No AI provider requests, generated artwork/music, voice arming, uploads or messages were made.

UI = actual touch/system-picker/media-button workflow. Native = real Android module state/events on the emulator. Automated = bounded, controlled unit/integration tests, including real local SQLite/archive I/O with mocked platform adapters. None is physical acoustic, HDMI or iOS evidence. The emulator has no audible output; voice counts and transport events cannot establish acoustic quality.

### Corrections delivered

- Exact timing drafts now belong to the song editor, survive collapsed sections and failed saves, and participate in Back/Save/Discard. Save on exit validates combined trims and the editor's timing bounds before one commit. A 0.053-second fade was saved and reopened as 53 ms; independent duplicate tuning remained 800 ms.
- Seconds parsing accepts comma/Arabic decimal keyboards and Arabic/Persian digits while rejecting unsafe numbers, ambiguous separators and precision beyond milliseconds. Existing tuning and new-song defaults remain intact.
- Pasted unsafe URI schemes cannot become source-search queries. Valid HTTPS links are canonicalized before lookup, including uppercase schemes. Oversized/option-like/control-character inputs fail before native work.
- Empty-file, free-storage and corrupt visual messages now describe the actual problem. A corrupt JPEG cannot replace valid artwork, and video disguised as JPEG receives image-only guidance.
- Backup errors have one panel with Retry, Dismiss and expandable Diagnostics. Failed sharing reuses the saved ZIP; the Library avoids an extra generic loading banner competing with measured backup progress.
- Playlist behavior badges are compact rather than repeated editor instructions. A pending playlist deletion displays one confirmation action. All new text is present in ten languages; no decorative animation or Run geometry changes were introduced.
- Native stress fixtures await preparation directly and measure countdowns with native monotonic events. The earlier short inspector test could deliver presses after the fade ended; the strengthened test submits a burst inside an observable overlap and adds a real-time delay assertion at different outgoing/incoming rates. No product transport change was justified by that harness timing artifact.

### Edge-case results

| # | Case | Evidence and outcome |
| --- | --- | --- |
| 1 | Empty/whitespace show name | UI/automated: submission disabled; no show created. |
| 2 | Cancelled name edit | Automated: no commit, old name retained. |
| 3 | Show duplication/rename | UI: disposable duplicate created and renamed. |
| 4 | Selected show deletion | UI: explicit confirmation; selection moves safely. |
| 5 | Persistent trash restoration | UI: Deleted Shows restored the copy with saved songs/playlists/media. |
| 6 | Playlist duplication | UI/automated: new playlist and independent cue identities/settings. |
| 7 | Reorder boundaries | UI: first/last moves disabled; moving the copy up changed order. |
| 8 | Empty selected playlist | UI: zero count; Rehearse/Run preparation actions disabled. |
| 9 | Selected playlist deletion | UI/automated: confirmation, safe fallback selection and history/restore action. |
| 10 | Cancelled audio picker | UI/automated: no phantom cue or committed change. |
| 11 | Zero-byte MP3 | UI: rejected; original count unchanged; clear file-size guidance. |
| 12 | Text disguised as MP3 | UI: native probe rejected it; no cue committed. |
| 13 | Duplicate media bytes | UI/read-only SQLite: two cue settings, one immutable MP3 asset. |
| 14 | Uppercase MP3 extension | UI: valid import, native duration 8.045 seconds. |
| 15 | Image/video selected as audio | UI: system picker disabled those entries. |
| 16 | Video disguised as JPEG cover | UI: rejected as a cover; no artwork replacement. |
| 17 | Valid manual artwork | UI/SQLite: synthetic PNG attached and persisted. |
| 18 | Valid manual video | UI/SQLite: silent video attached with 320 × 180 metadata. |
| 19 | Corrupt image | UI: visual-specific message, existing artwork retained. |
| 20 | URL-shaped notes/name | UI/automated: saved as plain text; no implicit fetch. |
| 21 | Millisecond timing | UI/SQLite: 0.053 seconds persisted as 53 ms after reopening. |
| 22 | Comma/Arabic/Persian timing | UI comma normalization and automated parser cases pass. |
| 23 | Negative/unsafe/over-precise timing | Automated: rejected; invalid exit has no Save action. |
| 24 | Invalid/zero-length trim | Automated: invalid start/end cannot commit on exit. |
| 25 | Delay beyond editor range | Automated: invalid on-field save and Save-on-exit blocked. |
| 26 | Unsaved Back/collapsed timing section | UI/automated: Save/Cancel/Discard guard; draft survives collapse. |
| 27 | Failed exact save | Controlled: draft retained, retry available, no false close. |
| 28 | Paused tuning change and silent seek | Native/automated: initial-paused generation never briefly plays. |
| 29 | Isolated audition boundary/end | Native: source-time clamp, single-pass end despite loop/autoplay, no Run events. |
| 30 | Loop-boundary panic | Native: silence reached at 0.7×, 1× and 2×. |
| 31 | Rapid GO during countdown/overlap | Native: one incoming start; no queued extra advance. |
| 32 | Paused overlap and repeated resume | Native: two voices held; one resume; outgoing ends correctly. |
| 33 | Incoming shorter than overlap | Native: completion deferred; next autoplay-off song selected silently once. |
| 34 | Eight voices and crossfade refusal | Native: outgoing retained, transition released, deliberate retry succeeds. |
| 35 | Independent Hit | UI/native: one active Hit while main current cue remains empty and selection unchanged. |
| 36 | Touch GO and media play/pause | UI/native: current source position held paused. |
| 37 | Paused rehearsal seek | UI/native: source seek stays paused; native performance seek refused without ACK. |
| 38 | Panic/stop preemption | UI/native: zero voices; pending transport work cleared. |
| 39 | Background NEXT/STOP | UI/native: NEXT starts contextual selection, STOP clears voices without wrapping. Debugger attached; full JS suspension remains a device gate. |
| 40 | Process kill and relaunch | UI/native: fresh engine stopped, zero voices, committed shows retained; no repeated onboarding. |
| 41 | Final-song exhaustion/legacy groups/waits | Native/automated: no wrap; actual selection published; group panic covers all voices. |
| 42 | File/private/credential/unsupported URL | UI/automated: blocked before source lookup/download. |
| 43 | Oversized/option-like lookup | Automated: fail closed, no native request. |
| 44 | Successful on-device download | UI/native: MDN DTMF MP3 stored locally and attached exactly once to captured section. |
| 45 | Rapid download cancellation | Native: cancelled record, no output URI, no attachment or audio change. |
| 46 | Unavailable/interrupted download | UI: W3C source returned anti-bot 403; larger MDN transfer hit TLS interruption. Both reported failure and left library unchanged. No bypass was added. |
| 47 | Cancelled backup picker | UI/automated: no documents/settings committed. Android Back navigates folders before dismissing; wait for picker before cancelling. |
| 48 | Export and cancelled OS sharing | UI: saved ZIP retained; no claim it was sent. |
| 49 | Share saved ZIP again | UI: same filename/UUID reused; archive count remained unchanged. |
| 50 | Failed/unavailable share | Controlled: saved file retained; retry shares it without exporting again. |
| 51 | Deleted saved archive | Controlled: new export offered rather than false saved/share result. |
| 52 | Malformed/future/traversal/SHA archive | UI: rejected at intended checks; read-only SQLite counts unchanged. Test ZIPs normalized to the documented UTF-8 STORE encoding so SHA/schema/path checks actually execute. |
| 53 | Genuine backup restore | UI/native/SQLite: 2 shows, 2 playlists, 3 songs, 4 deduplicated payloads restored as independent documents, including artwork/video/Hits and 53/800 ms tuning; nothing played. |
| 54 | Interrupted save/low storage/staging cleanup | Controlled SQLite/filesystem tests: rollback, retained originals and bounded cleanup; device was not filled. |
| 55 | Stale scheduled commands/recovery | Controlled runtime/native contracts: reject changed captured session/song and preserve deliberate recovery. |
| 56 | Missing external display | UI: Connect a display, separate readiness, disabled silent test and fallback precedence guidance. No HDMI evidence claimed. |
| 57 | Controller hub/navigation | UI/automated: mappings and foreground keyboard limitation explained; child Back works. No pairing/physical compatibility claimed. |
| 58 | Timer/guard/blackout/theme/RTL/large text | Current automated suites pass; prior UI evidence remains in whole-app-refinement.md. New badges use existing tokens; full physical assistive/rotation validation remains pending. |

### Ten combination checks

| Combination | Acceptance evidence |
| --- | --- |
| Rate + trim + fade preview | Native preview fixture and source-time audition tests; absolute source position retained. |
| 2× outgoing + 0.7× incoming + delay + loop + crossfade | Native overlap fixture; ≥1.18 seconds native elapsed for a 1.2-second delay, one incoming start and paused overlap retention. |
| Short outgoing remainder + long delay; short incoming + longer overlap | Native: preserve the two-second real-time delay despite a short 2× outgoing remainder and permit a gap; defer short incoming completion until outgoing ends, silently select once. Acoustic overlap/gap quality pending. |
| Short loop + long panic | Native at three rates: reaches zero voices without fade restart. |
| Loop + manual advance | Native: continuous outgoing fade, transition survives until outgoing ends. |
| Paused audition + tuning edit + silent seek | Native initial-paused generation and UI controller tests: no transient playing event. |
| Invalid exact draft + collapsed section + Back/save failure | UI/controlled tests: retained edit, no invalid commit or false navigation success. |
| Duplicate import + independent tuning + playlist/show CRUD | UI + SQLite + operations tests: shared bytes, distinct cue settings, recoverable deletion. |
| Export + cancelled/failed share + retry | UI same saved ZIP; controlled failed-share/missing-file cases; restore with visual/controller portability checks. |
| Background media controls + stop + process death/relaunch | Actual Android native state and UI: no replay/automatic audible resume. Physical route-loss/locked-device behavior remains pending. |

### Verification and audit

- Current complete offline suite: **421 tests / 38 suites**, including architecture/storage/UI and existing provider tests with mocked adapters; no provider calls.
- Type checking, lint, design-token generation check, and **608 translated messages plus native OS copy across all ten languages** pass.
- Android audio/downloader native lint and debug build pass for x86_64/arm64-v8a. Production Android bundle exports successfully after final source promotion.
- **18 native preview/OMS/legacy regression groups**, plus native cancellation and actual UI/media/process-state checks pass. Raw event/SQLite/UI trees remain in the task's ignored `.native-check/break-*` evidence files.
- The single project `crit` audit covered only this turn's ledger, compatibility, input/archive bounds, native ownership, storage atomicity, mounted callbacks, accessible disabled states and semantic-token UI. Safe findings were corrected and proportional checks repeated. Source promotion preserves prior versions and verifies scoped hashes against `C:/dev/personal/show-control-app`.

### Remaining acceptance gates

macOS/Xcode or a suitable iOS build service; physical Android/iOS audio and HDMI; exact remotes and licensed Flic iOS integration; fully suspended/locked operation; wired/Bluetooth route changes, interruptions and microphones; real cross-platform archive transfer; screen-reader/large-text/RTL/device rotation checks; acoustic fades/time stretching/loop quality and two-hour runs. Voice recognition was not armed or benchmarked. Downloads still depend on source availability, authorization and network reliability; the failed external-source cases above are not certified compatible. This pass does not establish zero bugs, complete parity or store readiness.
