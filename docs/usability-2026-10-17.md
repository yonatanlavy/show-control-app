# Usability refinement · 17 October 2026

## Outcome and execution plan

Make common non-AI workflows easier to find, understand and complete using the existing native design system. Preserve the music library, saved tuning, offline operation, explicit playback intent and Run's fixed GO/panic geometry. No provider requests, decorative motion, dependency, schema or native transport changes are planned.

1. Library/Builder: searchable shows and songs, truthful results, early next actions and independent Hit editing.
2. Song editor: focused Audio, Playback and Details sections; central draft/save/preview state survives section changes.
3. Remotes: reachable silent test, focused Connection/Buttons/Test sections, concise guidance with unchanged native learning and expiry behavior.
4. Imports/downloads/backups: explicit source and destination, keyboard submission, clear empty/reset states, retained local files and clear saved/share/retry results.
5. Preflight/Run/Recovery/Settings/display/help: reduce mandatory scrolling, explain the next action and disabled states, improve child navigation; retain safety controls and deliberate sound-producing actions.
6. Complete language, type, lint, unit/architecture and token checks; audit current-turn diffs, build an updated Android APK, install and exercise the changed non-AI workflows in English/Hebrew and large text where available.

## Ownership and compatibility

Independent agents own Library/Builder, song editor, and remote/help files. The root owns shared navigation/fields, imports/backups, stage/settings/display refinements and translation registration. Preserve the existing dirty worktree and copy pre-turn source baselines to `.native-check/usability17-baseline`. Promote only authored current-turn files to `C:/dev/personal/show-control-app` after verification. The previous tested APK remains available.

All sections share the canonical library and native semantic command interfaces. Search filters never rewrite stored order. Editor tabs never play audio or reset drafts. Controller tabs never start diagnostics; Test/Learn remain explicit actions. Import cancellation has no success message. Backup sharing reuses the completed archive. Recovery selection remains silent until Start is pressed. No UI timer becomes an audio clock.

## Evidence boundaries

Record actual changes and final verification here. Automated and emulator evidence cannot certify physical audio, exact remotes/Flic, HDMI, iOS or long show runs. Existing physical-device gates remain open. No claim of bug-free operation or complete parity is made.

## Implemented workflows

| Workflow | Material improvement |
| --- | --- |
| Shows and playlists | Search names and notes without changing stored order, clear/no-result states, direct Open/Rehearse/Run, selected-playlist preservation and compact artwork identity. |
| Builder and Hits | Search main songs and independent Hits together; silent Hit editing and Hit-bank ordering; truthful duplication and show-wide deletion wording. |
| Song editor | Audio, Playback and Artwork & details sections share persistent drafts, save state and preview controls. A smaller phone summary reveals the tools sooner; saved playback details expand on demand. |
| Remotes | Test without sound is available near the top. Connection, Buttons and Test have focused views; guidance is secondary. Native diagnostics remain in the Activity and retain expiry/background cleanup. |
| Imports and downloads | Explicit file/device/download sources and captured playlist destination, keyboard submission, guarded cancellation, meaningful empty/reset states and truthful loading/retry/progress. |
| Backup | Operation/result appears before new actions. Completed archive and Share precede statistics; failed sharing reuses the saved ZIP. Settings section changes keep the completed result mounted. |
| Preflight and Rehearsal | Required checks first; Arm and silent Prepare sit outside scrolling content. Optional explanations expand on demand. |
| Run and Recovery | Contextual next-action text in the existing fixed-height Run slot; native-owned Recovery selection, early Stop and exit, searchable cues and visible armed Voice Disarm. |
| Display, Settings and help | Explain disabled display test, early blackout, focused Settings sections, child-page Back and searchable translated walkthroughs. |

## Bugs corrected during the pass

