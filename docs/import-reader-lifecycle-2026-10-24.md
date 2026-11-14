# Import reader lifecycle · 24 October 2026

## Plan

The preceding turn made verified progress on audition cleanup, safe Retry and protected main playback. The customer-readiness goal remains active. Review of the unresolved freeze evidence does not establish a new cause; its historical renderer/ART timeout remains open. This pass fixes separate, reproducible import lifetime defects.

1. Reproduce audio and visual inspection failures while their other native reader remains pending. Keep staging and the operation lease alive until all started readers finish, including synchronous native-module errors. Reject cancellation/access changes after staging before starting expensive inspection or promotion.
2. Preserve original copy/promotion errors when best-effort temporary cleanup also fails. Do not turn successful canonical promotion into a failed import because obsolete staging deletion failed. Retain recognized abandoned files for idle cleanup.
3. Restrict import cleanup to exact source-owned UUID staging names, rejecting traversal/encoded/query/fragment/arbitrary/canonical paths. Preserve existing media, rollback, deduplication, portable backups and manual song defaults. No schema/native transport/UI/provider changes.
4. Add deterministic deferred-reader and real-filesystem/SQLite regressions, run the complete software/native build checks, audit the scoped delta and inspect an exact internal APK with synthetic non-AI import/backup workflows. Promote only verified files and preserve original library/preferences/keys.

## Evidence

The expanded unchanged-production reproduction passes 47 cases and fails **20**, covering early staging cleanup after asynchronous or synchronous reader failure, cancellation/access changes during staging, traversal/arbitrary cleanup paths and cleanup-error masking. The final focused run passes **67/67** storage cases. Deferred reader tests assert the file is retained and no metadata or promotion occurs until every started reader settles; the tests do not pretend to cancel OS I/O. Visual regressions use real SQLite and filesystem regressions use owned temporary directories. The pinned native Expo UUID implementations on Android and iOS both produce lower-case UUIDs, matching the exact staging-name guard.

The complete final matrix passes **998 tests in 66 suites**, type, lint, architecture, translation/native-copy parity for **776 messages in all ten languages**, and token checks. Its raw log includes **46 React act warnings**, versus 45 in the preceding receipt; the extra occurrence is the existing Library trash-loading async update, outside this storage delta. It is retained rather than suppressed. Expo Doctor was not rerun. Strict Android `:show-audio:lintRelease` reports **No issues found**; release assembly succeeds in build receipt `893ea221-f219-456e-88b2-70dd804a35a9`.

The single scoped crit audit checks four production sources, three regression files, the supporting test-only probe and this evidence/documentation. It preserves canonical media, primary errors, the library serial operation and staging leases. It does not introduce a schema change, dependency, permission, new UI, transport behavior or provider request. It corrected the fixture's logical Android URI as described below; the product path validation was retained.

## Exact artifact

`Show-Control-Safer-Imports-2026-10-24.apk`, **154,778,697 bytes**, SHA-256 `B9EF1F1C54D15884F6C39DA48AC2A220C3C4AA4AC61714AC716437B480709DD7`. Internal/test signature verified; provisional package `app.showcontrol.working`, arm64-v8a and x86_64. Generated and packaged bundle SHA-256 is `184E9BC1046BD25D0BD78F7666716706BB13FC80293F0D618F13DE2C48DCDCB0`.

All four changed production Metro sources match the frozen ledger and packaged source map. Five inspected UI sources (screens, primitives, rehearsal, song editor and backup panel) remain byte-identical to the preceding artifact's source map. All **72 native/DEX/manifest/resource payloads** remain unchanged relative to Audition Cleanup (`3615CD9CE00BC2D11209C70BFD13409C565A59B38F63653B42C1B5FDADBAD697`). This artifact is an internal candidate, not customer/store certification.

## Installed observations

Device: owned `ShowControl_QA_API35`, API 35, host audio disabled. Installed APK checksum matches the exact artifact. The separate same-test-signer collection probe appends only uniquely owned synthetic shows/media and records original-row hashes and preferences before seeding. Token `d8f6a119-3ea7-4b0c-90ef-881e0259bc87` identifies this fixture. Nothing in the probe is registered or shipped in the product.

