# V1 PRD: free offline show audio

## Owner decision: remove promotional panels (26 October 2026)

The app no longer mounts the bottom promotional/branding panel on any route, reserves no promotional footer space, and exposes no promotion-removal purchase panel in Settings. This owner decision supersedes the historical placement/removal requirements below for the current app. Existing entitlement records and isolated commercial adapters remain compatible but are not mounted by application routes. No payment, account or migration is required to remove the panel; safety, defaults and library data are unchanged.

## Approved expansion: OMS functional parity

The owner approved [the OMS parity contract](oms-parity.md) on 13 October 2026. For this delivery, it extends the baseline below with production SQLite/media/ZIP storage, schema-v2 per-set OMS transport, pitch-preserving speed, offline voice, audience-only external image/video output, BYOK assistant/cover/music generation, three dark themes and ten languages. The exclusions below remain the historical v1 baseline; the approved contract authorizes these specific additions without requiring unrelated roadmap stages. Free offline playback, native timing, immutable runs, explicit recovery and both-platform evidence gates continue to apply. See [the feature checklist](oms-parity-checklist.md) for implementation and remaining acceptance gates.

**Status:** Approved planning baseline  
**Audience:** Product, design, mobile, native audio, QA, accessibility, documentation, and release contributors  
**Platforms configured:** iOS 16.4+ and Android API 24+; support remains physical-device unverified until the release matrix passes  
**Commercial class:** Free forever core; no subscription, third-party ads, account, show/cue limits, or network requirement. One bounded fixed first-party promotion per named non-live screen; a restorable one-time non-consumable removes promotions. Store price remains an owner decision and is never hardcoded.

## Objective

Deliver a premium, performer-first mobile instrument that lets a solo performer build, rehearse, preflight, and run an audio-led show from local files using a large manual `GO`, independent hits, custom fades, generic external buttons, native Flic 2, healthy lock-screen/background playback and control, and explicit recovery. It must be trustworthy enough to earn show use through evidence, without claiming reliability that has not been demonstrated on real devices and exact hardware.

## Problem and evidence

Existing products split into playback software, discreet controllers, and hands-free trigger systems. The market's mature audio default is focused and responsive; newer products often compete on multimedia, AI, and subscriptions before establishing reliability. Audience interaction does not follow a fixed clock, so a manual theatrical `GO` is a feature rather than a limitation. The opportunity is an unlimited free, cross-platform, local-first core with unusually clear preflight, recovery, backup, and documentation.

The dated evidence and limitations are preserved in `research/market-map.md`. Requirements below are product decisions, not claims that competitors lack every item.

## Users and outcomes

Primary users are magicians and mentalists who operate their own walk-on music, underscoring, transitions, reveals, ad-lib effects, bows, and walk-off cues. Secondary users are hypnotists, dancers, speakers, comedians, small musicians, and other solo performers with the same manual-timing need.

A successful user can:

- create an unlimited show with one or more ordered sets and an independent Hits bank;
- import final audio once, then rehearse and perform with no account or network;
- understand what is playing and what `GO` will do next without studying a console;
- operate by touch or a simple assigned external button while keeping a touch fallback;
- fade everything safely, recover from a wrong or missing cue, restart without surprise audio, and restore the show on another device;
- use the complete flow in English or Hebrew, LTR or RTL, with Dynamic Type, reduced motion, and assistive technology.

## Dependencies

- Expo SDK 57/React Native shell and source-owned design primitives.
- Canonical `Show` → `ShowSet` → `Cue` domain model, compiler, immutable `RunSnapshot`, and explicit run state machine.
- Production-grade local native Expo audio module implementing `AudioEngine`; the current interface or sample provider alone does not satisfy this dependency.
- SQLite repositories and transactional migrations; app-owned media storage with staging and SHA-256 verification.
- OS-exposed generic HID/media/keyboard input adapter, native Flic 2 SDK adapter, and controller profile repository. Flic SDK/licensing access is a release dependency, not assumed complete.
- Native iOS audio background mode/`MPRemoteCommandCenter` integration and Android media-playback `MediaSessionService`/notification integration.
- Bundled and signed-manifest first-party promotion provider, storefront entitlement adapter for a restorable `remove_promotions` non-consumable, and strict architecture isolation from live playback.
- Complete EN/HE dictionaries and translation parity tooling.
- Versioned `.showbundle` encoder/validator/importer.

## Scope

### Show library and builder

- Create, rename, duplicate, archive/delete, export, and import unlimited shows.
- Add, rename, duplicate, delete, and reorder sets. A set owns an ordered cue list and a separate ordered Hits bank.
- Builder and Rehearsal remain distinct from locked/armed Run. Editing creates a new show revision and never mutates the current `RunSnapshot`.
- Autosave transactionally after a valid edit. Show explicit saving, saved, and failed-to-save states; retain the previous committed revision after failure.
- Destructive actions require confirmation and a recoverable soft-delete window where the storage implementation supports it.

