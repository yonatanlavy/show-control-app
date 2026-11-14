# Show Control

Free, offline-first show audio for solo performers who need the soundtrack to wait for the human moment.

Show Control is an iOS and Android app built with Expo and React Native, designed first with magicians and mentalists. It is designed to provide ordered sets, a large manual `GO`, independent ad-lib Hits, custom fades, rehearsal, preflight, external controls, background/lock operation, and failure recovery.

The long-term promise is simple: unlimited core use, no subscription, no account, and no network dependency for running a show. V1 may display one clearly labelled fixed first-party promotion on six non-live screens and offers a restorable one-time purchase to remove those promotions. Promotions never enter Armed/Run, Recovery, lock screen, or the Android media notification.

> [!WARNING]
> **Engineering alpha.** This is not yet a proven show-ready app. Do not use it as the only audio system for a paid show. See [Current status](#current-status-engineering-alpha).

## What it is built to do

These lists describe the product contract, not verified support.

Core show control:

- Unlimited local shows, sets, cues, and always-ready Hits
- Audio, group, fade, stop, and wait cues with trim, gain, custom fade duration and curve, pre-wait, loop, and auto-follow
- A large manual `GO`, a global panic fade, and a fixed Run layout showing NOW and NEXT
- Rehearsal, preflight validation, and recovery that never resumes audio automatically
- Background and lock-screen playback and control
- Generic Bluetooth HID, media-key, keyboard, and page-turner input, plus native Flic 2 (which requires the separately licensed Flic SDK)

Approved [OMS parity](docs/oms-parity.md) additions:

- SQLite library with media import, an editor, and complete library ZIP backups
- Contextual GO, pitch-preserving speed, crossfade, and recovery in the native engine
- Offline voice triggers via whisper.cpp
- Image and video output to an audience-only display
- Optional cloud editing, artwork, and music that use your own provider keys (BYOK)
- Stopwatch, three dark themes, and ten languages

The [feature checklist](docs/oms-parity-checklist.md) links each feature to its source and acceptance evidence. Implemented features still need the physical-device gates below before they count as supported.

## Current status: engineering alpha

Android native modules and whisper JNI have compiled. iOS compilation and physical-device evidence remain required.

Release-critical work still includes:

- physical verification of native generic HID/media-key/Flic handoff in locked/background states and the licensed Flic iOS SDK;
- voice false/missed-trigger benchmarks, external microphone/output combinations and physical HDMI scenes;
- live BYOK provider generation, quota/cancellation and generated-media import with paid provider accounts;
- measured current/next/group decode-preload and memory budgets on the certified low/mid device matrix before claiming the onset targets;
- macOS/Xcode or suitable iOS build-service compilation, signing and privacy setup;
- the full physical-device, wired-output, RF/venue, accessibility, migration, soak, and performer-pilot gates.

Do not describe an item as supported until the evidence levels in [the reliability protocol](docs/reliability-protocol.md) and [release guide](docs/release.md) pass. The [verification record](docs/oms-verification.md) separates passing checks from remaining device and provider gates.

The older optional promotion/storefront roadmap is separate from OMS parity acceptance. Parity does not require billing or promotion delivery.

## Architecture in one minute

```text
Show revision -> compile/preflight -> immutable RunSnapshot
                                           |
touch/Flic/HID -> semantic command -> priority router -> native AudioEngine
                                           |
UI run state <- acknowledged native events <-+
```

Time-critical playback, fades, scheduling, audio session/focus, route handling, and healthy background/lock operation belong in native code, not in React lifecycles or JavaScript timers. Panic and stop preempt ordinary commands. Controllers normalize physical input into semantic commands and never bypass the router. Local data and media are transactional and versioned. Promotions, purchases, analytics, and network code are forbidden from the live safety path.

## Getting started

Prerequisites:

- Node.js 22.13 or newer
- Corepack, with pnpm matching `pnpm-lock.yaml`
- Platform tools for Expo native development: Xcode on macOS for iOS, Android Studio and a JDK for Android
- A development build. Expo Go cannot load or validate the local native audio, controller, or speech modules.

Install and start:

```bash
corepack enable
corepack prepare pnpm@11.16.0 --activate
pnpm install --frozen-lockfile
pnpm run prepare:speech
pnpm run start
```

Run checks:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run test:architecture
pnpm run check:translations
pnpm run verify
```

`pnpm run verify` proves only the checks it runs. It does not prove audio, Bluetooth, background execution, route recovery, store readiness, or physical-device support.

Native development:

```bash
pnpm run prebuild
# On macOS, before installing iOS pods/building:
pnpm run prepare:speech:ios
pnpm run ios
pnpm run android
```

Notes:

- Prebuild creates the generated native projects. Source-owned Swift, Kotlin, and speech C++ live under `modules/`.
- Speech preparation downloads pinned MIT-licensed whisper.cpp source. The app downloads the verified base model once during setup.
- The Android build fetches a pinned, checksum-verified yt-dlp executable for the download module.
- Rebuild the development build after native changes.
- `pnpm-workspace.yaml` configures pnpm 11's hoisted linker to avoid Windows native-build path limits. Dependency lifecycle scripts are disabled, and speech preparation is explicit.
- On Windows, use a short temporary directory if Gradle's AF_UNIX daemon socket cannot initialize.

## Repository layout

| Path | Contents |
| --- | --- |
| `app/` | Expo Router screens: library, builder, rehearsal, preflight, run, recovery, controllers, settings, and more |
| `src/domain/` | Canonical show, set, cue, and run-state types, the compiler, and validation |
| `src/audio/` | Engine contracts, the serialized priority command router, and the native engine bridge |
| `src/controllers/` | Controller contracts, input normalization, and setup |
| `src/storage/`, `src/library/` | SQLite persistence, media files, `.showbundle`, and library backups |
| `src/runtime/`, `src/platform/` | Show session, critical-session gating, and background readiness |
| `src/ui/`, `src/design/`, `src/i18n/` | Native primitives and screens, design tokens and themes, and translations |
| `src/promotions/` | Isolated first-party promotion and entitlement code |
| `src/ai/`, `src/music/`, `src/voice/` | BYOK assistant operations, music library and downloads, and voice |
| `modules/` | Local native Expo modules: `show-audio`, `show-controller`, `show-voice`, `show-visual`, `show-downloads`, `show-commerce` |
| `plugins/` | Expo config plugins |
| `tests/` | Jest suites, including architecture-boundary tests |
| `scripts/`, `tools/` | Preparation and check scripts, plus Android build and device-probe tooling |
| `music-library/` | Bundled music, per-track credits, and license provenance. The large ZIP packages stay local and are not in Git; see [docs/music-library.md](docs/music-library.md) |
| `docs/` | Product contract, architecture, reliability, design, release, and dated investigation records |
| `later-stages/` | Dependency-ordered PRDs for future capabilities |

## Documentation

Read these before implementation:

- [V1 PRD](docs/v1-prd.md): launch behavior, non-goals, interfaces, tests, and definition of done.
- [OMS parity contract](docs/oms-parity.md) and [checklist](docs/oms-parity-checklist.md): the approved expansion, its implementations, and the evidence still required.
- [Library backup format](docs/library-backup-format.md): portable ZIP encoding, bounds, and recovery rules.
- [Architecture](docs/architecture.md): domain, native engine, command, persistence, bundle, controller, and commercial boundaries.
- [Reliability protocol](docs/reliability-protocol.md): safe failure, operational drills, the physical-device matrix, and evidence language.
- [Design system](docs/design-system.md): tokens, native primitives, the fixed Run motor map, accessibility, EN/HE, and RTL.
- [UI refinement plan](docs/ui-refinement-plan.md): inspected design references, shared components, per-screen changes, and defaults.
- [Edge/combinations ledger](docs/refinement-edge-cases.md): 60 examined edges and 10 risky combinations, with fixes and evidence levels.
- [Music library](docs/music-library.md): bundled music packages, cue direction, and import paths.
- [Release guide](docs/release.md): build, store, and staged-rollout gates.
- [Later stages](later-stages/README.md): eight dependency-ordered PRDs for reliability, audio, controllers, multimedia, venue control, specialty triggers, collaboration, and the commercial ecosystem.
- [Market research provenance](docs/research/README.md): the preserved owner-supplied market map and its verification caveats.

Repository work is governed by [AGENTS.md](AGENTS.md). The project is independent of the parent Yonatan Lavy website and can be transferred as its own repository.

## Supported platforms

The configuration targets iOS 16.4+ and Android API 24+. That is not the verified support matrix. Use precise labels: contract/scaffold, automated verified, simulator/emulator verified, physical-device verified, named-hardware verified, performer-pilot verified, or store released. Link the test record when making a claim.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening changes. Contributions use Developer Certificate of Origin sign-off and must preserve the free safety core, license and notice obligations, accessibility/i18n, and evidence discipline.

Report vulnerabilities privately using [SECURITY.md](SECURITY.md), especially anything that can cause unintended audio, disable panic, corrupt shows, accept hostile bundles, expose private show data, or permit unauthorized remote control.

## License

Show Control source code is released under the [MIT License](LICENSE).

Some components and content have their own terms. See [NOTICE.md](NOTICE.md) for details, including:

- whisper.cpp (MIT), used for offline speech;
- the GPL-3.0 youtubedl-android adapter, which is included only in Android builds, so distributing an Android build must comply with GPL-3.0;
- the proprietary Flic iOS SDK, which is not redistributed and must be obtained separately;
- bundled music and artwork, which carry per-asset licenses in `music-library/`;
- trademarks, which are not licensed by the MIT License.

Imported show media remains the user's responsibility. Contributors must have the right to submit every asset and dependency they add.
