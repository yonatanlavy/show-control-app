# Library and playlist list responsiveness · 24 October 2026

## Plan

The preceding goal turn made progress through background-protection observations, 960 software tests, native/installed checks and an immutable internal APK. The customer-readiness goal remains active. This pass finishes and verifies the previously unpromoted collection-windowing refactor.

Current Library and Builder collection bodies eagerly map every show, ordered cue and Hit into native rows inside ScrollView. This creates avoidable view work for large local collections.

1. Introduce a reusable preparation-only native SectionList viewport. Keep one vertical scroller, token-based grouped surfaces, dynamic row heights, stable section/item identities, complete search data and accessible 48-dp actions. Do not cap the library or alter persisted data.
2. Apply it to the Library show collection and Builder's ordered songs/Hits. Keep headers, backup/history state and dialogs outside recycled rows; preserve full-list reorder semantics, independent Hits, silent editor entry, disabled/error states and new-song defaults. Hide stale Library content while its store is unavailable.
3. Anchor query edits/clearing to the measured search position so results stay above the keyboard; a changed show/playlist starts at its heading. Retain the search field and avoid animation. Preserve fixed Run/Recovery GO/panic geometry. No AI/provider, schema, dependency or native transport changes.
4. Test the real list implementation with large collections, far-item search, filtered reorder, repeated IDs across main/Hits, busy/recovery states, dialogs and editing. Run the software/native build checks, then inspect the exact Android candidate with owned synthetic collection fixtures, English/Hebrew, large text and orientation checks. Preserve original library/media/preferences.
5. Perform the scoped crit/React audit, promote verified files, retain honest hardware/iOS/performance limits and deliver an immutable internal APK. Full-library database loading, stateful management dialogs and physical-device performance remain separate evidence gates; this pass does not redefine customer readiness around list rendering alone.

## Evidence

### Implementation and automated verification

Library shows and Builder songs/Hits now use the shared `CollectionViewport` and the actual native SectionList. Source data and search remain complete; the viewport limits mounted rows rather than limiting the library. Headers, inputs, footer disclosures and management dialogs retain their identity. Main-song and Hit sections keep separate keys/actions even when they reference the same cue. Filtered reorder uses the original full-list ordinal. No persisted schema, media/default tuning, native transport, GO/panic surface or dependency changed.

Installed testing found that the first windowed candidate could place a single search result behind the keyboard. Search anchoring alone did not fix Android's overlaid viewport. The final candidate adds native keyboard avoidance, safe-area offset and a guarded second anchor after the keyboard shrinks the viewport. Query clearing retains the search field; changing show/playlist starts at its heading. There is no scroll animation.

Final verification passes **977 tests in 65 suites**, type checking, lint, architecture, translation/native-copy parity for **776 messages in all ten languages**, and token checks. The actual-list regressions exercise 2,000 items, full search data, bounded initial rendering, header/footer state, repeated cue IDs in separate sections, no-match results, filtered reorder, modal retention, store unavailability, query/scope anchoring, invalid offsets, safe-area/keyboard behavior on both platforms, and late keyboard resizing. They do not mock SectionList into a map.

The final test-only synchronization correction uses fake timers in the Library integration suite so native-list batching settles deterministically. The complete suite passes again with **45 pre-existing React act warnings**, eliminating the one newly introduced batching warning without suppressing warnings. This correction changes no packaged production source. Final test/type/lint receipts are `.native-check/collection-final-test-timers-*` and `.native-check/collection-test-timers-*`. Expo Doctor was not rerun.

Android strict `:show-audio:lintRelease` reports **No issues found** and release assembly passes. Frozen-source check receipt `c5ce6d80-3bcf-4303-b75d-7ac1a74b134c` and build receipt `689f1d53-09c5-4cff-8472-cc9815be52f8` identify the production candidate. Earlier failures and superseded candidates remain retained: the fixture generator initially lacked an explicit Buffer import, and its first native seed attempt failed its SQLite PRAGMA setup before any fixture writes. Both were corrected; no observer timeout was used to justify a restart or repeat seed.

### Exact artifact

`Show-Control-Large-Libraries-2026-10-24-v3.apk`, **154,775,297 bytes**, SHA-256 `51C7A812CCBA3350FE8359AE15B5B7BE3975399698095BB22939BB87DCC20C6D`. Generated and packaged bundle SHA-256 is `831D56D6EF81D115B9F42EB96CD1CE20335CD463B730D7E30B0D216CBC121CCB`. Both changed production Metro sources match their frozen contents; all **72 native/DEX/manifest/resource payloads are unchanged** from Background Checks v2. Installed checksum and internal/test signature match. The provisional package identity and arm64-v8a/x86_64 remain; this is an internal candidate, not a customer/store release.

