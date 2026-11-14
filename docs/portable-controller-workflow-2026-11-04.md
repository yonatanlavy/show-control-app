# Draft controller setups, backups and clear button identity

Follow-up work on the same-name show ambiguity is recorded in [show identity during setup](show-identity-workflow-2026-11-04.md). This report retains the evidence and limitations of the R6 APK checkpoint.

The updated Android test APK fixes draft-controller authoring/backup and distinguishes saved button identities. **1,552 tests in 84 suites pass**, with Android build/lint and exact installed-artifact checks. A real export → Android share → system-picker restore → re-export preserves all eight original shows and six profiles while adding independent copies. This advances the active full workflow goal; the remaining Library-label issue, historical ANR and release gates below prevent a claim of flawless or customer-ready operation.

## Goal and baseline

The preceding turn made concrete progress: it exposed imported semantic assignments, made failed edits lead to repair, protected queued mapping saves and delivered the checksum-verified `0C734B67BCB4140C087F062F09C863AEC3DB6CDC797706EB5683C4DAA9125B7D` Android test APK. Its 1,474-test/82-suite source and installed evidence are recorded in [the repair report](imported-controller-repair-2026-11-04.md).

This continuation retains the complete [setup → rehearsal → controller → contextual GO objective](single-button-workflow-audit-2026-11-04.md). The active owner instruction resumes workflow improvements; the older finite close-out remains historical. A baseline live check reconfirmed that preceding APK on the owned `ShowControl_SingleButton_QA` emulator, original `WF-Setup-20261104` three-cue selection, English/Dark Blue and no target service. No AI/provider request, native transport change, decorative animation, safety-layout change, schema migration, tuning change or media removal is planned.

## Confirmed gaps

1. A saved attached GO-only profile is valid editable state but prevents full-library backup. The document validator also compiles every playlist with its show-wide profile, blocking unrelated edits such as a new/duplicate playlist or deleting/moving a mapped Hit. Preserving unfinished setup must not require deleting saved assignments first.
2. Two devices with the same key/action, or restored and learned versions of that key, have identical normal-row/removal labels. Raw identity exists only in Diagnostics. Removing an assignment should identify the actual saved adapter/device/key and make restored rebinding explicit.
3. The unchanged installed APK reproduces the full-library export refusal, with Diagnostics `Backup contains an invalid show: CONTROLLER_INVALID.` Its visible explanation incorrectly asks the operator to choose another backup, an import instruction. Export validation failures need creation-specific guidance while restore and saved-archive share retries retain their own actions.

## Plan and safety policy

1. Keep runtime compilation and selected-playlist controller admission strict. Separate pure document-content validation from controller readiness for authoring and archives. Validate cue/media/timing/graph/visual/voice references fully; do not suppress broad compiler error codes or manufacture a runnable snapshot.
2. Preserve incomplete assignments and unavailable controller targets exactly as repairable setup. Validate every portable profile's structure, actions, identities and compound-input uniqueness, including unattached drafts. Reject an unresolved show-to-profile identity before restore rather than silently dropping the reference. Restore still assigns unbound local roles and never dispatches transport; preparation must still require repair or the existing deliberate touch-only choice.
3. Reuse a presentation-only binding identity across saved rows, removal names/confirmation and captured learning input. Keep the complete raw key so stripped prefixes cannot collide. Distinguish wildcard, unbound, shared system-media and coalesced-keyboard scopes honestly; stored identity is not live connection health.
4. Capture red regressions, including creation-specific backup failure guidance, then exercise actual SQLite/provider authoring and archive round trips, hostile archives and atomic failure paths. Verify new labels in all ten dictionaries and focused EN/HE/AR rendering. Run the complete required software checks, independent scoped review and Android build/lint; install/hash the exact candidate and exercise the changed public UI flows using synthetic media.
5. Promote only the frozen current-turn ledger, record exact evidence and remaining full-goal requirements, and deliver the updated Android test APK. Physical/OEM/iOS/Flic, acoustic/display, full assistive-technology, cross-platform transfer, historical ANR and endurance gates remain distinct.

No saved mapping is silently pruned, retargeted or converted into a default media GO. No implicit playback, remote reconnect test or network request is introduced. The persisted format remains schema two; compatibility and any changed validation interpretation will be documented in the backup contract.

## Results

### Implemented changes and regressions

