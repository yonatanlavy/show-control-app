# Backup commit recovery · 24 October 2026

## Plan

The preceding goal turn made progress: bounded revision history, safe restore, 913 passing tests and an inspected internal APK. The customer-readiness goal remains active.

This pass addresses a boundary after a library-backup restore commits: refreshing the library snapshot can still fail. The current store reports an ordinary restore error while keeping its old ready snapshot, which can encourage importing the same backup again. A committed restore must recover through read-only library reopening, never replay the import.

1. Reproduce the post-commit refresh failure with a real SQLite fixture. Separate durable commit, snapshot reconciliation and pre-commit rollback evidence.
2. Retry only transient read queries with the existing bounded read policy. If reconciliation still fails after a successful commit, mark the library unavailable, retain the committed database, release initialization for a deliberate reopen and block stale edits/arming.
3. Keep the successful restore counts truthful. Route shared/global Retry to library reopening, discard the obsolete import callback, provide clear recovery copy/actions in ten languages and prevent a local Retry from selecting/importing again. Preserve ordinary pre-commit failure/cancel and saved-archive share retry.
4. Test transient/persistent/fatal read failures, retry/retry-failure, stale mutation callbacks, zero-show restores, UI teardown and existing backup errors. Run full software checks, native lint/build and scoped installed Android backup observations without AI requests or production fault endpoints.
5. Run the project `crit` audit once, fix safe findings, promote only audited files, retain original library/media/keys, close owned tools and deliver an immutable internal APK. Record hardware/iOS and historical ANR gates honestly.

## Evidence

The real SQLite regression reproduced durable restored rows with a stale ready snapshot after a post-commit busy read. Read-only reconciliation now uses the existing bounded retry policy. Persistent/fatal failures mark the library unavailable; stale edits, preview preparation and arming are rejected. Deliberate Reopen library loads the committed database and clears the obsolete import callback. Another failed reopen preserves that recovery context. Completed restore counts remain true, and the local backup panel offers no duplicate import Retry. Cancellation and ordinary pre-commit failures retain their existing behavior. No database/song schema changes or mutation retries were introduced.

**Automated verified:** seven store cases cover transient/persistent busy reads, committed show/profile/preferences/selection reads (including zero-show restores), reopen failure/success and pre-commit cancellation. Four provider cases cover fresh availability, stale Retry/preview callbacks, hidden stale selection and repeated reopen. Panel/count, error-priority/label and notice-layout regressions complete fourteen new cases. The full candidate passes 938 tests in 63 suites, type/lint/architecture/translation/token checks, Android native policy checks, strict native lint and release assembly. The special post-commit failure is fixture evidence; no production fault endpoint or installed database corruption was used.

**Simulator/emulator verified:** the exact signed API-35 candidate retained the original one-show/one-song synthetic library through restore-picker cancellation and rejection of a 68-byte malformed ZIP. The error explained that the library had not changed, with Retry/Dismiss available. Export completed with one show/playlist/song/file; cancelling the OS share sheet kept the completed archive. Share saved backup reopened the same `Show-Control-2026-10-24-b457b61e-5a44-4079-93c9-5b989a022f09.zip`. No destination was selected, no valid backup was imported and no existing media/keys were changed. The owned malformed fixture was checksum-verified before removal; the completed archive remains in private app storage.

Artifact identity, native/UI evidence, audit and open physical/iOS/release gates are recorded in [the combined delivery report](background-quick-repairs-2026-10-24.md). Evidence: `.native-check/backup-recovery-red.*`, the final full check receipts and `.native-check/background-direct-*`. Fault injection proves recovery at the production store/SQLite boundary; it does not substitute for actual Android/iOS fault, cross-platform restore or physical low-storage tests. No customer-release claim is made.
