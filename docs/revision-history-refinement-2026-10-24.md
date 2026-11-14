# Revision history refinement · 24 October 2026

## Plan

The previous goal turn made progress: a reproducible focus-return harness and exact-APK observations strengthened the evidence while leaving the historical ANR open. The full customer-readiness goal remains active.

History currently selects and parses every complete saved show both when opening history and when restoring one version. Autosaved tuning can create many versions of a large show. This pass removes that unbounded document read without deleting or capping stored history.

1. Add lightweight, fixed-size metadata pages with a stable timestamp/ID cursor. Restore reads only the requested version, scoped to its show. Preserve all existing revisions, schema, rollback, native safety and offline operation; add no dependency, migration or provider request.
2. Replace the history list with a shared, bounded page, explicit Newer/Older controls, loading/empty/error/Retry states, locale-formatted dates and a confirmed restore. Ignore obsolete reads and callbacks; prevent duplicate restore presses. Keep the existing design system, ten languages and fixed GO/panic geometry.
3. Verify large/tied histories, complete paging, new inserts, invalid cursors, cross-show lookup, missing/corrupt versions, failure/retry, navigation and stale reads. Run type, lint, unit, architecture, translation and token checks. Build and inspect the exact Android candidate; physical/iOS/release gates remain open.
4. Apply the project `crit` audit once to the current-turn delta, fix safe findings and repeat proportional verification. Promote only audited source and evidence, preserve library/media/keys, and deliver an immutable internal APK if production source changes.

## Evidence

The final immutable internal candidate is `Show-Control-Revision-History-2026-10-24-v2.apk`, 154,753,813 bytes, SHA-256 `F084CE9D9E687F2F8DEE87CE11E67424401267F7AC0B982D364B8408A2CC00B9`. Packaged/generated bundle SHA-256: `C0F41DB707EDB2569511E1E6DF7B5B552ECB3679F055D7A35DEE93033F51D549`. The installed APK checksum matches. Eight frozen production Metro sources match authoring/promoted content. All 72 native/resource/manifest/DEX payloads match the preceding Downloads-and-Pairing c1 APK. Signature verification passed with the existing internal/test certificate and provisional identity; arm64-v8a and x86_64 are included. The first history candidate remains retained as superseded evidence.

**Automated verified:** 913 tests in 63 suites, type, lint, architecture, token checks and 770-message/native-copy translation parity in all ten languages pass. Final check receipt: `e3a66b8c-6448-4fb4-b0e7-9e244ad51421`. Android strict audio-module lint and the release APK build pass (final build receipt `617eb268-c9ba-43fa-a1dc-28db2ab00623`; preceding build `4e2e2b21-37f8-4694-89b7-010dbbfb107f` also passed). The full suite retains the same 45 existing React `act` warnings; Gradle reports existing deprecations. Expo Doctor, iOS compilation and physical testing are not implied by these checks.

Twenty-three added cases cover fixed-size metadata pages, 63 tied timestamps across four complete pages, stable paging after an insertion, empty/missing histories, malformed cursors, cross-show lookup, selected corruption, safe retry, stale reads, busy/critical admission, duplicate restore, cancellation, current-revision refresh and locale-formatted assistive labels. A real in-memory SQLite fixture stores 1,200 versions of a 170-song document: browsing returns 20 summaries with a serialized response under 5,000 characters, and a requested full version is read independently. This is a bounded-response fixture, not a phone-memory or latency benchmark. A production-store regression restores a healthy version despite an unrelated corrupt historical document; missing/foreign/corrupt target failures preserve the current show.

The initial integration run found an extracted-component export and fixture expectations for existing v1→v2 defaults. The next checks caught a React effect state-reset pattern and an unawaited asynchronous test retry. They were corrected; only the final complete passing run and its frozen source are candidate evidence. Failed logs are retained. No native timing, dependency, permission, database/show schema, AI/provider, media or credential changes were made.

