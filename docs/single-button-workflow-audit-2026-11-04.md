# Setup and single-button show workflow audit

The active owner goal is to fix UI bugs and make the complete main workflow seamless: set up a show's local music, rehearse it, prepare the controller, and perform by pressing one contextual GO button each time. This audit retains that whole objective. Existing source and runtime state are authoritative; earlier test counts are a baseline, not proof that this goal is complete.

## Latest evidence index · 5 November 2026

Read this index before treating a historical "remaining" or "pending" entry below as current work. The chronological entries are preserved as evidence; several were superseded by later implementations and installed checks. The latest Android test checkpoint is [R8](download-cancel-responsiveness-2026-11-05.md): 1,615 tests / 87 suites, all required checks, exact installed APK identity, and scoped native download/GO/recovery/relaunch evidence. [R7](show-identity-workflow-2026-11-04.md) retains the preceding same-name identity and layout evidence. Neither checkpoint proves every device or interaction supported.

| Requirement | Later authoritative checkpoints and limits |
| --- | --- |
| 1. Create/select/import | [Hands-off follow-up](hands-off-workflow-follow-up-2026-11-04.md), [download consistency](download-commit-consistency-2026-11-04.md), and [R7](show-identity-workflow-2026-11-04.md): actual system-picker work, corrupt/cancel paths, public-URL conversion/attachment, and distinct same-name show selection. The complete current-APK network interruption matrix is not implied. |
| 2. Editor/drafts | [Workflow continuation](workflow-continuation-2026-11-04.md), [R6](portable-controller-workflow-2026-11-04.md), and [R7](show-identity-workflow-2026-11-04.md): precise timing and paused previews, failed/unsaved work, archive tuning retention and cross-show draft protection. |
| 3. Order/behavior | [Controller/sequence workflow](controller-sequence-workflow-2026-11-04.md) records actual playlist selection/reordering persistence. Earlier native rate/delay/crossfade/loop matrices remain dated evidence, not a claim that every combination was rerun on R7. |
| 4. Controllers | [Controller/sequence workflow](controller-sequence-workflow-2026-11-04.md), [imported-action repair](imported-controller-repair-2026-11-04.md), and [R6](portable-controller-workflow-2026-11-04.md): actual learn/test/save/cancel/held/unknown/Retry paths plus adapter/device/key identity. Exact physical hardware remains a separate gate. |
| 5. Contextual GO | [Hands-off follow-up](hands-off-workflow-follow-up-2026-11-04.md), [native robustness](native-robustness-2026-10-24.md), and R2–R7 reports record actual native selection, pause/resume, rapid input, overlap, loop/panic, capacity/decoder refusal and deliberate retry. Source/packaged-state comparisons determine what evidence can carry forward. |
| 6. Safety/layout/recovery | [Backup/RTL workflow](backup-rtl-workflow-2026-11-04.md) and [R7](show-identity-workflow-2026-11-04.md) record measured safety geometry, narrow/large/landscape/tablet and silent recovery/relaunch checks. The historical renderer/focus investigation and slow emulator cold starts remain open. |
| 7. Backups/defaults/library | [Backup/RTL workflow](backup-rtl-workflow-2026-11-04.md) and [R6](portable-controller-workflow-2026-11-04.md): actual malformed/cross-kind refusal, mixed restore and current export→restore→re-export with identity/tuning preservation. Cross-device physical restore is unverified. |
| 8. Localization/accessibility | [Backup/RTL workflow](backup-rtl-workflow-2026-11-04.md), [hands-off design QA](hands-off-design-qa-2026-11-04.md), and [R7](show-identity-workflow-2026-11-04.md): ten-language completeness, three themes and targeted EN/HE/AR/density/layout evidence. Hierarchy labels do not prove actual screen-reader announcements/focus order. |

The shared main/Hit seek defect and eager 200-Hit rendering listed below were fixed in the hands-off follow-up; backup and same-name ambiguity gaps were subsequently addressed by R4/R6/R7. They must not be repeatedly recast as unimplemented defects.

The [R8 cancellation checkpoint](download-cancel-responsiveness-2026-11-05.md) fixes separately reproduced initializer/Cancel monitor contention, concurrent cancellation/error priority and unclassified lookup errors, with updated failure guidance in all ten languages. Its final 1,615 tests / 87 suites, nine check groups, Android release/native-module lint/build, signature and installed checksum pass. After preserving and recovering the owned emulator, scoped installed acceptance also passes: offline error guidance, mounted Retry/active Cancel, public beep download and automatic attachment to the isolated section, original show selection, silent preparation, GO/pause/resume/panic, fixed safety bounds and silent exit/process relaunch. The R8 report retains the initial blocked attempt and records a separate stale-owner Retry limitation, unresolved startup cause and external device gates. The owner cleared the open-ended goal, then approved finishing these pending checks and delivering the test APK. That bounded close-out is finished; automatic improvement work was not resumed. Actual main-flow screen-reader navigation, physical Android/OEM/iOS, named remotes/Flic, audio/display routes, cross-device restore and endurance/customer-release evidence remain required.

## Requirements and evidence

