# Stage 01 PRD: touring reliability and redundancy

**Status:** Later-stage plan; not implemented by this document

## Objective

Add a hot-standby device, privacy-safe diagnostic logs, loudness and mono analysis, emergency cue sheets, and practiced failover drills so a touring performer can detect problems before the audience does and transfer control safely when a primary device fails.

## Dependencies

- V1 native engine, immutable snapshots, local storage, `.showbundle`, preflight, Recovery, controller adapters, background/lock lifecycle, and physical-device release matrix are complete.
- A stable snapshot/event/command protocol and monotonic/wall-clock mapping exists across devices.
- Local diagnostics already emit redacted structured events and have a bounded retention/export policy.
- Platform local-network/Bluetooth permissions and discovery constraints have been researched on current iOS/Android versions.

## Free/paid classification

Free. Redundancy, failure diagnosis, loudness/mono warnings, emergency cue sheets, and failover are safety capabilities and may not be paywalled, promotion-gated, account-gated, or network-service-gated. Users provide the second device and any hardware.

## Problem and outcomes

A copied show is not redundancy if the copy is stale, corrupt, on an incompatible build, or cannot take over without replaying a cue. Operators also need useful incident evidence without leaking show titles, filenames, notes, or media. This stage succeeds when two local devices can prove they hold the same snapshot, the standby follows confirmed state without producing audio, a performer can deliberately hand over at a safe boundary, and a printable/offline cue sheet supports a no-app continuation.

## Non-goals

- Automatic seamless sample-accurate audio failover, cloud replication, multi-user collaborative editing, remote operation over the public internet, or a guarantee against both devices/PA/power failing.
- Automatic mastering, destructive media rewriting, artistic loudness decisions, or a claim that analysis replaces a PA soundcheck.
- Uploading diagnostic logs by default or remote vendor monitoring of live shows.

## UX

A Redundancy setup flow pairs a primary and standby on a local authenticated channel, compares app/schema/build compatibility, transfers/verifies the exact show revision and media hashes, runs an output-silence test on standby, and assigns a deliberate takeover action. Preflight displays `Ready together`, `Stale`, `Incompatible`, `Disconnected`, or `Unknown` with the corrective action; no false “redundant” badge appears from mere pairing.

During Run, primary status shows a compact standby heartbeat without moving `GO`/panic. Standby shows the same confirmed NOW/NEXT pointer, prominently states `STANDBY · OUTPUT MUTED`, blocks ordinary sound-producing controls, and offers a guarded `TAKE OVER` only after link-loss or intentional handoff. Takeover explains the last confirmed cue and whether active audio must be restarted manually.

Diagnostics presents a privacy preview, time range, build/device categories, redaction statement, and user-controlled export. Media analysis displays integrated/peak loudness, clipping risk, channel/phase/mono-loss warning, and comparison across show cues, never an automatic “good” promise. Emergency cue sheet export offers localized print/PDF/plain-text views with cue numbers, names, operator notes explicitly selected for inclusion, durations/actions, recovery/finale markers, and no promotion.

## Interfaces and schema changes

Add versioned `StandbySession`, ephemeral paired-device identity/public key, protocol/capability versions, `SnapshotDigest`, media inventory digest, heartbeat/sequence/ack records, confirmed run pointer, takeover proposal/acceptance, and local diagnostic-event schema. Do not sync raw engine memory or optimistic UI state.

Add `MediaAnalysis` keyed by checksum and analyzer version: integrated loudness, true/sample peak where supported, channel count, correlation/phase indicators, mono-sum delta, warnings, and analyzed timestamp. Results are derived cache and can be recomputed.

Add an emergency-sheet projection schema separate from the canonical show; only explicitly selected notes enter it. Protocol messages are authenticated, replay-protected, ordered, bounded, and contain IDs/status—not media/show names—except during deliberate encrypted local transfer.

## Offline and failure behavior

