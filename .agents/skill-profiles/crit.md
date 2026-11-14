# Show Control project profile for `crit`

Run this exactly once after the turn changes nonignored Git state, unless a trusted active hook will do so. Audit only the current turn's ledger and affected files. Read `AGENTS.md` and the applicable source documents completely before judging the work.

## Audit sequence

1. Reconstruct the requested outcome, decisions, files changed this turn, and verification already performed. Inspect Git diff/status without discarding unrelated work.
2. Check scope: no parent-site coupling, unrelated rewrites, accidental generated native files, surprise network/account dependency, or unrequested future-stage implementation.
3. Check truthfulness: interfaces, mocks, Expo config, simulator results, and environment variables are not described as production native, physical-hardware, venue, or store support.
4. Check architecture: canonical domain types; immutable compiled snapshot; native time-critical engine; one serialized priority router; panic/stop preemption; deterministic duplicate handling; controller/input separation; transaction-safe storage; validated bundles; promotion/entitlement isolation.
5. Check reliability: local media, no surprise audible resume, safe interruption/route change, global manual panic, touchscreen fallback, clear uncertainty, recovery paths, and no automation without a manual equivalent.
6. Check UX: semantic tokens, fixed Run geometry, 48 dp targets, complete component states, reduced motion, Dynamic Type, assistive labels, EN/HE parity, logical RTL, phone/tablet, and portrait/landscape.
7. Check security/privacy: bounded untrusted inputs, archive traversal/bomb/checksum/future-schema handling, no implicit upload, sensitive metadata scrubbed, no secrets/client identifiers exposed, and MIT LICENSE/NOTICE and third-party copyleft implications considered.
8. Check migrations and compatibility: old fixtures upgrade safely, rollback is possible, exports remain portable, unsupported future data fails closed, and platform minimums are documented rather than assumed.
9. Run the smallest complete checks from `AGENTS.md` and `package.json`. Do not substitute unit tests for required physical-device or exact-controller evidence.
10. Fix safe in-scope findings, then rerun proportional verification. Report remaining risks and unverified gates explicitly. Do not manufacture evidence or expand scope to make the audit appear clean.

## Severity guide

- **Critical:** can produce unintended show audio, make panic unavailable, corrupt/lose shows, execute/import unsafe content, leak private show data, or falsely claim show-critical hardware/store readiness.
- **High:** breaks deterministic cue order, recovery, local/offline operation, migration/backup, core accessibility, EN/HE parity, or free-core isolation.
- **Medium:** confusing but recoverable workflow, incomplete state, documentation drift, untested edge, or future compatibility debt.
- **Low:** local clarity/maintainability issue with no plausible performance impact.

Completion means the requested outcome is genuinely present, the diff is scoped, relevant automated checks pass, required manual/native gates are either evidenced or honestly marked pending, and no known critical/high finding remains.

