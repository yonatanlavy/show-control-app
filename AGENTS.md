# AGENTS.md

## Owner-approved OMS parity track (13 October 2026)

The owner approved `docs/oms-parity.md` as the expanded delivery contract. It authorizes contextual OMS transport, pitch-preserving speed, offline voice, image/video external output, BYOK cloud editing/artwork/music, three dark themes, ten languages, and complete library ZIP backups on Android and iOS together. This overrides the older v1 exclusions and single-theme/two-language restrictions below for that specific scope. It does not require implementing unrelated roadmap capabilities such as standby, wearables, venue control, RFID, or collaboration first. Existing safety, native timing, immutable runs, offline operation, free core, privacy, and evidence gates remain mandatory. Cloud provider accounts and keys are user-owned; no subscription or credit service is introduced.

This file governs every file under `show-control-app/`. It intentionally makes this project independent of the parent Yonatan Lavy website. Parent-repository rules still apply when they are stricter, but profile-site branding, marketing, themes, routes, data services, and deployment assumptions do not transfer here.

## Mission

Build the dependable show-audio instrument a solo performer can trust while looking at an audience instead of a screen. The core product is free, unlimited, offline-first, and useful without an account, network, or subscription. V1 may show only its own clearly labelled fixed-size first-party promotions on specified non-live screens and offers a restorable one-time non-consumable to remove them; no third-party advertising SDK belongs in the product. It is initially designed with magicians and mentalists, but its interaction language should remain useful to other solo performers.

Reliability and recovery outrank feature count. A working manual `GO`, a globally available panic fade, local media, a legible next cue, and a rehearsed fallback are more valuable than video, lighting, voice recognition, or AI. Later-stage features are governed by the PRDs in `later-stages/`; they must not destabilize the free playback core.

## Workflow lifecycle

- Before substantive coding, debugging, architecture, product, research, or multi-step work, run the project-aware `think` entry point. Read `.agents/skill-profiles/think.md` completely and follow it.
- After a non-Plan turn changes nonignored Git state, run the project-aware `crit` entry point exactly once before completion. Read `.agents/skill-profiles/crit.md` completely and follow it. Do not duplicate an active trusted hook.
- Inspect the current worktree before changing it. Preserve user and agent work, and coordinate overlaps instead of replacing them.
- Use `apply_patch` for authored file edits. Do not rewrite unrelated files, generated native folders, lockfiles, or snapshots casually.
- Keep claims honest. A contract, mock, Expo configuration entry, or simulator test is not a working native feature. Mark all physical-device, store, proprietary SDK, and venue-output capabilities as unverified until the relevant gate in this file has passed.

## Required reading by task

Read the applicable documents completely before planning or editing:

| Task | Required sources |
| --- | --- |
| Any v1 behavior or product scope | `docs/v1-prd.md`, `docs/reliability-protocol.md` |
| Architecture, data, audio, controllers, bundles | `docs/architecture.md` plus affected contracts in `src/` |
| UI, components, tokens, motion, accessibility, RTL | `docs/design-system.md`, `src/design/tokens.json` |
| Market or competitor claim | `docs/research/market-map.md`; verify current primary sources before publication |
| Release, build, store, supported hardware | `docs/release.md`, this file's verification gates |
| Future feature | The matching complete PRD under `later-stages/` and every earlier dependency PRD |
| Pricing, promotions, marketplace, entitlements | `later-stages/08-commercial-ecosystem.md`, `NOTICE.md`, `LICENSE` |

The market map is dated research, not an evergreen source of product truth. Vendor claims, app prices, operating-system requirements, availability, and ratings can change. Recheck them before external use.

## Confirmed stack and commands

