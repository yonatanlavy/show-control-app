# Full-library backup format

Export creates `Show-Control-<date>-<UUID>.zip`, a standard ZIP32 archive with **STORE** (uncompressed) entries and UTF-8 paths. `manifest.json` identifies `format: "show-control-library"` and `schemaVersion: 2`. This documents the concrete encoding behind the historical `.showbundle` contract. It does not import proprietary OMS backups or arbitrary compressed ZIP files.

## Contents and portability

The manifest contains complete shows, sets/order/hits, independent cue tuning, media metadata, artwork and attached visuals, fallback visuals, voice rules, safe preferences and portable controller profiles. Payload paths are `media/<sha256>.<extension>` or `visuals/<sha256>.<extension>`. Shared immutable payloads are deduplicated by declared path. Every payload declares SHA-256 and exact bytes; ZIP entries also carry CRC32. Platform-local URIs are reconstructed in the destination's app storage.

API keys, hardware addresses, pairing credentials and live transport/recognition state are excluded. Compound bindings preserve distinct logical device roles but import as `unbound` until local relearning. External display is disabled on restore, voice requires recalibration/rearming, and restore cannot start audio. Deleted-show trash and prompt/revision history stay in local SQLite; the archive represents current shows/settings rather than private assistant conversation history.

Editable controller setup is distinct from playback eligibility. Backups retain structurally valid incomplete profiles and saved actions whose target is unavailable in the selected playlist, including a removed target awaiting repair. They do not require separate GO/panic assignments before preserving the library. Every profile, including an unattached draft, must still have valid identities, supported action shapes and unique compound inputs. A show referencing an absent profile is rejected explicitly; restoration never silently drops that association. Cue graphs, media, timing and all other content/reference checks remain mandatory.

This is a schema-two validation clarification, not a new stored field or automatic mapping repair. Older readers that require runnable controllers can reject these draft-containing archives; use an updated build on both devices. Restore retains every saved semantic assignment and marks controls unbound. The strict runtime compiler still rejects incomplete or playlist-ineligible assignments; the operator must repair them or deliberately prepare with the existing touch-only fallback. Saving, exporting or restoring never starts playback or substitutes a default media action. See [the workflow verification record](portable-controller-workflow-2026-11-04.md).

## Bounds

There are at most 500 payloads plus the manifest, 1,000,000,000 bytes per payload, 4,000,000,000 expanded bytes including the manifest, and 8,000,000 manifest bytes. Larger archives are rejected explicitly. These are archive safety/ZIP32 bounds, not limits on the number of local shows/songs. A library exceeding the bounds needs a future multipart/ZIP64 export before full-library transfer can be accepted; the implementation does not silently omit files.

Portable metadata also allows at most 1,000 shows, sets per show, controller profiles and bindings per profile; 10,000 order/Hit IDs per set and voice rules per show. Local validation has no corresponding product count cap. Exceeding any archive bound fails export explicitly.

## Commit and recovery

Import inspects the central directory, validates normalized paths and entry declarations, streams payloads into app staging, checks CRC/SHA/size and canonical references, then materializes all documents in a single SQLite transaction. It rejects path traversal, absolute/alternate-separator paths, duplicate/case-colliding entries, symlinks, encryption, unknown future schemas, undeclared/unreferenced payloads and unsupported encodings. Every restored show/set/revision/controller profile receives new identities; cue IDs remain scoped to each show. Existing work is not overwritten. The OS picker and preparation can be cancelled before the atomic commit; cancellation or failure before commit leaves the current library unchanged. Progress reports measured bytes/files during work and indeterminate OS saving/sharing stages. Staging is removed in `finally`. Idle cleanup removes only recognized abandoned temporary staging older than 24 hours, skips active file leases, and preserves canonical unreferenced media. Low storage is checked before staging but actual filesystem errors still roll back metadata. Notification or cleanup failures after a committed restore cannot change its successful result.

Export streams payloads from app-owned immutable files; the OS share/file interface chooses the destination, including Drive where installed. Export completion records the saved ZIP before sharing. A failed share retries that same archive; if the file has since disappeared, the UI clears the saved result and offers a new export. Android-to-iOS-to-Android round trips require native filesystem/share tests as well as the portable fixture checks. Migration uses SQLite's backup API for a pre-upgrade rollback copy; canonical show schema 2 and database migration 3 are independent version numbers.

If reading the updated Library view fails after a successful restore transaction, the saved restore remains committed. The app blocks stale library use and offers Reopen library, which reloads the saved data without selecting/importing the archive again. Completed counts remain visible. Only transient reads retry automatically; imports and other mutations never replay. See [post-commit recovery evidence](backup-commit-recovery-2026-10-24.md).

Implementation: [archive I/O](../src/storage/zip.ts), [manifest](../src/storage/library-bundle.ts), [backup/restore](../src/storage/backup.ts), [SQLite](../src/storage/sqlite.ts). Automated corruption, path, schema, cancellation, disk-full and rollback fixtures: [library tests](../tests/storage/library.test.ts). Physical cross-platform transfer remains pending.
# Routine music metadata

Current schema-two writers include optional section routineText (maximum 8,192 characters), portable music category tags and source attribution notes. They survive history, duplicate and cross-platform transfer. Older documents remain valid. Import extended backups with a current app; older strict readers can reject the added field.

Only attached, validated media belongs to the portable library. Download records and unassigned files remain device preparation state and are excluded. Pairing secrets, helper credentials and provider keys are never exported. Re-pair the iOS helper on another phone. Download IDs are provenance/idempotency tags, never playback commands.