All features work without internet. Pairing, transfer, heartbeat, and takeover use a local connection; if it drops, primary continues unchanged and standby retains the last confirmed state but does not guess. A stale standby cannot claim readiness. Transfer is staged/checksummed/transactional and cannot corrupt its previous backup.

Standby produces no audio and does not seize audio focus until guarded takeover. An ambiguous takeover never auto-plays; it opens Recovery at the last confirmed pointer. Split-brain prevention uses a session epoch/lease and explicit role transition; if both devices are uncertain, both fail silent until the performer chooses. Diagnostics are ring-buffered with size/time limits, survive a crash when feasible, and fail closed to no record—not playback interruption. Analysis failure marks unknown and never blocks Run unless the underlying media itself fails v1 checks.

## Manual fallback

The operator can ignore pairing and use the second device's independently preflighted copy. Touch panic/Recovery remain local on both devices. A printed/exported cue sheet and emergency playlist support continuing with no app. Takeover never removes the option to stop all and manually start an arbitrary cue.

## Accessibility and internationalization

All statuses, comparison results, analysis units/warnings, pairing codes, takeover consequences, logs, and cue sheets ship in EN/HE with logical RTL. Do not rely on red/green or synchronized animation. Pairing and takeover work with screen readers/switch control and large text; time/level values include units and plain-language interpretations. Generated sheets use tagged accessible PDF when PDF is offered, correct reading order, scalable text in HTML/plain text, and locale-aware page direction.

## Privacy and security

Pairing requires proximity plus a user-compared code/QR, authenticated key agreement, short-lived session keys, sequence numbers, and revocation. Never accept an unsolicited takeover. Logs exclude show/cue/file names, notes, paths, media, stable device IDs, and controller IDs by default; user previews the exact export. Local transfer is encrypted and accepts only verified app protocol/bundle data. No discovery remains open after the session.

## Migrations

Add tables for analysis cache, diagnostic ring metadata, paired-device approvals, and optional emergency-sheet settings. Pairing keys live in platform secure storage and are invalidated safely on migration/reset. Old shows require no mutation; analysis is lazy by checksum. Protocol versions negotiate explicitly, and incompatible peers remain usable as independent devices. Rollback removes derived data without touching shows/media.

## Real-hardware tests

Test iPhone↔iPhone, Android↔Android, and cross-platform pairs across minimum/current devices, differing orientations/languages, airplane mode, Wi-Fi/Bluetooth/local hotspot variants permitted by OS, busy venue RF, 2+ hour shows, large bundles, low storage/battery, screen lock/background, primary process kill/power loss, standby link loss/reconnect, role races, duplicate/delayed/reordered packets, and incompatible builds. Verify standby output remains silent through speakers/wired/USB routes before takeover and no active cue auto-replays.

Compare analysis with trusted external tools and test stereo anti-phase, center cancellation, clipped, silent, mono, multichannel, short, variable-rate, and unsupported files. Print/export EN/HE cue sheets and audit PDF/screen-reader/physical legibility. Run live failover drills through a representative PA with the performer at actual stage positions.

## Rollout gates

1. Threat model, protocol ADR, privacy/redaction review, and cue-sheet data-selection review.
2. Deterministic protocol simulations including partition/split-brain and property tests for role/sequence transitions.
3. Physical pair matrix with zero unintended standby audio and zero automatic replay after ambiguous failover.
4. Repeated rehearsal drills, then low-risk performer pilots with incident logs and independent backup.
5. Staged enablement; remote kill may disable pairing UI only and cannot touch v1 local operation.

## Definition of done

Done means identical snapshots/media can be independently verified, standby follows only confirmed state and stays silent, authenticated guarded takeover recovers without guessing/replay, every failure returns to independent manual operation, analysis is reproducible and non-destructive, accessible EN/HE cue sheets work offline, logs are bounded/redacted/previewable, the complete hardware/venue/drill matrix passes, and all safety capabilities remain free.