- Expo SDK 57, React Native 0.86, React 19, TypeScript 6, and Expo Router.
- iOS deployment target 16.4; Android minimum API 24. These are configured targets, not a verified support matrix until physical-device testing passes.
- The New Architecture is enabled. The production audio path requires a local native Expo module and a development build; Expo Go is not a supported runtime for production playback verification.
- Source-owned React Native primitives use semantic DTCG tokens. Do not add a web shadcn package or assume DOM/CSS primitives. The desired quality is shadcn-like composability and state completeness, implemented natively.

Canonical commands:

```bash
corepack enable
corepack prepare pnpm@11.16.0 --activate
pnpm install --frozen-lockfile
pnpm run start
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run test:coverage
pnpm run test:architecture
pnpm run check:translations
pnpm run verify
pnpm run prebuild
pnpm run ios
pnpm run android
```

The committed `pnpm-lock.yaml` is authoritative. Do not generate an npm lockfile. Do not claim `pnpm run verify` proves audio, Bluetooth, background execution, route recovery, store readiness, or physical-device support. It proves only the checks it actually runs.

## Domain language and source of truth

- A **Show** is the portable top-level project, with revision, media, sets, cues, controller profile, and panic-fade policy.
- A **Set** is an ordered performance path within a show. A show can contain several sets.
- A **Cue** is an immutable typed definition: `audio`, `group`, `fade`, `stop`, or `wait` in schema v1.
- A **Hit** is a cue exposed in an always-ready ad-lib bank, independently of the main cue order.
- A **RunSnapshot** is the compiled, immutable show/set revision used by the runtime. Builder edits never mutate the armed snapshot.
- A **voice** is one active audio playback instance. Schema v1 caps simultaneous voices at eight; capacity refusal must be explicit and deterministic.
- A **controller adapter** reports physical inputs. Bindings translate inputs into semantic commands such as `GO`, `PANIC_FADE`, or `TRIGGER_HIT`. Audio code never interprets raw buttons.

Keep canonical domain types in `src/domain`, engine contracts in `src/audio`, controller contracts in `src/controllers`, and commercial isolation contracts in `src/promotions`. Do not introduce parallel shapes in screens or storage adapters.

## Architecture rules

1. The time-critical audio engine is native. Do not implement fades, cue completion, scheduling, or interruption recovery with React lifecycles, component state, `setTimeout`, animation callbacks, or a JavaScript-only sample player.
2. UI dispatches semantic commands through one serialized priority router. Every command receives a monotonic ID. Panic fade and stop preempt ordinary work; duplicate and key-repeat inputs are suppressed deliberately.
3. Engine acknowledgement means the native engine accepted a command, not that a remote device received round-trip confirmation. Use precise wording in UI and docs.
4. Compile and validate before arming. The Run screen consumes only a `RunSnapshot` whose cue references, media, set order, group graph, voice limits, and controller bindings have passed preflight.
5. Store structured data in versioned SQLite migrations and media in app-owned local storage. Import through staging, inspect and hash the file, commit metadata atomically, then promote it. Never point a live show at a cloud placeholder or temporary picker URI.
6. Export `.showbundle` archives with a versioned manifest, relative normalized paths, media checksums, and bounded entry/expanded sizes. Reject traversal, symlinks, checksum mismatches, duplicate IDs/paths, archive bombs, and unsupported future schemas before modifying the library.
7. Keep the free run path independent of promotions, entitlements, analytics, remote configuration, and network availability. A commercial failure must never block opening, preflighting, arming, running, recovering, importing, or exporting a show.
8. Updates are disabled in the initial Expo configuration. Any future update mechanism needs a staged rollout and an explicit no-update-during-show safety contract.
9. Do not build a server or account system for local functionality. Add network surfaces only in the later stage that authorizes them, with authentication and local fallback.

## V1 product contract

V1 includes unlimited local shows, sets, cues, and hits; local DRM-free audio import; trim, gain, custom fade duration and curve, pre-wait, loop, stop-and-ready-next, auto-follow, group/fade/stop/wait cues; rehearsal; compiled Run mode; preflight; recovery; healthy lock-screen/background playback and control; generic Bluetooth HID/media-key/keyboard/page-turner inputs; native Flic 2 integration; English and Hebrew; portable versioned backups; and the bounded first-party promotion/removal model below. These are contractual requirements, not current implementation claims: native audio, lock/background lifecycle, Flic SDK access, Flic behavior, store entitlement, physical-device support, and release readiness remain blocking gates until verified.