1. Create/select a show and playlist, name it, import local audio, cancel or recover from bad files/URLs without losing work. Evidence: library/import regressions and installed setup flow using synthetic media.
2. Edit and retain song identity/tuning, trim/fade/delay/rate/loop/autoplay/crossfade, then return to the correct playlist with protected drafts. Evidence: editor tests and installed keyboard/Back/failure/layout observations.
3. Reorder and understand the resulting playback behavior; preparation explains manual GO and automatic starts without requiring technical knowledge. Evidence: playlist/editor summaries, sequence tests and full-sequence rehearsal.
4. Pair/assign/test the existing controller paths without starting show audio; preserve touch fallback and honest connection/receipt status. Evidence: diagnostic/control tests and exact available input evidence. Exact physical remotes remain a distinct gate.
5. Prepare silently, identify current/next songs, and have the same native contextual GO across touch and supported remote controls. Ready starts; playing advances; paused resumes; countdown/overlap ignores additional advances; previous selects silently; stop/panic cancels pending work; final-song behavior does not wrap. Evidence: runtime/native/UI tests and installed state sequences.
6. Keep GO/panic fixed and accessible through state changes, overlays, orientation and large text. Recover deliberately from interruption/route loss/relaunch without surprise playback. Evidence: source/style comparisons, rendered bounds, native state and fault-path tests.
7. Back up and restore setup safely, retain theme/language/defaults/music and surface actionable errors. Evidence: existing storage/UI regressions and targeted installed checks; cross-device physical restore remains unverified until recorded.
8. Cover EN/HE/AR rendered layouts, ten-language key parity, semantic labels/states, phone/tablet sizes and keyboard transitions. Record limits of emulator/accessibility evidence explicitly.

## Execution plan

1. Inspect current contracts, source, tests and delivered APK; preserve all preexisting changes. Review setup and transport independently.
2. Reproduce confirmed main-workflow defects, record expected/actual behavior, and apply focused shared-component or workflow fixes with regression evidence. Do not add decorative animation, change GO/panic geometry, make provider requests, or change saved music/defaults.
3. Run affected checks, then the complete type/lint/unit/architecture/translation/token and Android build/lint checks for the candidate. Use a synthetic fixture for installed setup/rehearsal/remote/Run/recovery/layout tests.
4. Audit current-turn changes, promote only validated files to `C:/dev/personal/show-control-app`, deliver a checksum-verified test APK and requirement-by-requirement status. Keep the full goal active wherever evidence is missing; do not turn a focused passing check into a claim that every UI/device workflow is proven.

## Findings and results

The previous goal turn delivered reachable action bars, a sticky editor toolbar, backup/recovery hierarchy, 1,270 automated tests and an installed Android test APK; that was concrete progress, but does not establish completion of this new, broader workflow goal.

### Confirmed defects addressed in this candidate

- MusicFinder retained its local Stop-preview state after native completion/error. Native preview state now owns the button's meaning; request versions reject old completion/rejection promises after a newer request or Stop. Five added regressions and 42 focused workflow tests pass. The old installed APK also retained Stop after the synthetic preview's native state was NONE.
- Compact Run omitted its only refusal/wait/recovery explanation. The existing bounded NEXT readout now displays exceptional guidance with the full next-song name retained for assistive technology. Its height is constant across compact states; GO/panic control geometry is unchanged. Five new assertions failed on the baseline, then passed with the fix.
- Exhausted Run presented Ready with an unusable GO. Complete now requires the authoritative exhausted native cursor; startup/inspection/fault/Stop-retained selection cannot be mistaken for completion. The final focused OMS suite passes 43 tests, including the new legacy and pending-independent-Hit cases.
- Show/playlist forms accepted names beyond their existing normalized 200-character authoring bound, then failed during save. They now validate before submission with ten-language guidance, retaining drafts and imported long names for correction. Generated show/playlist/cue copy names retain their suffix within their existing bounds without truncating explicit user input. Real SQLite and UI tests cover NFC, 200/256 boundaries, surrogate pairs, independent copied tuning, rejected writes and original-data preservation; 81 focused/compatibility tests pass.

### Current installed setup observations

On the owned Android emulator and preceding APK, created `SB-Workflow-QA-20261104`, imported a synthetic WAV through the real system picker, duplicated its song, and saved a precise 2.001-second trim through the editor. The original four seeded shows were not edited. Picker automation initially returned a null accessibility root; a fresh activity/screenshot observation confirmed the picker remained available, and retrying the observation succeeded. This was not treated as an application crash. English 150% landscape playlist scrolling reached song rows. Candidate build/install and affected-flow verification are pending.

### Remaining full-goal work and evidence

- Source audit found that native Rehearsal seek filters by cue ID on both platforms; a valid shared main/Hit cue ID can consequently move an independent Hit. This needs a focused reproduction and fix, with both native implementations and acceptance evidence. It is not fixed or claimed safe by this UI candidate.
- Run's Hits panel still eagerly maps all Hits into a ScrollView. The owned fixture has 200 Hits; investigate live rendering cost and window it if confirmed. No freeze is attributed to this observation.
- Continue the full setup/order/settings/remote/GO/countdown/overlap/loop/last-song/restore/error matrix against current packaged state. Prior narrow checks and green unit suites do not prove every workflow seamless.
- Physical iOS/Android, exact remotes/Flic, screen-reader ergonomics, wired/HDMI/route behavior, cross-device restore, endurance and the historical renderer/focus ANR remain outside the currently recorded evidence. The broad goal remains active while its requirements are incomplete or unverified.