The pure `validateShowDocument` validates editable content using a controller-free validation-only projection; no snapshot leaves that function. `validateLocalShow` keeps its existing caller signature and delegates to it. The strict runtime compiler and serialized store are unchanged. Saved profile associations and commands therefore survive new/copy playlists, moving/deleting mapped Hits and history restore; preparation still identifies the resulting unavailable mapping.

Raw controller definitions are checked before privacy projection into logical roles, and every portable profile is checked again at the archive boundary. This prevents invalid adapter/device metadata or unknown binding fields from being normalized away. Missing referenced profiles reject before native probing, file promotion or SQL changes. Schema, paths, CRC/SHA, media/native inspection, transaction and cancellation controls remain intact. Current readers can transfer draft-containing backups; older readers may reject those newly portable configurations.

The backend regressions reproduced **32 failures** across authoring/backup scenarios plus **seven raw-definition projection failures**. Final focused evidence passes **210 tests in six suites**, type checking and focused lint. It includes real SQLite/provider authoring and rollback, three actual file/archive/SQLite draft round trips, preserved assignments/associations, inert unbound restore, strict preparation rejection and malformed content combined with incomplete profiles. Evidence: `.native-check/workflow-r6-backend-result.json` and its frozen source ledger.

A shared presentation formatter now supplies full key and adapter/device scope for normal saved rows, Remove accessible names, confirmation and learned-input preview. Unbound roles explicitly need rebinding; shared system media and coalesced keyboard identities do not claim a physical remote. Captions wrap and complete identifiers remain accessible. Single-pass substitution also preserves literal placeholder-like text in identifiers and song names.

The two identity failures and three additional EN/HE/AR literal-target-name failures now pass in **98 focused tests/four suites**. Focused lint/type and ten-language checks pass. The creation-specific backup feedback adds three more red→green cases; its complete panel suite passes **10 tests**, retaining restore, cancellation, committed-restore recovery and same-archive share Retry. Evidence: `.native-check/workflow-r6-ui-result.json`, `workflow-r6-ui-review-red.json` and `workflow-r6-feedback-{red,green}.json`. These overlapping focused totals are not summed as a full-suite count.

### Installed baseline and verification boundary

The unchanged 0C734 APK reproduced the refused export and incorrect import-oriented explanation through ordinary Settings → Library backups. A system-picker restore then added immutable public `QA-R6-Same-Key-Remote-Roles.zip` (771,012 bytes; SHA-256 **C5AA88DF2FA7F664401D5581276AC50A1F5DF096819C4A90EEDF25BE3FD0D03F**). It contains one show/playlist, one main cue, one Hit, one previously native-proven synthetic WAV and four bindings across two logical roles, with no enabled voice rules or private credentials. Two same-key GO rows and their confirmation are indistinguishable on that baseline. Cancel preserves both assignments.

Device XML/PNG is under `.native-check/final-closeout-device/wf-r6-baseline-*`; the baseline receipt is `.native-check/workflow-r6-device-baseline.json`. The first picker observation returned a transient null accessibility root; the settled observation showed the actual Downloads picker, and only then was the fixture selected. This is not counted as an app crash or a successful import without evidence.

The complete final source check passes **1,552 tests in 84 suites**, type, lint, architecture, ten-language/native-copy translation, token and native-source checks. Existing unrelated React test `act` warnings remain in the full suite. Product and test source hashes remain frozen after these checks. Android release/module lint and the offline x86_64/arm64 build pass; these checks do not establish the full goal's completion.

A separate ignored, offline QA share target can hand an explicitly shared archive to public Downloads for same-device picker testing; that handoff is test infrastructure, never a main-app feature, physical sharing or cross-platform transfer claim. It has no permissions or Internet access, requires the OS-granted ZIP stream, bounds its copy and shows bytes/SHA-256. Its separate package and source are excluded from the main APK and verified by the packaged-entry scan.

### Delivered artifact and installed workflow

**`Show-Control-Portable-Remote-Workflows-2026-11-04.apk`** · **154,877,989 bytes** · SHA-256 **`A56BC9EBDD95F2A7FD501EBB0E0FFEFC3CC527286B03ED078452E0BD35FD6C8D`**. Internal/test signing and provisional package `app.showcontrol.working` remain. Build run `3abebc64-5538-47c2-a482-92ccb02495bc` exited zero. The pulled installed APK matches the full checksum. All seven changed production sources match the packaged-source map; 72 native/DEX/manifest/resource payloads match the preceding verified build. Eight packaged entries are scanned for absence of QA helpers, including the separate share receiver. The scoped promotion ledger contains seven production files, nine test files and four reports, preserving unrelated work.

