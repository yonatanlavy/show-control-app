# Reachable everyday workflows · 26 October 2026

The owner explicitly resumed UX/UI improvements after the finite Android close-out and promotional-panel removal. The current app and owned Android fixture are the baseline. This pass improves existing tasks with the existing design system; it makes no provider requests, changes no persisted schema or native playback contract, and preserves the removed promotional panel.

## Usability requirements

1. Keep playlist Import and Find music available after scrolling a long show. Move their existing commands into the shared preparation action bar, reducing the content above the song list.
2. Keep editor Back, save status and section navigation visible on long pages. Use a single editor scroll surface with a sticky toolbar; switching section returns to its start without animation. Preserve unsaved name/notes/exact-timing drafts, save failure recovery, paused audition and deliberate Back handling.
3. Keep silent remote Test available while reading connection instructions, assignments and health. Use the shared preparation action bar while retaining explicit capture ownership, expiration/retry, disabled states and no-sound testing.
4. Keep backup Create/Restore before prior results and archive details. Preserve measured progress, cancellation, committed-restore recovery and same-archive sharing Retry.
5. Distinguish importing phone files, using already imported music, downloading, and optional AI ideas. Update the three existing source labels in all ten languages; no AI requests are part of this pass.
6. Give native Recovery one deliberate next step. Suppress the generic “Open Recovery” banner only when the current Recovery page already handles that native fault. Retain data/task errors. Keep diagnostics and the no-audio fallback near the recovery actions instead of after the full cue list. Stop/Panic stay fixed and independent.
7. Review Library selection, Rehearsal and Run alongside these changes, preserve the main motor map, and verify no promotion reappears.

## Evidence and acceptance

The delivered baseline APK is `Show-Control-No-Promotional-Panel-2026-10-26.apk` (SHA-256 `BCC7FF22D5D4415024A13B00A62745DEF7E3D00CFC8265B637151931784AAE6E`). Its installed 1,200-song playlist places Import at `[42,807][524,996]`, inside scrolling content. After scrolling the old editor, its top Back/section controls disappear and the duplicate bottom Back is clipped at `[42,2363][1038,2337]`. These are concrete reachability problems, not a request for more decoration.

Existing editor, playlist, backup and controller tests cover draft protection, source-time timing, failures, cancellation, duplicates and command ownership. The remote position assertion now checks that Test is outside the scrolling content. A new Recovery regression requires one explicit recheck path, retained diagnostics, no automatic Retry/start and active safety controls. Initial focused checks passed 129/130; the old top-of-content remote placement assertion was superseded by the fixed action-bar requirement. The refined remote/Recovery suites pass 43/43.

Final source passes type, lint, 1,270 unit tests across 73 suites, architecture, all-ten-language translation and token checks. The Android release build and native module lint checks pass. The signed internal/test APK was installed and pulled back for SHA-256 verification. Nine packaged production-source hashes match the checked source; all 72 native/DEX/manifest/resource payloads match the preceding watermark-free build. Run implementation and prepared Rehearsal source remain unchanged.

Installed evidence uses the owned synthetic 1,200-song fixture, with no AI/provider requests or saved song changes:

- Builder's first song is 253 pixels higher at normal portrait size. Import and Find remain in their action bar after scrolling. Search hides that bar while typing, retains the query and restores the bar afterward. File-picker cancellation returns normally.
- Editor Back, saving state and sections stay visible while scrolling. Section changes return immediately to the beginning. Unsaved Back offers Cancel/Discard/Save; cancellation retains the draft, and deliberate discard restores the original name.
- The first UX candidate exposed three stacked sticky editor tabs at 150% text in Hebrew landscape. The delivered revision keeps those tabs on one row. In portrait, tabs hide while the keyboard is visible, leaving Back/save state and the field accessible; dismissal restores navigation. Android's landscape keyboard may use its own full-screen text-entry surface.
- Silent remote Test remains at the same bottom position while scrolling. A synthetic media-next press was counted without audio or saved mapping changes.
- A backup was created; cancelling Android's share chooser retained the saved archive. Create/Restore precede previous results. Failure, same-archive sharing Retry and cancellation semantics retain their existing regression coverage; this pass did not force a physical sharing failure or restore over the fixture.
- English/Purple Night, Hebrew/Dark Blue including 150% text and landscape, and Arabic/Cobra Builder/music-source screens were observed. These are targeted layout observations, not exhaustive screen-reader or all-language device certification.
- The final revision prepares Rehearsal silently (0/8 active sounds), exits normally, and arms Run silently. Run GO, Recovery and Panic retain their previous portrait bounds. An emulator call reached confirmed MODE_RINGTONE; playback controls then required deliberate recovery. Recovery has no circular Open Recovery action, keeps safety controls fixed, and places Diagnostics/Continue silent before the full cue list. Continue silent exits without resuming audio. Silent relaunch and cleanup are recorded separately.

The broader changed-flow observations were made on the first UX candidate; the delivered revision repeats the affected large-text editor, Arabic and safety/recovery observations after its sole follow-up layout correction. Final receipts are under the authoring checkout's `.native-check/ux-reachable-actions*` and `final-closeout-device/ux-*`. An emulator Bluetooth-system crash dialog was dismissed during startup; it is not evidence of exact-remote compatibility. Tests and emulator results do not certify physical screen readers, iOS, exact remotes/Flic, real audio/HDMI, historical ANR resolution, endurance or customer release.

## Delivery

`Show-Control-Reachable-Workflows-2026-10-26-r1.apk` · 154,829,961 bytes · SHA-256 `539ED4DCC3D1BE60FF76808B8520973447EFC8407FC48E06656D0C272A9B9628`. Internal/test signing and provisional app identity remain in use. Validated scoped sources are promoted to `C:/dev/personal/show-control-app`. Scope is the current task: make common workflows materially easier. No follow-up automation is created.