1. Open/Rehearse/Run could reset the selected playlist to the first playlist in a show.
2. Independent Hit-only songs lacked a usable editor entry, and their playback summary could infer the first main song as a next-song destination.
3. Hit reordering could act on the main song order; dual-member duplication was ambiguously labelled.
4. Editor section changes could discard child-owned exact timing drafts. Identity and timing drafts now live in the editor and save together.
5. A failed setting Retry could accidentally save an unrelated name draft and lose the failed tuning change.
6. Removing a Hit's last playlist reference could close its editor and lose unsaved drafts. Save/Discard/Cancel now protects that exit.
7. A combined trim save could leave an old preview playing outside the newly saved trim. It now stops the preview before persistence and preserves edits if stopping fails.
8. Recovery's optimistic pointer could disagree with the native selected song. Start now uses acknowledged native selection and waits for pending commands.
9. Armed Voice Disarm became hidden by the new Recovery disclosure. It remains directly visible.
10. Download history could show an empty state before loading completed or after a read failure. Loading and Retry are explicit.

11. A global retry of failed import/search work could lose its progress and abort ownership. Every attempt now owns a fresh signal, Cancel and unmount cleanup; obsolete retry callbacks cannot reopen a picker after departure.
12. An editor's global raw-write Retry could bypass draft reconciliation and leave a stale Not saved state. Persistence errors now have one editor-owned Retry and Diagnostics, including Save-before-exit; failures after unmount still reach the global fallback.
13. Separate media PLAY/PAUSE receipts increased diagnostic progress without appearing in any action row. They are grouped in the pause/resume display count while exact native commands and saved mappings remain unchanged.
14. Late iOS helper-settings hydration could overwrite a newly typed server address. User edits now win; loading is explicit and failed reads can retry without overwriting manual entry. This has deferred-promise regression evidence, not an iOS device claim.
15. Help reused song-search wording, including a song-specific empty result. Help now names its own topics and explains no matches in all ten languages, with a filtering/Clear regression.
16. A successful or cancelled background task could erase the retry callback for a newer failed import. Retry ownership now clears only for that exact work; the real-provider regression reproduced four failures before the fix and passes afterward.
17. Cancelling a reopened picker left an old durable library error onscreen after its Retry callback had completed. Explicit Retry now acknowledges that prior error first; cancellation stays clear and a repeated failure supplies its new error. Library initialization failures retain their distinct recovery path.

## Installed Android checks

The release APK was updated in place on the existing API 35 x86_64 QA emulator, with its library preserved and no development server. No AI feature was invoked or voice armed. Current evidence is in `.native-check/usability17-*.xml` and `.png`.