### Installed observations

Device: isolated `ShowControl_QA_API35`, API 35, host audio disabled. The separate same-test-signer tool under `tools/collection-probe/` is not shipped in the app. It appends 601 uniquely owned synthetic shows: 600 empty shows and one with 1,200 main songs and 200 Hits, including ten shared identities. All use one original synthesized PCM asset. Original show/trash/revision rows are hashed and preferences/selection captured opaquely. This bypasses ingestion to isolate list behavior; it does not prove import, archive or physical performance.

| Scenario | Observed evidence |
| --- | --- |
| Same Library data before windowing | Native UI-queue traversal counted 600 collection rows and 8,540 total views. UIAutomator XML is not used as a mount count. |
| Final v3 Library windowing | Same owned data: **30 collection rows and 578 total native views**. All fixture documents remain stored; original rows hash unchanged. This is an architectural count, not a frame-rate or latency benchmark. |
| Far-show search | `0599` locates the final QA show without opening or playing it. The installed v2 anchor candidate established this observation; v3 retains that anchor plus keyboard avoidance. |
| Final-song search with actual keyboard | `1199` is fully visible above the keyboard; its Manage button opens on the first tap. Move up changes full-playlist ordinal 1,200 to 1,199. Delete then Cancel preserves the song. |
| Independent final Hit | `hit 0189` is visible above the keyboard. Its management dialog opens and Move up changes its Hit ordinal 200 to 199. |
| Shared main/Hit identity | `song 0000` exposes separate Edit song/Manage and Edit Hit/Manage Hit actions. |
| Editor entry | Opens the selected song silently; no audio service/notification/media ownership before explicit Play preview. No tuning or draft edits were made. |
| Hebrew and enlarged text | Actual Hebrew RTL Builder at normal and 150% text, mirrored actions, readable rows. At 150% landscape, scrolling from a non-editable area reaches complete song/management targets. Screenshots visually inspected. |
| Original data restored | Guarded clean reports `originalsUnchanged`, `ownedRowsRemoved`, `ownedFilesRemoved`, `selectionRestored` and `passed` true. Only owned fixture rows/revisions/media/marker removed; original one-cue show, settings, backup and media preserved. Probe package uninstalled. |
| Final silent native check | Original synthetic show prepares through Rehearsal at source position zero, zero active voices and native foreground ID 1001. Silent Fade all and deliberate Exit return to Builder; no service, notification or media owner remains. No acoustic panic or Run-geometry claim is inferred from the rehearsal layout. Run source/layout was not changed. |

English/Dark Blue, font 1.0, portrait 0/auto 1 and original keyboard preference were restored. Final notification permission remains denied with its exact original sensitive-when-granted/denied flags; DND/Saver are 0, standby 10, no Doze exemption, AC/100% and heat override off. No ANR has occurred since this boot; this does not close the historical ANR investigation. The helper is uninstalled, 97 owned device XML/PNG files were removed only after retaining local copies, and the idle task emulator's serial and owned processes are verified absent. Evidence paths use `.native-check/collection-*`, `.native-check/protection-v2-collection-*` and `.native-check/protection-pressure-collection-*`. No user music or keys were read or modified; no AI/provider requests were made.

### Audit and remaining gates

The single ongoing scoped crit/React review covered current-turn source, tests and the test-only fixture cleanup. Safe findings were corrected and verified. Headers/footers remain React elements, modal ownership stays outside virtualized rows, targets reuse existing accessible components/tokens, and no timing moves into React. Only scoped files are promoted; unrelated authoring changes remain intact.

At the end of this pass an additional **pre-existing Android preview lifecycle issue remained open**: after natural audition completion, Stop preview and editor exit left an idle started service/media session registered for more than ten minutes, with no active playback or foreground notification. After the controlled font/orientation activity recreation the native owner was absent, before fixture cleanup. This list pass did not alter native teardown. The subsequent [audition lifecycle pass](preview-lifecycle-2026-10-24.md) reproduces that failure on this v3 APK and verifies full cleanup plus both preview-stop/main-prepare orderings on its new candidate. Its iOS/physical gates remain open.

Full-library document loading, nonvirtualized management dialogs/trash, physical low/mid-device memory/performance, screen readers, tablets, all-language linguistic quality, iOS compilation/runtime and long runs remain open. The prior historical ANR and broad hardware/release gates remain open. Reduced mounted views do not prove freedom from OS termination or readiness for 1,000 customers. Existing quiet prepared-show notification, battery/standby warnings, explicit settings repairs and deliberate recovery are retained unchanged; their evidence remains in [background observations](background-observations-2026-10-24.md).
