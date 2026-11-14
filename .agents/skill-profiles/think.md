# Show Control project profile for `think`

Use this profile after the global `think` entry point selects `show-control-app`. Read `AGENTS.md` first; it is the authority for scope, safety, architecture, verification, and honest capability language.

## Classify the task

Apply every relevant category:

- **Playback core:** cue compilation, run state, command routing, native audio, progress, voices, fades, groups, hits, panic, or interruption handling.
- **Builder and data:** shows, sets, cues, media import, SQLite, migrations, autosave, `.showbundle`, or recovery copies.
- **Controllers:** HID/media keys, Bluetooth, profiles, semantic bindings, acknowledgement, disconnect behavior, or future adapters.
- **Stage UI:** Library, Builder, Rehearsal, Preflight, Run, Recovery, Controllers, Settings, tokens, component primitives, accessibility, English/Hebrew, or RTL.
- **Platform/release:** Expo config, native modules, permissions, dev clients, EAS, signing, store metadata, updates, supported OS/devices, or CI.
- **Commercial/network/future:** v1 fixed first-party promotions and `remove_promotions`, entitlements, paid additions, telemetry, collaboration, remote control, marketplace, or any `later-stages/` capability.
- **Documentation/workflow:** governance, research, contribution, security, architecture, release, or PRDs.

## Preflight

1. Read all sources routed by `AGENTS.md` for the classified categories, including the complete applicable later-stage PRD.
2. Inspect the current implementation and callers. Distinguish interfaces, samples, mocks, and configuration from working native behavior. Identify what has actually passed automated, simulator, physical-device, named-hardware, and store gates.
3. Inspect Git status and preserve unrelated/user changes. Coordinate overlapping files with active agents.
4. State the smallest outcome, affected public contracts, data flow, lifecycle/failure cases, migrations, compatibility constraints, manual fallback, and verification evidence needed.
5. Reject scope that makes the free run path depend on network, entitlements, promotions, or React timing. A required but not-yet-verified native or proprietary dependency such as Flic remains an explicit release blocker with a manual touch fallback; do not silently remove it from the contract or describe it as complete.
6. For product choices, prefer deterministic manual operation and visible recovery over automation. For future triggers, require arming, status/confidence, duplicate suppression, and a manual equivalent.
7. For new dependencies, verify maintenance, its license and any obligations it adds to the MIT-licensed source or distributed builds, native/platform support, offline behavior, binary impact, privacy impact, and whether a source-owned adapter can isolate it.
8. Make a concise implementation plan before mutation. In Plan mode, do not mutate files.

## Required reasoning by surface

### Playback core

Trace `Show`/`ShowSet`/`Cue` through compilation to immutable `RunSnapshot`, semantic command, priority router, `AudioEngine`, engine event, and UI state. Specify monotonic IDs, duplicate behavior, preemption, voice capacity, graph/reference validation, stale event rejection, interruption/route behavior, and deliberate resume. Never put time-critical behavior in React or JavaScript timers.

### Builder and data

Define transactional boundaries, schema version/migration, atomic autosave, rollback, staged import, checksum, orphan cleanup, low-storage behavior, future-schema rejection, export compatibility, and failure before committing. Never use cloud-only or temporary picker URIs as live show assets.

### Controllers

Separate physical input from semantic command. Define supported app state, down/up/repeat policy, debounce, health, reconnection, acknowledgement semantics, simple default grammar, and touch fallback. Name exact verified hardware; do not use “Bluetooth support” as a blanket claim.

### Stage UI

Preserve fixed Run geometry, global panic, 48 dp targets, semantic Midnight tokens, state-complete primitives, no decorative Run motion, Dynamic Type, screen readers, reduced motion, English/Hebrew parity, logical RTL, phone/tablet, and both orientations. Ensure failure is clear without color, haptic, or animation alone.

### Platform/release

Treat Expo Go, simulator/emulator, development build, physical device, release build, exact hardware, venue trial, and store approval as distinct evidence levels. Plan safe updates, clean install and migration, permission denial, process death, background/foreground, audio focus/session, output route, wired PA, RF load, and rollback.

### Commercial/network/future

For v1 promotions, read `docs/v1-prd.md`: one fixed first-party placement is allowed only on Library, Builder, Rehearsal, Preflight, Controllers, and Settings; never Run/Armed, Recovery, lock screen, or Android notification. Refresh only while idle/noncritical; Rehearsal/Preflight use bundled/verified cache; `remove_promotions` is a restorable one-time non-consumable with no hardcoded price. For later work, check the authorizing PRD. Keep safety and core local playback free. Isolate network and entitlement failure. Define authentication, replay protection, local-only fallback, privacy, data retention, abuse limits, and an exit/export path.

## Verification plan

Use the verification matrix in `AGENTS.md`. Run only commands present in `package.json`. Automated checks do not satisfy physical-device, controller, venue, or store gates. Report the evidence level precisely, including anything not run or blocked.