The owned Android 15/API 35 emulator shows distinct same-key GO rows and unique removal labels for `logical-device-1` and `logical-device-2`. The confirmation identifies the selected second role; Cancel retains both. English, Hebrew and narrow Arabic confirmation views are readable. At 320 dp width/150% text, Arabic key/source details wrap and Close/Delete/Cancel remain enabled and at least 48 dp. Across all three captures, nine measured targets pass that bound. No mapping was removed for this comparison. Evidence: `wf-r6-candidate-same-key-visible`, `wf-r6-candidate-role-two-confirmation`, `wf-r6-he-role-two-confirmation`, `wf-r6-ar-narrow-role-two-confirmation` and `.native-check/workflow-r6-ui-acceptance.json`.

Ordinary Builder deletion of the mapped `Public R6 Hit` succeeds without removing its saved controller action. Duplicating the playlist then succeeds and selects its independently tuned copy. The exported data below proves that the missing-Hit action and both same-key GO roles remain saved. A first attempt to open Playlists while its header was scrolled offscreen was refused by the observer; scrolling/re-observation reached it. That automation observation is not classified as an application defect.

### Actual full-library backup round trip

On the installed APK, full-library export succeeds with the attached empty R4 profile and the R6 missing-Hit target still present. Cancelling the Android share sheet retains the completed archive; **Share saved backup** reopens that exact source filename. The deliberate offline QA target receives only its OS-granted stream, copies it into public Downloads and reports bytes/SHA. The public file is pulled and checked against that hash; no root or private-file extraction is used.

| Actual archive | Bytes / SHA-256 | Verified contents |
| --- | --- | --- |
| First current export | 3,568,827 · `4F15685E835B4F44C8A32AC606C6783FD12D4DA0196BF7B22029AF8981012453` | 8 shows, 11 playlists, 215 cues, 6 profiles, 13 bindings, 4 payloads |
| Re-export after ordinary picker restore | 3,703,780 · `D7A3B05AF3F8469B6AF121264E86F7F600D4FF886B6734FDFC698C9AA8173994` | 16 shows, 22 playlists, 430 cues, 12 profiles, 26 bindings, the same 4 deduplicated payloads |

Restore progress was observed at a measured 22%, followed by **Restored as new shows: 8 / 11 / 215 / 4**. No target playback service exists after restore. The independent read-only production ZIP/domain probe passes **all three actual-archive scenarios**: all five entries' CRCs and all four payload SHA values verify in each archive; all eight original show documents are unchanged; all six original profiles retain semantics and compound-role distinctions; eight restored shows/revisions, eleven sets and six profiles receive fresh identities. Tuning, graphs, media metadata, controller target associations and selected-playlist mapping are preserved, with zero measured metadata differences. Restored profiles are unbound. Private/live-state fields are absent. Both original and restored incomplete R4 and missing-target R6 configurations still fail strict runtime compilation with `CONTROLLER_INVALID`.

Evidence: `.native-check/workflow-r6-current-exports.json`, `workflow-r6-current-export-probe/{jest-result,result}.json` and captures `wf-r6-first-export-sharing-cancelled`, `wf-r6-first-export-same-archive-retry`, `wf-r6-first-export-received`, `wf-r6-actual-restore-result`, `wf-r6-actual-restore-counts`, `wf-r6-second-export-received`. These three archive probes are separate from the 1,552-test suite; they are not added to its count. The QA receiver was uninstalled successfully after deliberate show exit. This is same-device Android testing with an explicit test handoff, not Drive, physical-device or cross-platform transfer evidence.

### Native preparation, controls and safety

After the three ordinary operator confirmations, **Arm show remains disabled** for the missing controller target. **Review buttons** and the explicit **Arm with touch controls** choice remain available. Only that deliberate choice prepares the selected restored playlist, silently at Ready, zero voices and source position zero. This verifies that authoring/restore eligibility has not become automatic runtime eligibility.

Android media-session Previous selects silently, Next performs contextual GO, and Pause produces **Paused / one active sound**. The ADB dispatch calls complete in approximately 170–190 ms; these are tooling durations, not audio-onset or engine-latency measurements. The next GO resumes; native media state is `PLAYING`, speed 1 before the live touch emergency fade. Fade opens the existing Recovery screen, releases the voice and returns through Show armed to Ready/zero sounds. Starting again, advancing the last song and sending three more rapid Next commands finishes at **Complete / zero voices**, disabled GO and enabled emergency control, without wrapping.

