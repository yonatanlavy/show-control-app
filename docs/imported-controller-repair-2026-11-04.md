# Imported controller repair and single-button workflow

The updated Android test build makes imported button assignments visible and repairable, routes blocked edits directly to that repair, and prevents an old removal from overwriting newer mappings. The final source passes **1,474 tests in 82 suites** and all required software checks. The exact APK was installed and checked on the owned Android emulator. This is **progress toward the active full workflow goal**, not a claim of complete parity or customer readiness.

Subsequent work on the two software gaps recorded here is tracked in [draft controller portability and button identity](portable-controller-workflow-2026-11-04.md). The results below remain the evidence for this earlier APK checkpoint.

## Goal and baseline

The preceding goal turn was **progress**: it fixed three confirmed defects, passed 1,408 tests in 80 suites and installed the exact FF1E96A1D42FEF1C625B3A3DE4A0F02F2826C9627016316BA684805D9A3D8F98 Android test APK. The full owner goal remains [setup through hands-off contextual GO](single-button-workflow-audit-2026-11-04.md), with the [subsequent backup/RTL evidence](backup-rtl-workflow-2026-11-04.md). This continuation does not redefine completion around a small passing test set.

Baseline read-only inspection confirmed that preceding APK on `ShowControl_SingleButton_QA` / `emulator-5564`, no target services, English/Dark Blue and the original `WF-Setup-20261104` three-cue playlist. Existing code, music, settings and earlier evidence are preserved. No AI/provider request is authorized. Native audio, GO/panic geometry, schema/defaults and the removed branding footer remain unchanged.

## Corrected finding

The previous report's mapped-Hit deletion wording was too broad. Real production-store/SQLite evidence now proves that ordinary `removeCue` **rejects the edit before commit**; it does not persist a dangling controller target. Show/history/profile/selection/media rows and the published show remain unchanged. The pure document helper can construct an invalid candidate, but that is not a successful save.

The actual workflow failure is that a valid imported `TRIGGER_HIT` assignment is hidden from normal button management. Deleting its Hit, moving that Hit into the main order, creating an empty playlist or duplicating a playlist with new Hit IDs rejects with controller validation, then offers generic guidance. Whole-show duplication retains the cue IDs and shares its controller profile; changing that shared profile affects both shows. History restores cue documents with the current shared profile, not historical profile contents. Individual cue duplication preserves the original mapping target.

Evidence: eight real-store/SQLite cases in `.native-check/workflow-r5-hit-store-probe/result.json`; four actual-compiler scenarios and the rendered repair-gap probe under `.native-check/workflow-r5-controller-ux-probe/`. The existing runtime/compiler remains strict. Silently filtering a saved media-key Hit assignment could expose the OS default GO action; it is not a safe repair.

## Plan and boundaries

1. Reproduce the blocked delete and hidden mapping on the unchanged installed baseline using an ordinary system-picker restore of an immutable public synthetic fixture. Retain the failed edit and prove the original Hit survives.
2. Expose every saved imported semantic action with its named target or missing/outside-playlist status, saved key and confirmed removal. Clearly disclose shared-profile effects. Learning/testing remain distinct from local mapping repair.
3. Make controller errors lead directly to the Buttons repair view, including failures inside an open destructive-action dialog. Reuse canonical selected-playlist controller validation for explicit, profile-free touch preparation; retain all graph/media/native checks and deliberate performance confirmations.
4. Prevent a captured removal from deleting a newer command assigned to the same input. Verify actual serialized-save races; if needed, use a backward-compatible internal store precondition checked in the queue. A failed native refresh after a durable save must not invite replaying that deletion.
5. Run focused red/green tests and independent review, then full type/lint/unit/architecture/translation/token checks and Android build/lint. Install and hash the new immutable APK, repeat the real repair → delete/duplicate → silent prepare → GO/panic flow, check new EN/HE/AR surfaces and stable safety bounds, restore initial device preferences/selection and relaunch silently. Promote only the scoped verified ledger.