### Local media

- Import user-selected DRM-free audio via the platform picker into staging, inspect it, compute SHA-256, copy it into app-owned local storage, commit metadata atomically, and clean staging.
- Initial required formats are the formats the production native engine proves on both platforms. WAV, AIFF, M4A/AAC, and MP3 are target formats; FLAC or others must not be advertised until the physical-device codec matrix passes.
- Record bytes, duration, codec, channels, sample rate, and checksum. Do not retain a temporary picker URI as the canonical asset.
- Detect missing, changed, unreadable, cloud-placeholder, unsupported, zero-length, or corrupt media before arming. Never substitute by filename.
- No streaming source, Apple Music/Spotify/YouTube integration, bundled commercial music, or required venue Wi-Fi.

### Cue model

- `audio`: media reference, trim in/out, gain dB, fade-in/out duration, `linear`/`smooth`/`equalPower` curve, pre-wait, and end behavior `stopAndReadyNext`/`autoFollow`/`loop`.
- `fade`: target all, cue IDs, or tags; duration, curve, and optional stop-at-end.
- `stop`: target all, cue IDs, or tags.
- `wait`: duration with manual or auto continue.
- `group`: children and offsets, after validation for missing references, cycles, depth, and the eight-voice limit. V1 uses fixed offsets only, not conditions or branches.
- Hits reuse valid cue definitions and can overlap the main sequence within the voice limit. A Hit never advances the main cue pointer.
- Manual timing is the default. Auto-follow is opt-in per cue and should be used only for creator-controlled sequences.

### Rehearsal

- Start any cue, seek an audio cue in rehearsal only, replay, previous, skip, pause/resume, trigger hits, and run panic without changing the production cue order.
- Show elapsed/remaining time and active voices based on native engine events, not JS estimates.
- Provide an explicit drill checklist for panic, wrong cue, route change, controller loss, app restart, arbitrary finale start, and continuing without audio.

### Preflight and arming

- Compile a chosen show/set revision into a `RunSnapshot`; resolve all references and local media, validate group graph/voice capacity/controller bindings, and preserve the exact revision ID.
- Check observable media integrity, output route, remote connection/input test, device volume/mute where APIs allow, battery/charging, free storage, screen-awake policy, app version, and last backup status.
- Distinguish blocking failures from warnings. Missing/corrupt/nonlocal media, invalid graph, unsupported future schema, or an unavailable engine blocks arming. A disconnected optional controller warns when touch is still viable.
- State what cannot be observed. Do not show a false green check for venue mixer state, cable condition beyond OS detection, RF congestion, actual mono compatibility, PA loudness, or a remote's remaining battery when unavailable.
- Enter Run only through deliberate `ARM` confirmation after required checks pass.

### Run and recovery

- Fixed Run layout: run/route/controller status, NOW, NEXT, recovery entry, separated panic, at least 96 dp `GO`, and optional compact Hits access that cannot displace primary controls.
- The native engine prepares the immutable snapshot. A single semantic command router assigns monotonic IDs, serializes commands, suppresses duplicates/repeats, and gives `PANIC_FADE`/`STOP_ALL` priority.
- `GO` performs the next defined transition exactly once. Progress and acknowledgement are driven by engine events; stale events cannot rewrite current state.
- Recovery exposes replay current, previous, skip, choose/start any cue, stop all, rebuild from the same snapshot, return to preflight, and a no-audio continuation cue sheet.
- Panic is globally available by touch while armed and configurable to a tested fade duration. It does not depend on the selected cue or an open panel.
- Touch Guard suppresses accidental screen input without disabling physical controls. Stage Blackout dims visual output without stopping audio. Each has a distinct accessible exit.
- During a healthy armed lifecycle, playback and supported commands continue after backgrounding or locking. iOS exposes deliberately limited system actions through `MPRemoteCommandCenter`; Android runs a media-playback `MediaSessionService` with a minimal safety-reviewed notification. On calls, Siri/assistant, alarms, audio-focus loss, engine fault, process death, or relaunch, enter Interrupted/stopped and never auto-resume audible playback.
- Output-route removal immediately mutes/stops before the OS can fall back audibly to the device speaker. Show route uncertainty and require explicit route recovery and resume.

### Controllers