GO remains **`[42,1582][1038,1855]`** and emergency Fade 2s **`[556,1403][1038,1550]`** in Ready, Paused, post-panic Ready and Complete. The initial raw virtual-key/snapshot sequence did not establish active playback; the short clip had completed by a later touch-GO UI observation. The measured OS-media route supplies the active-voice/resume evidence above. No speculative code change or physical remote claim is based on those earlier endpoints.

Evidence: `wf-r6-preflight-explicit-touch-choice`, `wf-r6-touch-run-ready`, `wf-r6-native-default-go-paused`, `wf-r6-live-panic-recovery`, `wf-r6-live-panic-return-ready`, `wf-r6-native-final-no-wrap`, plus the native media/timing receipts. Recovery → Stop and exit releases the target service. Final selection, preferences and settled silent relaunch are recorded in the closeout receipt.

Final Library selection is `WF-Setup-20261104` with its three-cue first playlist. The older original row was chosen using the validated public manifests' timestamps and the source's newest-first order. After idle force-stop/relaunch, the settled Library retains that caption/count, shows fifteen other shows and no target service. The first immediate capture was the loading view; only the settled capture supplies relaunch evidence. Normal 1080×2400/density420, font1.0, portrait rotation0/automatic rotation1 and English/Dark Blue are restored. The QA receiver is absent. Captures: `wf-r6-final-wf-builder`, `wf-r6-final-silent-relaunch-settled`; receipts: `workflow-r6-final-device-state.json`, `workflow-r6-final-settled-services.txt`. All sixteen synthetic original/restored shows are retained; no app data was cleared.

### Remaining work against the full goal

The actual restore revealed a recoverable Library ambiguity: two shows with identical saved names and cue counts have the same normal **Open show** and **Manage** labels. Filtering `WF-Setup-20261104` presents two indistinguishable three-cue rows; source ordering and the validated public manifests identify the older original for test cleanup, but that is not a user-facing distinction. Existing documents are intact. Distinguishing these copies visibly and for assistive technology is the next confirmed software task, not fixed by this candidate. Evidence: `wf-r6-restore-identical-show-labels` and current `LibraryScreen` row labels.

| Full workflow requirement | Current evidence / remaining scope |
| --- | --- |
| 1. Create/select/import | Current public-picker restore and playlist copy pass; same-name restored-show selection needs clearer identity. Complete installed URL/corrupt/cancel matrix remains. |
| 2. Song settings/drafts | Existing editor/draft/timing regressions pass; current actual archive round trip retains all tuning. Full current installed editor/attachment matrix remains. |
| 3. Order/behavior clarity | Mapped-Hit deletion and independent playlist copy now save without discarding assignments; preflight explicitly identifies controller ineligibility. Broader rate/delay/crossfade/loop combinations remain. |
| 4. Controllers | Same-key identity, unbound status and exact removal confirmation verified EN/HE/AR; strict repair/touch choice retained. Exact remote/Flic hardware and lifecycle remain unverified. |
| 5. Contextual GO | Current silent preparation, OS-media GO/pause/resume, panic and rapid final no-wrap pass; full countdown/overlap/capacity matrix remains. |
| 6. Safety/layout/recovery | Current four-state fixed bounds, deliberate exit and silent relaunch evidence recorded. Historical renderer/focus ANR and physical interruption/route/OEM/full-layout matrix remain. |
| 7. Backup/defaults/library | The incomplete-profile backup defect is fixed. Actual current export/restore/re-export verifies originals, fresh identities, tuning, settings and mappings. Physical cross-platform/Drive transfer remains unverified. |
| 8. Localization/accessibility | All-ten-language/native-copy checks and focused EN/HE/AR labels/confirmations pass, including narrow Arabic/150% text. Full screen-reader/tablet/fluent-language/all-surface validation remains. |

Physical Android/OEM, iOS/Xcode, exact remotes and licensed Flic integration, acoustic output/HDMI/microphones, cross-platform restore, two-hour runs, production signing and store/pilot acceptance remain separate gates. The historical Android ANR has no newly proven cause or fix. The broad goal remains **active**; this is a tested Android development checkpoint.