No automatic mapping pruning, hidden retargeting, partial native profile filtering, new protocol, decorative animation, provider activity or persisted-schema change is planned. A reusable safe per-playlist mapping design, physical/iOS/named-hardware validation and the historical freeze retain their separate evidence requirements. The full goal remains active wherever evidence is missing.

## Evidence and delivery

Final implementation, checks, installed observations, artifact identity and remaining requirements are recorded below. Source-only and test-double results are not physical controller/audio evidence.

### Installed baseline and stronger reproductions

The ordinary system picker restored immutable `QA-R5-Imported-Hit-Mapping.zip` (770,876 bytes; SHA-256 **7AF71E301FCD3B23A87DCE62A1472522B41F1E7E98EAC576041F5D27ED63BCCB**). It contains one clearly named synthetic show, one playlist, one main cue, one named Hit, one native-proven eight-second WAV and three unbound portable mappings. No voice rule is enabled. Only this fixture and its deliberately duplicated show are edited; the preceding five shows remain intact.

On the unchanged FF1E APK, normal Builder → Manage Hit → Delete confirmation → Delete leaves the same native modal open with no visible error (`wf-r5-mapped-hit-delete-failed-modal`). Closing it exposes generic settings guidance and the still-present `Public QA Hit` (`wf-r5-mapped-hit-failed-notice`). Duplicating the whole QA show succeeds. Both test shows share their profile, as independently proved by the real SQLite fixture. In Controllers → Buttons, the only Hit evidence is Diagnostics' `unbound · logical-device-1 · KEYCODE_H → Trigger Hit`; there is no target name or corresponding removal action (`wf-r5-controller-hidden-hit-diagnostic`). Returning to Library leaves no target service.

Three additional real-provider/SQLite red cases prove that an old removal candidate can overwrite a separately queued newer profile write: changing that input to GO, changing its Hit target, or adding an unrelated mapping. The correction compares the entire canonical captured profile against the current SQL row inside the serialized save transaction before writing. Removing a captured row also matches exact command type/target, protecting newer safety assignments. This adds only a backward-compatible optional internal-store precondition; schema and native contracts do not change.

The canonical compiler also admitted six invalid `PLAY`/`SELECT` targets: missing cue, Hit-only cue and a cue belonging only to another playlist, for each action. Source inspection confirms both native implementations already reject those targets before changing main playback. The shared validator now checks main-order membership; ordered groups/waits/fades/stops and shared main/Hit IDs remain valid. This is correction of unusable command admission, not proof of unintended audio.

Focused backend evidence passes **194 tests in six suites** (including 42 real-provider/SQLite cases and 20 domain cases), type checking and focused lint; independent exact-diff review is clean. The earlier cold test timeout is retained separately and is not counted as a semantic regression or app-freeze reproduction. Final UI, full checks and installed acceptance follow.

### Implemented repair and safety

- Controllers → Buttons exposes saved actions beyond the five basic learning roles, including the target song or Hit and missing/outside-playlist status. Removal names the action and key, requires confirmation and explains when the profile is shared by two shows. Local repair does not require the optional controller SDK. Learning and silent testing retain their availability gates.
- Controller failures expose **Review buttons** directly, including inside the still-open failed-delete modal. Shared feedback also offers the same route; show/playlist drafts remain available. Readiness, compiler admission and deliberate profile-free touch preparation use the same selected-playlist validator without bypassing other safety checks.
- Exact-command removal protects a newer assignment on the same input. The optional internal save precondition compares canonical profile contents inside the serialized SQL transaction, preventing stale queued candidates from overwriting changed or added bindings. A durable save followed by native-refresh failure reports that saved outcome and does not invite retrying deletion.
- A second targeted fix corrects error classification: an authoritative `CONTROLLER_SETUP_FAILED` warning still offers repair when its detail contains the word “backup”. Its rendered regression went from **27 passing / one failing** to **28 passing / zero failing**.