- Accept OS-exposed generic keyboards, media keys, page-turners, footswitches, or Bluetooth HID inputs through adapters. Capture down/up/repeat and map a stable `inputKey` to a semantic command.
- Create named profiles, assign one simple input per safety-critical action, test each binding, show health/last receipt, and keep manual touch equivalents.
- Recommended default is distinct single-press `GO` and panic controls. No safety action defaults to double-click, long hold, or a sequence.
- Phone visual/haptic acknowledgement confirms app/engine receipt only. Do not claim remote-side bidirectional confirmation.
- Native Flic 2 integration is required in v1 for its SDK-supported foreground, background, and locked states. The adapter must expose health, input phase, repeat/duplicate policy, reconnect, and honest acknowledgement semantics. Release is blocked until SDK access/licensing and the exact hardware matrix pass.
- Apple Watch/Wear OS, MIDI, OSC, browser remote, Audio Ape/MediaStar proprietary protocols, and RFID are later-stage work.

### First-party promotions and removal

- Render at most one clearly labelled fixed-size first-party promotion on each of Library, Builder, Rehearsal, Preflight, Controllers, and Settings. Reserve stable layout space so cache/network state cannot shift critical controls.
- Never render or fetch on Armed/Run, Recovery, lock screen, or the Android media notification. No third-party ad network, behavioral targeting, auction, cross-app identifier, or user/show/media-derived targeting.
- Ship a safe bundled manifest. Refresh a signed HTTPS manifest only while the app is idle and noncritical. Rehearsal and Preflight may render the bundled or previously signature-verified cached placement but perform no network work.
- Validate signature, schema, revision, URL allowlist, placement/surface, fixed dimensions, date bounds, and content length before atomically replacing cache. Invalid, unavailable, or expired data falls back to bundled content or no placement; never block the screen.
- `remove_promotions` is a restorable one-time non-consumable entitlement. Never hardcode its price; show the localized storefront value. Purchase/restore/network/store failure leaves the free product fully usable and never touches playback. A verified local entitlement hides placements immediately and offline.

### Backup and portability

- Export a `.showbundle` containing a manifest, show schema, controller profile where portable, and app-owned media using normalized relative paths and SHA-256 checksums.
- Validate the complete archive in staging before changing the library: schema support, IDs/references, path traversal/symlinks, entry and expanded-size limits, media/checksums, collisions, and available storage.
- Import transactionally as a new show/revision. Never partly merge a failed bundle. Preserve unknown future data only if the version contract explicitly permits it; otherwise reject clearly.
- Share via platform file sheet; network/cloud storage is only a user-chosen destination, never a runtime dependency.

## Non-goals

V1 does not include subscriptions, third-party/behavioral advertising, hardcoded storefront prices, account sync, collaboration, telemetry by default, proprietary-controller certification beyond the required Flic 2 matrix, wearables, hot standby, loudness normalization, mono analysis, advanced ducking/conditional branches, rate/pitch/pan, multichannel routing, video/images/PDF/camera, external displays, lighting/DMX/NDI, MIDI/OSC/timecode, RFID/NFC/voice/camera recognition, audience QR/polls, marketplace, AI generation, or QLab/Go Button import.

## UX and navigation

Routes are Library, Builder, Rehearsal, Preflight, Run/Armed, Recovery, Controllers, and Settings. Compact bottom navigation serves non-armed areas; direct actions carry the show from Builder → Rehearsal → Preflight → Run. Armed Run suppresses ordinary navigation and makes exit deliberate.

Empty states teach one action. Errors name the failed item and a recoverable next step. Technical logs remain secondary. Builder density can scale for tablets; Run retains the same motor map across phone/tablet, orientation, localization, and state changes. The six eligible non-live screens reserve one fixed promo slot that disappears cleanly after `remove_promotions`; the slot is never inserted into the task flow or mistaken for a primary action.

## Public interfaces and schema

Schema v1 is defined by canonical TypeScript types in `src/domain/model.ts`: `Show`, `ShowSet`, the five-cue union, `MediaAsset`, `ControllerProfile`, and immutable `RunSnapshot` with `schemaVersion: 1` and `voiceLimit: 8`. Storage and bundle schemas must derive from and version this model rather than inventing screen-specific records.

The engine boundary is `AudioEngine.prepare(snapshot)`, `dispatch(command)`, `subscribe(listener)`, and `shutdown()`. Commands and events in `src/audio/contracts.ts` are the public boundary between application orchestration and native playback. Controller adapters in `src/controllers/contracts.ts` publish raw normalized inputs; binding produces domain commands before routing.

Any incompatible schema change requires a new schema version, migration fixtures, old-bundle import behavior, rollback plan, and release note. Adding optional fields still requires deterministic defaults in the compiler.

## Offline and failure behavior

Every core flow works in airplane mode after media import. Network, sign-in, storefront, entitlement, promotion, telemetry, and update failures have no code path to playback or recovery. Bundled/cached promotions and the last verified removal entitlement work offline; purchase/restore may require the store. Persistence uses transactions and retains the last committed revision. Low storage fails before copying/committing. The engine fails silent and reports uncertainty; it does not guess whether to replay. See `reliability-protocol.md` for operational and test requirements.