| Check | Observed result |
| --- | --- |
| Show search → no results → Clear | Correct zero count and unchanged original collection on Clear. |
| Builder search for Hit | One of four entries; independent Hit editor opens silently. |
| Hit Playback section | Autoplay/crossfade disabled with Hit-specific explanation; no save or playback on section selection. |
| Remotes first viewport | Test without sound reachable immediately; no repeated scroll to find it. |
| Silent media diagnostics | GO, play/pause, previous and stop each registered once after the diagnostic session was ready; Back returned to Buttons without saving a binding. These are injected virtual media events, not physical remote evidence. |
| Backup export and cancelled system share | Completed ZIP retained; switching Appearance → Backup and sharing again used the exact same archive UUID. Test library counts stayed 6 shows, 7 playlists, 17 songs/references and 5 media files. |
| Local audio picker cancellation | Returned through the system picker without an added-song success or library change. |
| Invalid URL using keyboard Search | `http://127.0.0.1/test.mp3` rejected with translated public-HTTPS guidance, Retry/Diagnostics/Dismiss; no download. |
| Preflight | Three explicit required confirmations; Arm visible before scrolling and disabled until complete. Preparation reached Ready silently. |
| Run Ready geometry | GO `[42,1582][1038,1855]`, panic `[556,1403][1038,1550]`, exactly matching the previous APK's 1080×2400 baseline. |
| Recovery | Early Stop and exit returned safely to preparation. Selection/search and separate Start were present; safety footer stayed visible. |
| Rehearsal preparation | Silent Prepare reachable in its fixed preparation action bar. No automatic playback. |
| Final compact editor | Waveform/seek controls now appear on the initial phone viewport. Draft name survived Details → Audio and Cancel on Back; explicit Discard restored the original QA16 Loop name. |
| Separate media commands | Final diagnostic received six events: GO 1, pause/resume 3 (toggle, PLAY and PAUSE), previous 1, stop 1; progress 60%. |
| Saved backup action layout | Share saved backup is visible at `[128,1650][952,1776]` before statistics at the default font size. |
| Paused countdown and rapid GO | Paused two-second pre-play countdown displayed its remaining time. Five rapid NEXT inputs resumed once without advancing; pausing afterward still showed song 1/3. |
| Panic and guard | Panic led to Ready in Recovery. Touch guard disabled GO while panic stayed enabled and usable. |
| Landscape | GO `[1211,303][2124,555]`, panic `[1684,156][2125,282]`, exactly matching the prior landscape baseline; controls remained visible. |
| RTL and large text | Hebrew remote/preflight and Arabic help inspected at font scale 1.3; required checks and Arm remained reachable. Language/font/rotation were returned to their original values afterward. |
| Absent audience hardware | Disabled silent test explained connection/refresh; blackout remained available. No hardware detection success was fabricated. |
| Empty MP3 and final Retry retest | Rejected with precise empty-size guidance and no added song. The final 540-test APK reopens the picker on Retry; cancelling returns idle with no stale error or success notice. Verified in `usability17-release-retry-picker.xml` and `usability17-release-cancelled.xml/.png`. |

The first emulator update attempt ran out of installation reserve. Disposable emulator caches were trimmed and installation retried successfully; app data was not cleared and the emulator storage thresholds were restored after installation. An incorrect test-only deep link produced the router's unmatched-route screen; the actual `find-music` route and visible navigation work. Neither harness event is claimed as an app defect.

Repeated later APK updates retained temporary installation space until an emulator restart. Restart released it (91 MB → 685 MB free); the final update installed successfully without uninstalling or wiping the app. Its final test process log contains no fatal exception or ANR marker. Tests ended with playback stopped, no preview/diagnostic session active, English/default theme and the original font/rotation settings restored.

## Edge-case coverage

The final automated suites include these current-pass regression paths; installed observations above are additional evidence rather than substitutes for hardware checks:

1. No matching shows; Clear restores the collection.
2. Search changes do not change stored cue order or original ordinals.
3. Show/playlist selection change resets stale search.
4. Open/Rehearse/Run preserves the current playlist.
5. Repeated Open taps while selection saves cause one navigation.
6. Failed selection or unmount causes no late navigation.
7. Hit-only songs open for silent editing.
8. Hit reordering uses the Hit bank rather than the main order.
9. Name/notes/exact timing survive section changes.
10. Invalid or empty identity drafts block combined Save.
11. Invalid/overlapping trims block Save and Save-before-exit.
12. Exact millisecond timing survives collapsed panels.
13. Failed combined save retains recoverable edits.
14. Failed tuning Retry preserves unrelated valid/invalid drafts.
15. Rapid double Save submits once.
16. Hit-only removal protects drafts; Cancel retains membership.
17. Save-before-removal failure preserves membership; successful Retry completes the exit.
18. Combined trim save stops audition before persistence.
19. Audition stop failure blocks trim persistence.
20. Paused audition remains paused when selecting editor sections.
21. Final legacy cue summary does not promise continuation.
22. Hit-only autoplay/crossfade is disabled with an accessible explanation.
23. Editor-owned failure has one Retry; unmounted failures still reach the global fallback.
24. Remote tabs retain protocol without starting learning, scanning or transport.
25. Separate PLAY/PAUSE commands have truthful diagnostic counts.
26. Repeated, stale, queued and duplicate remote inputs do not inflate counts.
27. Diagnostic Back/Close/background/unmount cleanup remains effective.
28. Pairing blocks competing learning/test/protocol changes.
29. Cancelled picker produces no success notice.
30. Source keyboard submission observes disabled and duplicate guards.
31. Late cancelled search results do not replace current results.
32. Retried imports/searches regain fresh cancellation ownership.
33. Retried import unmount aborts; obsolete Retry cannot reopen its picker.
34. Helper hydration/retry preserves manually entered address and token.
35. Download loading/failure cannot masquerade as an empty history.
36. Backup share retry and section changes retain the completed ZIP.
37. Arm remains outside scrolling checks and disabled while preparing.
38. Recovery uses native selection and blocks Start during pending commands.
39. Armed Voice Disarm remains visible outside diagnostics.
40. Help filters translated guidance, distinguishes no results and supports Clear.
41. Foreground download recovery finishing after an import failure preserves Retry.
42. Foreground recovery beginning after a failure preserves Retry.
43. Unrelated cancellation cannot erase the newer failure's callback.
44. A successful Retry clears its own callback so it cannot replay again.
45. An earlier Retry completing after a newer failure leaves the newer Retry intact.
46. Explicit Retry acknowledges the previous durable error; cancelling its picker stays clear.
47. A repeated failure after Retry publishes its new error rather than the acknowledged one.
48. Initialization failure still offers initialize recovery and cannot be dismissed as an ordinary file error.