**Simulator/emulator verified:** isolated `ShowControl_QA_API35`, API 35, host audio disabled. The original `OMS_smoke_test` and its one synthetic cue remain intact. A separate empty `History workflow QA` was created and exercised through ordinary UI controls. No production fault hook, direct app-database edit or AI request was used.

| Scenario | Observed result |
| --- | --- |
| More than one history page | Twenty-one ordinary playlist saves plus a visible name change produced enough versions for paging. Page 1 exposed Older versions; Page 2 showed the remaining older entries. Newer returned to Page 1. No history was pruned. |
| Cancel | The dated confirmation explained that the current version remains in history and audio will not start. Cancel returned to the same Page 2; the edited playlist name was retained. |
| Confirmed restore | An older QA version reverted the playlist name from `History workflow QA edited` to `History workflow QA`. History reset to Page 1. Native observations had no audio/download/voice service, playback notification, media owner or audio preparation. |
| Previous current version retained | Its previously disabled dated restore action became enabled after restore, demonstrating it remained available for deliberate recovery. |
| Final wording correction | Visual review found the old generic Saved-on-device badge did not explain the current row. The final v2 APK uses Current version in all ten languages. Its exact installed checksum and visible Hebrew badge were verified after rebuilding. SQL, paging, restore and native code are unchanged from the first candidate's flow observations. |
| Hebrew, 150% text | The final APK shows logical RTL, locale-formatted dates, Current version and fully visible restore controls. The observed restore target was 136 px high at density 2.625 (over 48 dp). Offscreen hierarchy nodes were excluded from visual-pass claims. |
| Rotation with confirmation open | The final Hebrew confirmation remained open through portrait → landscape at 150% text. Its full explanation and Restore/Cancel/Close remained visible. Landscape Restore/Cancel measured 136 px high; Close measured 126 px (48 dp). Cancel remained usable. Screenshots were visually inspected. |
| Cleanup | QA show soft-deleted, original show selected, English/Dark Blue, font 1.0, rotation 0/auto 1, notification denial/original flags, no Doze exemption, Saver/DND 0, AC/100 and normal heat observed. No original song/media or credentials were imported, modified or deleted. |

The first cleanup check caught Auto-rotate still off. It was restored and rechecked after the activity settled, before removal of temporary files or emulator closure. No app cause is inferred. Android recorded no ANR since this boot; this does not close the earlier renderer/focus incident. Only 129 investigation-owned device XML/PNG files were removed; local evidence and the QA trash/history remain retained. The idle task AVD was closed.

Evidence is in `.native-check/history-refine-*`, `.native-check/protection-v2-history-refine-*` and `.native-check/protection-pressure-history-refine-*`: frozen/promoted source hashes, complete check/build receipts, signature/APK/source proof, native state, UI hierarchies, inspected screenshots and cleanup. The initial candidate's records are retained separately as `history-refine-c1-*`.

## Audit and remaining gates

The single current-turn project `crit` loop and source-owned React review cover the history contracts, actual SQLite queries, affected UI/assistant-history caller, request ownership, confirmation/retry, semantic components, ten languages, no-audio behavior and artifact identity. Safe findings are corrected and proportionally reverified. The final label correction received a complete software matrix and a new native build, source proof and installed layout checks. No known critical/high issue remains in this scoped delta. GO/panic source geometry, native command ownership and existing media are unchanged.

The broad customer-readiness goal remains active. The historical renderer/focus ANR, iOS/Xcode, physical Android/iOS, manufacturer variants, real audio/remotes/Flic/displays/microphones, cross-platform restore, two-hour runs and performer/store-release gates remain open. This history improvement does not prove whole-library memory bounds or immunity from OS termination.

The ordinary UI save stress also demonstrates that unchanged playlist-name saves can create redundant revisions. This pass preserves those records and bounds browsing; avoiding redundant writes remains a separate efficiency refinement, not a claim that all customer-readiness work is finished.