These changes do not modify native code, persisted schema, song defaults, stored tuning, media or Run styles. They do not automatically remove, remap or filter saved assignments. Device identity remains available in Diagnostics; equally named keys on different devices still need clearer normal-row labels, recorded below.

### Final verification and artifact

Type, lint, unit, architecture, ten-language translation/native-copy, token and native contract checks all pass on the final source: **1,474 tests, 82 suites, zero failed**. Android release/module lint and the offline x86_64/arm64 build also pass. The final candidate has no product/test changes after those checks; only this report was completed afterward. Existing unrelated React test `act` warnings are not a claim of a warning-free runtime.

**`Show-Control-Imported-Remote-Repair-2026-11-04.apk`** · **154,870,141 bytes** · SHA-256 **`0C734B67BCB4140C087F062F09C863AEC3DB6CDC797706EB5683C4DAA9125B7D`**. This is an internal/test-signed APK with provisional identity `app.showcontrol.working`.

The pulled installed APK matches that full checksum. All 13 scoped production sources match the packaged-source ledger. The 72 native/DEX/manifest/resource payloads match the preceding verified build; eight packaged entries (six DEX files, bundle and manifest) were scanned for absence of the temporary QA helper. The source promotion uses an exact 20-path ledger: 13 production files, five test files and two reports. No unrelated local changes or library files are promoted by this pass.

Evidence: `.native-check/workflow-r5-r1-checks.json`, `workflow-r5-build-f471ff76-e30a-4e90-a8b8-7d327a5ff4e1.json`, `workflow-r5-artifact.json`, `workflow-r5-installed.json`, `workflow-r5-package-proof.json` and the final closeout receipt. These are local development receipts, not evidence that another device was tested.

### Installed Android observations

On Android 15/API 35, owned `ShowControl_SingleButton_QA` / `emulator-5564`, using synthetic audio and the public fixture:

1. The same blocked Hit deletion now exposes its explanation and **Review buttons inside the modal**. Review opens Buttons directly, where the named Hit assignment is reachable. The shared-profile warning names its effect on two shows. Cancel retains the binding. English and Hebrew confirmation views fit; the Arabic view also fits at 320 dp width and 150% text, with all three confirmation controls at least 48 dp.
2. Explicitly removing that Hit assignment succeeds. Retrying the ordinary Hit deletion then succeeds; playlist duplication succeeds and selects its independent copy. The original QA show still contains its main song and Hit. Whole-show copies continue to share their controller profile as disclosed.
3. The normal learn/save flow records system media play/pause as GO and previous as the two-second emergency fade. Ten alternating diagnostic presses report all five GO and five emergency commands without starting main playback. A built-in virtual keyboard key is intentionally ignored because it is not an external device; it is not counted as a physical-remote test.
4. Normal preparation is silent. GO starts, Pause pauses and GO resumes. Advancing and pressing GO rapidly at the end reaches **Complete**, zero active sounds and disabled GO, without wrapping. The emergency control remains enabled. GO bounds are **`[42,1582][1038,1855]`** and emergency Fade 2s bounds **`[556,1403][1038,1550]`**, unchanged in Ready, Paused, locked-return Ready and Complete.
5. While the emulator is dozing, Android's media-session dispatch starts playback through the learned GO mapping; the emergency mapping returns the native session to paused/position zero after its fade. Waking returns to Ready without replay. Initial raw virtual-key injection while dozing did not deliver a command and is not counted as a pass. This proves the emulator OS media-session/state route, not physical Bluetooth delivery, audible output or JavaScript suspension.
6. Recovery → Stop and exit leaves no target service. The original `WF-Setup-20261104` three-cue playlist is selected again. After deliberate idle force-stop/relaunch, the settled Library shows that selection, with no target service and no automatic playback or repeated onboarding. The first immediate observation captured the loading view; the later settled capture supplies the relaunch evidence. Density is back to 420, font scale 1.0, portrait rotation 0 with automatic rotation enabled, and English/Dark Blue restored.