## Manual fallback

Touch `GO`, touch panic, Recovery, arbitrary cue start, and stop all remain available without any controller. Exportable emergency cue sheets and hot standby are stage 01, but v1 documentation must tell operators to carry a second device or simple emergency playlist, cable, adapter, power, and a written cue order. A show can continue without music; recovery UI must never imply otherwise.

## Accessibility and internationalization

English and Hebrew ship together with key parity, including assistive labels, errors, controller actions, and recovery. Hebrew uses RTL logical layout and Heebo without tracking. Run motor positions remain stable and directionally sensible. Minimum targets are 48 dp; `GO` is at least 96 dp high. Support Dynamic Type without clipped critical actions, reduced motion, screen readers, hardware/switch focus where available, non-color state labels, and haptic-independent confirmation.

## Privacy and security

Core data stays on device. No account or implicit upload. Imported media and archives are untrusted inputs; enforce type/size/path/checksum/schema constraints and never execute content. Crash diagnostics, if introduced, are opt-in and scrub show/cue/file/controller details. Permission denial must preserve touch/local operation where possible.

## Migrations

Initial SQLite schema is version 1. Every migration runs transactionally, is idempotence-tested where applicable, retains a pre-migration recovery copy, and has fixtures from every supported version. Process death, disk-full, and corrupt-database tests must demonstrate either rollback or a user-directed restore path. Bundle schema and database schema versions are explicit and may evolve independently.

## Acceptance and test scenarios

Automated tests must cover cue/reference validation, group cycle/depth/offsets, compilation immutability, end behavior, voice-limit refusal, deterministic command ordering, monotonic/stale IDs, held-key and duplicate suppression, panic preemption, run-state transitions, persistence transactions/migrations, media staging cleanup, bundle traversal/bomb/checksum/future-version rejection, translation parity, signed-manifest validation/cache fallback, restorable entitlement state, exact promo surface allowlist, and promotion/store isolation from live playback.

UI checks cover all routes, empty/loading/saving/error/disabled/confirmed states, stable Run geometry, Touch Guard, Stage Blackout, largest supported font sizes, screen reader order/names/state, reduced motion, EN/HE and RTL, small phone, tablet, portrait, and landscape.

Real-device release checks cover at least one low/mid and one current device per platform, wired output through a representative adapter/DI/PA, supported codecs, mono files, 2+ hour run, repeated full-show runs, healthy continuous playback/control while backgrounded and locked, iOS remote-command center, Android MediaSessionService/notification, rapid input, eight voices, low battery/storage, thermal load, notifications/calls/Siri/assistant/alarms, audio-focus loss, process kill, route removal before speaker fallback, headphones/USB interface, controller disconnect/reconnect, airplane mode, clean install, upgrade, bundle transfer, store purchase/restore/offline entitlement, and recovery without audio.

Exact controller checks record model, firmware, OS, adapter/SDK version, range/positions, populated RF environment, battery, foreground/background/locked state, down/up/hold/repeat, rapid presses, reconnection, receipt semantics, and touch fallback. Flic 2 must pass this named matrix; generic results must not be presented as MediaStar/Audio Ape certification.

## Rollout gates

1. **Contract gate:** domain/engine/controller/storage/bundle contracts reviewed; architecture tests prevent forbidden imports and commercial coupling.
2. **Automated gate:** `npm run verify` passes from a clean install; security fixtures and translation parity pass.
3. **Native alpha:** production native engine works in signed development builds on both platforms; no Expo Go claim.
4. **Device beta:** complete physical-device matrix, documented failures, and zero open critical show-safety defects.
5. **Performer pilot:** multiple complete rehearsals and low-risk performances with explicit backup, incident logs, and no unresolved unintended-audio or panic failure.
6. **Store candidate:** signed release builds, privacy/data-safety forms, permission copy, accessibility audit, clean upgrade/restore, export compliance, support/security path, and rollback build pass.
7. **Staged public release:** small cohort first; do not force updates; pause rollout on unintended audio, data loss, panic unavailability, broken import/restore, or platform regression.

## Definition of done

V1 is done only when every core flow is implemented without an account/network/payment dependency; the native engine and healthy lock/background lifecycle—not merely interfaces or samples—pass both platform matrices; native Flic 2 and named generic controller classes pass recorded hardware tests; signed fixed promos and restorable one-time removal pass storefront/offline/isolation tests; EN/HE accessibility and migration/bundle gates pass; rehearsed recovery works after real failures; store requirements pass; and documentation names any remaining limits precisely. Until then the project may be a scaffold, alpha, or beta, but not a proven show-ready release.
