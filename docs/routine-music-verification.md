# Routine music verification ledger — October 14, 2026

Implemented: 26 multi-select portable show-role categories; conservative defaults; explicit sound presets; device library search, preview, sharing and independent song copies; section routine text; validated BYOK recommendations and clarifications; reviewed external-source search; Android yt-dlp/FFmpeg service; iOS helper/background transfer; captured-section attachment, recovery and cancellation.

Latest follow-up: [24 October download/helper refinement](download-workflow-refinement-2026-10-24.md) records 890 passing tests, origin-bound pairing, bounded helper replies, cancellable setup, action ownership, clearer history guidance and exact-APK Android lookup/import/cancel/interruption/RTL evidence. The dated baseline below is retained; iOS/physical/customer-release gates remain open.

## Automated evidence

- Existing regression suite: 176 tests passed before new cases.
- Final regression suite: 225 tests in 25 suites passed, including 49 additional music, provider, download and navigation cases.
- Python helper: 14 tests passed after correcting multicast-address rejection.
- Final type checking and source lint passed after the UI and recovery fixes.
- All 415 messages and native OS/notification copy passed ten-language parity.
- Android Kotlin, full ARM64/x86-64 app build and downloader native lint passed in C:/dev. Native lint used the alternate Kotlin analyzer after its initial tool crash. Findings fixed: Hebrew resource folder naming, cached-process scheduler bursts and storage reporting. Java socket-temp and staging path-length build issues were resolved.
- AI network behavior is tested with mock providers. No paid/live AI request was made.

## Edge cases checked

1. Quiet manual new-song defaults.
2. Every role keeps loop/autoplay/crossfade off and rate 1.
3. Existing tuning survives migration.
4. Multi-category selection preserves performer tags.
5. Clearing categories does not resurrect old inferred roles.
6. Existing 170-library tags derive usable roles.
7. Equal immutable content deduplicates across shows.
8. Unicode title searching.
9. Empty search results.
10. Copying to a missing section or from a deleted song.
11. Media-ID collision without overwriting an existing cue's audio.
12. Reuse of identical content under a different ID.
13. Routine length bounds and playlist duplication.
14. Invented AI library IDs rejected.
15. Duplicate/incompatible recommendation fields rejected.
16. Provider-created URLs and live command/code fields rejected.
17. Clarifications require choices without simultaneous recommendations.
18. Canonical library title replaces a misleading provider title.
19. Missing/invalid AI keys, quota, offline and provider errors.
20. Arming/cancellation while a response is in flight.
21. Unsupported schemes, credentials, private/loopback/numeric hosts and ports.
22. Public DNS mixed with private or multicast addresses.
23. Captured destination retained during download.
24. Deleted destination before attachment or while queued for storage.
25. Explicit reassignment of an unassigned completed file.
26. Crash after SQL commit before housekeeping without redownload.
27. Cancel before native start completes.
28. Cancelled/interrupted/failed/oversized native results cannot attach.
29. Low-storage save failure preserves completed download.
30. Cancelled searches discard late results.
31. One active job and idempotent helper POST.
32. Pairing authentication and rejected browser origins.
33. No generic filesystem routes; isolated deletion.
34. Process-death helper jobs remain interrupted.
35. No shell-option injection from queries.

## Combined failure cases

| Combination | Defense/evidence |
| --- | --- |
| Legacy tags + multi-category change + clear | Explicit category marker, domain tests |
| Equal media + different show + different settings | Immutable dedup and independent cue copy tests |
| Existing media ID + different content + copy | ID remapping regression |
| Existing library ID + invented title/query | Canonical title and structured validation tests |
| Clarification + choices + requested edits/download | Read-only schema, no action/URL fields |
| Navigation + download + finish | Captured native destination; device validation below |
| Deleted destination + storage queue + finish | Retain completed file, queue-race test |
| Cancel + native initialization + late result | Native cancellation flag and no attachment test |
| Committed SQL + failed housekeeping + relaunch | Idempotent download tag, housekeeping test |
| Low storage + finished file + retry | File retained, failed-save test |
| Public URL + private DNS/redirect + IPv6 fallback | Public-only tunnels and mixed-address tests |
| Backup transfer + keys/helper credentials | Portable settings exclude secure storage and job records |

## Remaining platform gates

Windows cannot compile/execute the iOS module or validate physical iPhone microphone/output/background behavior. Physical Android controllers, PA routes, 16 KB devices, venue runs and store distribution/licensing remain separate gates. Emulator checks do not establish acoustic quality or physical-device readiness.

## Live preparation evidence

API-36 Android emulator, existing data preserved: the device finder indexed the 170 music tracks plus one distinct existing test asset. A public MP3 URL resolved through on-device yt-dlp and downloaded 9,252,699 bytes, then attached to the captured MusicQA section. Its native state remained stopped with zero voices. Saved editor volume was −18 dB and rate 1. Waveform decoding of the actual MP3 returned 128 peaks, maximum 0.991546630859375, duration 231,262 ms, stereo, 44,100 Hz.

Live YouTube search returned five real source URLs. Android extracted a 7,308,380-byte MP3 from a reviewed Cipher source. The completed file remained ready before restart; foreground recovery attached it once. A second cold launch retained exactly two test cues and zero playback voices, without repeating attachment. Native cancellation during startup produced cancelled state and no file URI. The old upstream test-video URL was unavailable on both Android and desktop; this was a real source failure, not treated as a successful download.

The computer helper independently resolved/downloaded the licensed Cipher MP3 and produced SHA-256 d3d0614535a61d748e2fd8d5117fc4d781022a7624794802a2462d8af3fdd522, matching the original library media. No live AI was invoked.

Actual UI inspection fixed a blocked Builder navigation item on music subpages, misleading empty-download/missing-section text, missing deliberate retry for interrupted jobs and slider labels wrapping inside narrow controls. Minus/plus controls retain translated accessible labels. After verification the disposable MusicQA show and its three terminal download records were removed. Both original shows still displayed 100 and 70 cues. Unrelated download records were retained, and native playback remained stopped with zero voices.