Ten combined failure paths received regression or installed evidence: Hit-only + unsaved name + removal; failed tuning + unrelated invalid timing; paused preview + section switching; retried import + unmount; helper read failure + typed address + Retry; background recovery + failed picker import; separate Play/Pause + duplicate/stale diagnostics; saved ZIP + cancelled share + Settings section changes; Hebrew RTL + 1.3× text + fixed Arm; and paused countdown + rapid GO + guarded panic/rotation. These combinations are scoped to this pass and do not replace the physical transport matrix.

Existing full-suite coverage also exercises transport, architecture, archive validation and migration compatibility. The current pass does not claim a new physical cross-platform archive round trip, acoustically measured fade, Bluetooth range test or two-hour show run.

## Final verification and delivery

| Check | Evidence |
| --- | --- |
| TypeScript | Passed; `.native-check/usability17-types.log`. |
| ESLint | Passed with zero lint warnings; `.native-check/usability17-lint.log`. |
| Full unit/component/architecture suites | 540/540 tests, 46/46 suites; `.native-check/usability17-tests.json`. |
| Translation/native copy parity | 675 messages across all ten languages; `.native-check/usability17-translations.log`. |
| Canonical tokens | Generated files match; `.native-check/usability17-tokens.log`. |
| Expo configuration/dependencies | Doctor 21/21; `.native-check/usability17-doctor.log`. No dependency changes. |
| Android release build | Successful with arm64-v8a and x86_64; `.native-check/usability17-final-build.log`. |
| Package integrity | APK v2 signature verified using the existing internal Android debug certificate; bundled JavaScript and both native ABIs verified. Min SDK 24, target 36. |
| Scope | 28 authored files; no native transport, schema, media-library or provider-key edits. Pre-turn baselines retained. Current-turn `crit` and React quality reviews completed through the same repair/verification loop. |

Existing React test `act` warnings and Gradle deprecation notices remain in logs; passing checks are not described as warning-free execution. Shared iOS UI branches have automated coverage; no Xcode/iOS native build or physical-device validation was available.

Delivery: `C:/Users/Administrator/Documents/ChatGPT/Computer Use/Show-Control-Usability-2026-10-17.apk`, 154,531,833 bytes. SHA-256: `6DA5F353C5378284682B8C2BBB24AC94E5384031B39248EC4A6BD3BF2DA0F4BD`.

The previous `Show-Control-Tested-2026-10-16.apk` is preserved. The updated artifact remains an internal test APK; store publication is a separate step. Final source equality and delivery hash evidence are recorded in `.native-check/usability17-source-ledger.json` and `.native-check/usability17-apk-evidence.json`.
