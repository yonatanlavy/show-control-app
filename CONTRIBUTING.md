# Contributing

Thank you for helping build a dependable free show instrument. A feature-rich demo is not enough: contributions must preserve deterministic manual control, explicit recovery, offline operation, privacy, accessibility, and honest evidence.

## Before starting

1. Read `AGENTS.md` completely and follow its task-routing table.
2. Read `docs/v1-prd.md`, `docs/architecture.md`, and `docs/reliability-protocol.md` for behavioral changes; read `docs/design-system.md` for UI changes.
3. For a future capability, read its complete `later-stages/<stage>.md` and dependencies. A roadmap PRD does not authorize bypassing its rollout gates.
4. Search existing issues/changes and propose a narrow change. Discuss schema, native dependency, networking, permissions, paid boundaries, or a new package before investing in implementation.
5. Never use real customer shows/media, private controller identifiers, secrets, or proprietary app files in fixtures without documented permission.

## Design and engineering expectations

- Keep domain code dependency-free and use canonical types; do not create screen-specific copies of `Show`, `Cue`, commands, or engine events.
- Time-critical audio and lifecycle behavior belongs in native modules. React renders acknowledged state; JavaScript timers do not run fades/cue completion.
- Route all touch/controller intents through semantic commands and the serialized priority router. Panic/stop remain highest priority.
- Preserve manual touch fallback and explicit safe interruption/route/process recovery. Never surprise-resume audio.
- Store media locally through staging/hash/atomic commit. Treat pickers, archives, network packets, manifests, and hardware events as untrusted/bounded input.
- Keep core playback independent of account, network, promotions, purchases, analytics, and future modules. Safety stays free.
- Use semantic design tokens and source-owned native primitives. Complete all relevant component states and fixed Run geometry.
- Add every visible/assistive string to both English and Hebrew dictionaries. Test RTL, Dynamic Type, reduced motion, screen readers, keyboard/switch, phone/tablet, and both orientations where relevant.
- Do not add third-party advertising/behavior tracking or hardcode prices. V1 promotion placement and refresh rules are exact, not suggestions.
- Do not state that a configuration, mock, simulator, automated test, or vendor specification proves physical hardware/store/venue support.

## Dependencies and licenses

Before adding a dependency, document why existing platform/source code is insufficient, maintenance/security status, its license and any obligations it adds to the project's MIT-licensed source or distributed builds, native/platform/version support, offline behavior, privacy/permissions, binary/build impact, and how an adapter isolates it. Commit the `pnpm-lock.yaml` change when authorized. Do not introduce GPL/AGPL/proprietary SDK obligations without explicit project review.

Assets and demo media must be original, public domain, or under a redistribution-compatible license with provenance in `NOTICE.md`. Do not bundle commercial songs, trademark artwork, fonts, voices, images, or templates without rights. Vendor names such as Flic may be used accurately for compatibility, never to imply endorsement.

## Development workflow

Create a focused branch and retain unrelated work. Install from the committed lockfile:

```bash
corepack enable
corepack prepare pnpm@11.16.0 --activate
pnpm install --frozen-lockfile
```

Before requesting review, run:

```bash
pnpm run verify
```

Then perform the additional matrix required by `AGENTS.md` for the changed surface. Record device model, OS, build, exact controller/interface and firmware, output route, duration, and result for physical tests. If you could not run a required gate, say so; do not convert it to a pass.

Generated `ios/` or `android/` folders from Expo prebuild require explicit review. Do not overwrite native project changes or commit generated noise unrelated to the change. Never include signing certificates, provisioning files, store credentials, manifest private keys, receipts, real diagnostics, or `.env` secrets.

## Tests expected by change

- Domain/router: deterministic unit/property tests for references, graph, capacity, ordering, duplicate/repeat, stale events, and panic preemption.
- Storage/bundles: repository contracts, transaction/migration rollback, interrupted/low-space import, traversal/bomb/checksum/future-schema fixtures.
- UI/i18n: component states, navigation, fixed Run geometry, EN/HE parity and RTL, accessibility, reduced motion, target sizes, responsive orientation.
- Native audio/lifecycle: physical iOS/Android release/development builds, supported codecs/routes, calls/alarms/focus, lock/background, process death, cable removal before speaker fallback, long/loaded runs.
- Controller: exact named hardware/firmware and claimed app states, range/RF, rapid/held presses, reconnect, honest ACK level, and touch takeover.
- Commercial: exact surface allowlist, signed manifest/cache attacks/fallback, store purchase/restore/offline/refund, no hardcoded price, and architecture isolation.

## Change description checklist

Include: problem/outcome; user-visible behavior; interfaces/schema/migrations; offline/failure/manual fallback; accessibility/EN/HE/RTL; privacy/security/license; automated results; physical/hardware/store evidence; screenshots or recordings for UI (with no private data); rollout/rollback; and remaining unverified gates.

Reviewers should block unintended audio, unavailable panic, data loss, unsafe import/remote access, false reliability claims, free-core coupling, inaccessible/untranslated paths, and unlicensed content before polish concerns.

## Developer Certificate of Origin

Contributions use the [Developer Certificate of Origin 1.1](https://developercertificate.org/). Add a sign-off to every commit:

```text
Signed-off-by: Your Name <you@example.com>
```

By signing off, you certify that you wrote the contribution or have the right to submit it under the project's license and that the contribution and sign-off may be maintained publicly. Use `git commit -s`. Do not submit code/media generated from a source whose license or confidentiality terms prohibit redistribution.

## Community conduct

Be specific, respectful, and evidence-led. Protect performers and participants, do not expose performance methods unnecessarily, and do not use safety/reliability discussions as marketing claims. Maintainers may close changes that materially conflict with the mission, license, privacy, accessibility, or reliability contract.