The first duplicate import correctly rejected the fixture's aliased `/data/data` URI as an invalid shared-media location. The initial probe had canonicalized Android's `/data/user/0` alias before storing its URI, unlike Expo. Its guarded cleanup restored original rows/settings/selection before a corrected probe was built and seeded. The corrected probe stores Expo's logical files-directory URI while separately validating canonical file identity, records that URI for exact cleanup and retains older-marker compatibility. This was a fixture correction, not a relaxation of product ownership checks. Initial failure/cleanup receipts remain retained.

| Ordinary workflow / observation | Result on the exact APK |
| --- | --- |
| Duplicate original synthesized WAV through Android picker | Appended exactly one song: 1,200 → **1,201**. Read-only SQLite audit verifies reuse of the one unchanged canonical asset, not a new media file. |
| Imported-song editor | Opens saved, with ten-second trim range, local WAV metadata and no automatic preview. Read-only audit verifies −18 dB, 800/1,800-ms fades, 1×, zero delay/trim start, loop/autoplay/crossfade off and 2,000-ms outgoing crossfade duration. |
| Invalid WAV through normal picker | Clear audio-read error with Retry/Diagnostics/Dismiss; expanded native diagnostic matches extractor refusal. Song count remains 1,201. |
| Invalid PNG through manual cover picker | Clear image/video-read error; no saved artwork/visual, no automatic playback. Editor remains usable and returns normally after dismissal. |
| Cancel backup restore picker | Android Back first leaves its folder, then cancels the picker. Backup panel returns idle with its original actions; no restore occurs. |
| Malformed owned ZIP | Explicit invalid/unsupported backup message states the library has not changed. Error can be dismissed. |
| Saved-data inspection after all workflows | Separate read-only `inspect-import` asserts original document hashes/preferences unchanged, one successful added song, expected defaults/shared asset, zero saved visuals, **zero staging files**, and no assistant work. Receipt `7612aa38-cdcf-4c0d-bf27-c9ec03f5581a`. |
| Guarded cleanup | Receipt `b99b94a3-482c-447c-bb55-c1e32caac7b5` confirms all recorded synthetic rows/file removed, original rows unchanged and original selection restored. Only the probe is uninstalled; target app/data remain. |
| Silent Rehearsal after cleanup | Original selected one-cue show prepares at position zero with zero voices. Exit releases service/media/notification ownership. |
| Notification denied | Prepared service remains foreground with native media ownership while locked, but no posted notice record; foreground ownership is not misrepresented as visible notification permission. |
| Notification allowed, deliberately re-prepared | Quiet ongoing ID 1001 record includes “Battery settings may interrupt your show · Tap to review controls”. Same PID 5710, service and notice retained after **37.8 seconds asleep**; source position remains zero, zero voices. Exit clears all three owners. Granting permission mid-session alone did not repost the absent notice; no replacement-notification loop is claimed. |

The normal import/error/picker observations exercise actual native I/O. Deferred-reader ordering, critical-state/cancellation during staging, malicious cleanup paths and low-storage error masking are deterministic controlled tests, not installed native-fault injection. No successful new external visual/media or library backup was created in this fixture. Existing original backup files, music, keys and preferences remain intact. Current-turn test uploads are checksum-checked before exact-file removal; notification denial/flags and device settings are restored afterward.

Existing background protections documented in [E-54](background-observations-2026-10-24.md) remain included. There is no claim that notifications/exemption defeat Android user Stop/Force stop or system shutdown. The historical renderer/ART ANR remains unresolved. iOS/Xcode, physical picker/storage/calls/OEM power management, acoustic output, HDMI, exact remotes, cross-platform restore, process-kill import and two-hour/customer/store gates remain open. This pass is verified progress toward the active readiness goal, not complete parity.

Raw evidence is retained under `.native-check/import-reader-*`, `.native-check/protection-v2-import-reader-*`, `.native-check/protection-pressure-import-reader-*` and the UUID-scoped collection-probe receipts. No AI provider requests were made.