V1 defaults:

- Manual `GO` is primary. Auto-follow is off unless the creator opts into a controlled fixed sequence.
- A distinct single-press input is assigned to `GO`; a distinct single-press input is assigned to panic. Double-click and hold are not default safety actions.
- A healthy armed run continues playback and supported control while the screen is locked or the app is backgrounded. iOS uses an appropriate `AVAudioSession`, audio background mode, and `MPRemoteCommandCenter`; Android uses a media-playback `MediaSessionService` and required foreground notification. This requirement is physically unverified until both platform lifecycle matrices pass.
- Audio is local and routed to the venue by cable. Bluetooth may control the app, but Bluetooth PA transport is not the recommended mission-critical path.
- The app never automatically resumes audible playback after process death, relaunch, audio-route change, interruption, or crash.
- Native Flic 2 is a v1 input path, including its supported lock/background lifecycle. SDK/licensing access, exact OS behavior, range, reconnect, battery, press semantics, acknowledgement, and physical hardware must pass before release. Do not substitute a generic HID test or claim remote-side acknowledgement the protocol does not provide.
- V1 shows at most one clearly labelled, fixed-size first-party promotion on each of Library, Builder, Rehearsal, Preflight, Controllers, and Settings. Promotions never appear on Armed/Run, Recovery, lock screen, or the Android media notification. Rehearsal and Preflight use only the bundled manifest or an already verified cache; signed HTTPS refresh happens only while idle/noncritical. `remove_promotions` is a restorable one-time non-consumable; its storefront price is owner-controlled and never hardcoded.
- No commercial music ships with the app. Demo audio must be original, public-domain, or documented under a redistribution-compatible license.

Out of v1: subscriptions, third-party/behavioral ads, account-required sync, wearables, MIDI/OSC, browser remotes, hot standby, multimedia, DMX/network show control, voice/camera/RFID triggers, audience interactions, marketplace, and AI generation.

## Reliability and recovery invariants

- Panic is global, visually separated, available by touch, and routed at highest priority. A modal, selected row, builder edit, or controller disconnect cannot make it unavailable during an armed run.
- An unknown, lost, or changed audio route produces an explicit warning and safe stop/fade policy. Never silently reroute or silently resume.
- The next cue may be prepared, but the system must not trigger it without the defined manual or auto-follow transition.
- Duplicate remote events, held-key repeats, stale acknowledgements, late progress events, and rapid multi-presses have deterministic behavior covered by tests.
- Persistence is atomic and migration-safe. Retain a rollback copy when upgrading persisted schemas. Editing state may be restored; audible state may not.
- Missing, unreadable, changed, corrupt, or nonlocal media blocks arming or requires an explicit safe resolution. Do not substitute another asset.
- Recovery always includes manual touchscreen access. Essential triggers introduced later always retain a manual equivalent.
- The app should fail silent, not loud. When uncertain whether a command completed, show uncertainty and require a deliberate recovery action.
- Operators must be able to rehearse panic fade, replay, previous, skip, arbitrary cue start, controller loss, route loss, app restart, and continuing without audio.

## Design and interaction rules