Device XML/PNG is under `.native-check/final-closeout-device/wf-r5-*`. Key captures include `candidate-mapped-hit-repair-modal`, `candidate-direct-buttons`, `candidate-en-shared-removal`, `he-shared-removal`, `ar-narrow-shared-removal`, `repaired-hit-deleted`, `repaired-playlist-duplicated`, `media-ten-silent-receipts`, `custom-run-ready`, `final-custom-paused`, `locked-session-panic-return`, `custom-final-no-wrap`, `qa-original-intact` and `final-silent-relaunch-settled`, each prefixed `wf-r5-`. Media-session/service receipts use `.native-check/workflow-r5-*`.

### Retained full-goal follow-up

Read-only production manifest validation confirms another existing coupling: an attached incomplete GO-only profile prevents full-library backup, while the same unattached draft mapping is portable. This pass does not silently weaken archive validation or automatically prune/retarget shared mappings. Separating authoring/backup validity from runnable controller eligibility requires a defined safe policy and remains part of the full workflow objective, alongside per-playlist mapping ergonomics and the existing hardware/accessibility/endurance gates.

A second read-only rendered probe confirms that restored/unbound and newly learned assignments, or assignments on two devices, can have the same normal-row label and removal caption when their key/action match. Diagnostics distinguishes them, but the normal repair flow needs adapter/device context and an explicit rebinding label. This is recorded in `.native-check/workflow-r6-binding-identity-probe/results.json` (two intended failing cases); it is not included among the passing final-source suite. No ambiguous removal was performed during device acceptance.

A suspected stale preview Retry was **not reproduced**: two focused real-provider/SQLite cases show that the accepted current preview failure replaces the old failed-edit retry, stale preview errors are ignored and durable rows stay unchanged. No speculative product change was made. The historical Android renderer/focus ANR has no newly established cause or fix in this pass.

| Full workflow requirement | Current status and remaining evidence |
| --- | --- |
| 1. Create/select/import | Earlier installed synthetic creation/import remains recorded; current restore and playlist duplication pass. Complete installed bad-file/URL/cancel matrix remains. |
| 2. Song settings/drafts | Existing tuning/draft tests retained; failed-edit repair no longer hides behind its modal. Complete current installed editor/attachment matrix remains. |
| 3. Order/behavior clarity | Independent playlist copy and named target membership verified; shared-profile authoring coupling still needs safe ergonomics. Full rate/delay/crossfade/loop matrix remains. |
| 4. Controllers | Named imported actions, confirmed repair, learned system-media GO/emergency and ten silent receipts pass. Same-key device labels need improvement; exact hardware/Flic remains unverified. |
| 5. Contextual GO | Current silent Ready/start/pause/resume/rapid final advance/no-wrap pass. Wider countdown/overlap/capacity combinations require their full recorded matrix. |
| 6. Safety/layout/recovery | Current fixed bounds, locked OS-media emergency, settled exit and silent relaunch pass. Historical ANR, route/interruption/OEM and all orientation/large-text combinations remain separate gates. |
| 7. Backup/defaults/library | Public restore and existing data preservation verified; attached-incomplete-profile backup rejection remains a confirmed software issue. Cross-platform physical restore remains unverified. |
| 8. Localization/accessibility | Ten-language checks and targeted EN/HE/AR repair dialogs pass, including narrow Arabic/large text. Full screen-reader, tablet, fluent-language and all-surface checks remain. |

Physical Android/OEM testing, iOS/Xcode, named remotes and licensed Flic integration, real audio/HDMI/microphones, cross-platform restore, two-hour runs, production signing and store/pilot acceptance remain external release requirements. This APK is available for testing; the broad goal remains **active** and this report does not declare every workflow flawless.
