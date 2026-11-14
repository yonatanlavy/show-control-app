# Download cancellation and committed attachment

This correction keeps download history consistent with an attachment that already committed to the library. It changes no song/SQLite/portable-backup schema or JavaScript native-method signature. Existing media, tuning, playback, controller behavior and fixed GO/panic geometry are unchanged.

## Ownership and compatibility

- The optional `cancelledAfterReady` boolean belongs only to private, nonportable native `jobs.json` records. Cancel issues it only after native code has observed a ready job with an integer byte count of 128–500,000,000 and its exact app-owned `audio.mp3` URI. Caller registration strips URI, bytes, this marker and other runtime-owned state.
- Ready means the transfer finished. It is not evidence of SQL commit. The ordinary app Cancel aborts the import signal; cancellation before commit cannot call completion or attach later. Once SQL committed, native `complete` may supersede a marked late cancellation. It deliberately does not require the staging file to remain: worker cleanup may already have removed it after the committed managed copy was created.
- A cancelled job is reconciled after restart only when current canonical library data already contains its reserved `download:<id>` tag on an audio cue. Reconciliation calls native completion only; it never imports a cancelled file. Native provenance and metadata validation remain the final authority.
- Old ready jobs remain compatible. Old cancelled jobs without provenance fail closed. Incomplete, unknown, forged-provenance and malformed-file jobs do not become attached. Repeated completion and Cancel after attached are idempotent.
- iOS uses matching registration, strict boolean provenance, metadata and completion guards. Its source-policy checks on Windows do not substitute for Swift compilation or device testing.

## Android notification and service

The notification's Cancel applies only to an active transfer. A queued notification action delivered after ready/attached is a no-op; it cannot cancel a subsequent attachment or unrelated job. The app's Cancel retains its separate abort signal for local import.

Service starts and completion cleanup share the main thread. Each transfer captures its own wake lock and ownership token. An old completion releases only its own lock and cannot remove a newer transfer's foreground notice. The current worker stops with the latest delivered start ID, including intervening Cancel commands. A stale or empty cancellation intent stops a newly created idle service without stopping a different active owner. Destruction releases only that service instance's owned locks; late completion cannot take ownership back.

## Failure guidance

iOS retained history now preserves a known finite download error code instead of labelling every helper creation/transfer failure as an unavailable helper. Raw helper text, native exception details and pairing secrets are never stored as job errors. Unknown codes retain the bounded fallback.

## Evidence and limits

Focused TypeScript tests cover failure-code persistence, cancellation around commit, cleanup failure/restart, cancelled-file nonattachment and reserved audio-tag evidence. The regression runner `tests/native/download-completion-source-regression.mjs` compiles the actual Android cancellation/completion helpers and service ownership policy with Kotlin/JVM and observable adapters. Nine scenario groups cover late Cancel, idempotency, compatibility, invalid metadata, forged registration, unknown IDs, notification cutoff and stale service cleanup. The old production completion method fails the late-Cancel case; the corrected source passes. The runner also checks the actual restricted iOS eligibility policy and registration/transfer source guards.

These are source/JVM/automated checks. Parent release compilation, exact installed APK checks and isolated native policy/lifecycle evidence are recorded separately. They do not establish an end-to-end physical-device SQL race, Xcode/iOS support, acoustic output, background reliability, endurance or customer-release readiness. No provider or network request is required by these tests.