## Verified candidate checkpoint

The final naming review restored a native input cap of 1,000 characters (or the complete longer initial imported value) while retaining normalized authoring validation and unsliced drafts. The naming/SQLite/compatibility set now passes 82 tests, superseding the earlier 81 count. The combined final source passes **1,295 tests in 74 suites**, type, lint, architecture, all-ten-language translation (803 messages plus native OS copy), token checks and Android release/native-module lint/build. Existing unrelated React test `act` warnings remain; this is not a warning-free-runtime claim.

The original 6-GB owned emulator refused APK replacement for insufficient storage. Android cache trimming and dexopt reset did not resolve it. Its five data/config/encryption files were backed up, its unsuccessful in-place disk-size experiment was reverted, and its config checksum matches the backup. No app data was cleared or app uninstalled. The original four seed shows were not edited; this pass's clearly named synthetic setup show remains in that stopped fixture. One preceding-APK cold preparation entered Recovery; its original cause was not established and must not be attributed to storage merely because the device was full.

A separate owned `ShowControl_SingleButton_QA` emulator was created with a 12-GB data disk. The final APK installs there and the pulled installed bytes match the delivered SHA-256. Its fresh synthetic fixture proves:

- First-run onboarding, a named show, normal system-picker import, independent song duplication and persistent library state.
- Silent preparation with GO available; GO starts the first song. System Pause shows one paused native sound, and the same GO resumes it.
- Three rapid system NEXT inputs during advancement select only the second song; Pause retains that song and one voice. Resuming and advancing the last song reaches Complete, zero active sounds and disabled GO without wrap.
- GO bounds are `[42,1582][1038,1855]` and Panic bounds `[556,1403][1038,1550]`, identical in Ready/Paused/Complete and to the preceding portrait build. Safety styles are unchanged apart from the bounded compact readout text. The 150%-text landscape completion/Touch Guard guidance fits; Panic remains enabled. Settled Recovery/Exit succeeds.
- A preview naturally finishes, returns to Preview and restarts with one press; Stop remains deliberate. A supplied over-limit name stays visible with the 1–200 guidance and disabled Create. Cancel discards that test draft.
- Force-stop/relaunch is silent, retains the imported two-song show, and does not repeat onboarding. No active Show Control media session remains afterward.

Transient picker accessibility-root failures and immediate taps during font/orientation recreation were re-observed after settling rather than classified as crashes or passes. Device state sequences prove emulator command/state behavior, not acoustic output or physical reliability.

| Requirement | Current evidence and remaining scope |
| --- | --- |
| 1. Create/select/import | Fresh installed create/import/duplicate pass; bad-file/URL/cancellation cases have automated coverage, full installed matrix remains. |
| 2. Song settings/drafts | Prior installed precise trim, current name validation and automated editor failure/draft cases; complete current installed editor audit remains. |
| 3. Order/behavior clarity | Existing summaries/tests retained; full rate/delay/crossfade/loop combinations and reorder pass remain. |
| 4. Controllers | Installed system-media contextual control passes; full learn/save/cancel and exact hardware evidence remain. |
| 5. Contextual GO | Installed two-song Ready/Pause/Resume/rapid advance/final no-wrap pass; broader pending/countdown/overlap/capacity matrix remains. |
| 6. Safety/layout/recovery | Stable portrait bounds, large-text landscape guidance, panic/exit and silent relaunch pass; earlier cold failure, interruption/route and physical matrix remain. |
| 7. Backups/defaults/library | Storage regressions pass; no persisted schema/default/media change. Current installed backup/restore and cross-device evidence remain. |
| 8. Localization/accessibility | Ten-language dictionaries and targeted EN native labels/layout pass; current HE/AR/all-language/tablet/screen-reader audit remains. |

## Artifact and continuation

`Show-Control-Single-Button-Workflow-2026-11-04-r1.apk` · 154,832,789 bytes · SHA-256 `E2CB760EF61E63C95F4118C67F5BBF5AB6507AAF6C5C1679214670E795917FC5`. Internal/test signing remains. Eight packaged production-source hashes match authored/promoted files; all 72 native/DEX/manifest/resource payloads match the preceding watermark-free build. The first candidate without the restored input cap is retained as evidence and is not the delivered revision.

Receipts are under `.native-check/single-button*`; scoped device XML/PNG is under `.native-check/final-closeout-device/sb-*`. The fresh two-song fixture is retained for the next audit; restart it only after confirming it is stopped, using `.native-check/single-button-fresh-start.ps1 -Reuse` and the matching `single-button-ui.ps1`. The original AVD and its backup stay separate. The goal is **active**, with native seek/Hit isolation and the remaining full workflow matrix next; this checkpoint does not claim all UI bugs fixed or full workflow completion.