- The only shipped stage theme is forced Midnight dark. Use semantic tokens from `src/design/tokens.json`; do not introduce raw feature colors or one-off sizes in screen code.
- The Run screen has fixed, bottom-weighted geometry: status, NOW, NEXT, recovery access, a separated panic control, and a `GO` control at least 96 dp high. Runtime labels or state changes must not shift the controls.
- Touch targets are at least 48 by 48 dp. Support Dynamic Type, screen readers, keyboard/switch access where the platform permits, visible focus/confirmed/disabled/loading/error states, and non-color state cues.
- No decorative motion in Run. Respect reduced motion everywhere; status changes remain understandable without animation or haptics.
- Provide Touch Guard against accidental screen input and Stage Blackout without stopping the audio engine. Both must have accessible, rehearsable exit gestures that cannot be confused with `GO`.
- Use Geist for Latin, Heebo for Hebrew, Geist Mono for timings, and system fallback when fonts are unavailable. Do not apply tracking to Hebrew.
- All user-visible and assistive strings live in complete English and Hebrew dictionaries. Use logical alignment and order. RTL mirrors navigation and layout where semantic, never media, transport symbols, waveforms, clocks, or physical-controller diagrams blindly.
- Run controls use plain language and immediate status. Avoid ornamental theatre-console density and avoid playful feedback in failure states.

## Privacy and security

- Local-only is the default. Shows, filenames, cue notes, imported media, controller identifiers, and performance history can be sensitive; never upload them implicitly.
- No account is required for core playback. No third-party advertising SDK may enter the app, and no promotion, manifest refresh, storefront, or entitlement code may enter the run process.
- Crash reporting is opt-in, disabled until disclosure and consent exist, and must strip show names, cue names, filenames, paths, notes, controller identifiers, and media content. Environment keys are not evidence that consent or scrubbing is complete.
- Validate every imported file and archive before persistence. Do not execute imported scripts, expressions, URLs, or active document content.
- Security reports follow `SECURITY.md`. Do not publish exploit details before a safe release is available.

## Verification gates

Use the smallest complete matrix for the changed surface:

- **Documentation only:** validate links, names, commands, schemas, license/notice consistency, and the distinction between implemented and planned behavior.
- **Domain or command changes:** `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, `pnpm run test:architecture`; add deterministic unit tests for compilation, graphs, capacity, ordering, duplicate suppression, and preemption.
- **Translations or UI:** the above plus `pnpm run check:translations`, English and Hebrew screen checks, RTL, font scaling, reduced motion, screen reader labels, 48 dp targets, phone/tablet, portrait/landscape, and stable Run geometry.
- **Persistence or bundles:** migration upgrade/downgrade/rollback fixtures; interrupted-write and low-storage tests; malicious path, oversized archive, checksum, unknown schema, and round-trip fixtures.
- **Native audio or lifecycle:** unit/integration checks are insufficient. Use signed development/release builds on physical iOS and Android devices. Exercise wired output, route removal/reconnect, calls/alarms/other audio, background/foreground, lock/unlock, low battery, thermal/load, process kill, rapid input, eight voices, long runs, and at least one low/mid supported device per platform.
- **Controller claim:** test the exact named hardware, firmware, OS, adapter, app state, range, RF-loaded venue, batteries, duplicate/hold behavior, disconnect/reconnect, and manual fallback. Do not generalize one Bluetooth keyboard test into Flic, MediaStar, Audio Ape, or all HID support.
- **Store release:** production signing, privacy labels/data safety, permission copy, export compliance, accessibility, clean install/upgrade, backup restore, and staged rollout must pass. A local build is not store approval.

Record real-hardware evidence with device/OS/build/hardware/firmware/date/result. Until that record exists, describe the item as `contract only`, `simulator/emulator tested`, or `physical-device unverified`.

## Roadmap governance

Each future PRD states objective, dependencies, free/paid classification, non-goals, UX, interfaces/schema changes, offline/failure behavior, manual fallback, accessibility/i18n, migrations, real-hardware tests, rollout gates, and definition of done. Implement a later stage only after its dependencies meet their definitions of done. Updating a roadmap PRD does not implement its features.

Safety stays free: panic, manual control, recovery, preflight, backups, diagnostics needed to understand a failure, and reliable local playback may never be paywalled. Paid one-time additions may extend production breadth, but entitlements may not sit on the command, engine, repository, import/export, or recovery path.
