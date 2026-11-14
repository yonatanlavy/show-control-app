# Release and verification guide

## Release principle

The owner-approved [final Android close-out](android-final-closeout-2026-10-25.md) is a finite internal-test pass: Rehearsal clarity, one fixed non-AI checklist and at most two targeted fix rounds. It does not reopen the continuous goal or authorize more polish rounds. Final source checks pass 1,269 tests / 73 suites; installed and artifact receipts are recorded in that report. Customer release and historical ANR gates remain open.

A release is a chain of evidence, not a successful JavaScript build. The product controls live audio; native lifecycle, output routing, controllers, migrations/backups, accessibility, promotions/store isolation, and recovery need their own gates. Never promote an interface, permission, Expo configuration, simulator test, or vendor claim into “supported.”

## Evidence labels

Use exactly:

- **Contract/scaffold:** API/config/UI sample exists, with no runtime proof.
- **Automated verified:** named deterministic checks passed at a recorded commit.
- **Simulator/emulator verified:** behavior observed without physical hardware; native audio/controller claims remain open.
- **Physical-device verified:** recorded release/development build, device, OS, route, and scenario passed.
- **Named-hardware verified:** exact controller/interface/firmware and lifecycle/range scenario passed.
- **Performer-pilot verified:** repeated rehearsals and low-risk performances completed with backup and incident log.
- **Store released:** signed build approved and staged; not a universal device/hardware/venue guarantee.

Maintain an evidence record per release: version/build/commit, date/tester, source/toolchain/dependency lock hash, device/OS, native build type, media matrix, output/interface/DI/PA, controller/model/firmware/range/RF state, lifecycle scenario, result/log/issue, and exact claim allowed.

## Identities and prerequisites

`app.config.ts` currently uses provisional product name and identifiers (`publicNameIsProvisional`, `buildIdentityIsProvisional`). Before external signing/store work, the owner must approve final app name, reverse-domain IDs/scheme, icon/splash, store developer accounts, support/privacy/security URLs, category/age rating, export compliance, promotion destinations, `remove_promotions` product ID/territories, and localized metadata. Changing bundle/application IDs after store creation can strand entitlements; lock them deliberately.

Configured minimums are iOS 16.4 and Android API 24. They become supported only after the matrix passes. iOS builds require macOS/Xcode and valid signing; Android requires the approved JDK/SDK/NDK toolchain. Expo Go is unsupported for native module validation. Do not publish from an unreviewed generated prebuild tree.

## Branch and version policy

Use a protected main branch, reviewed signed-off changes, locked dependencies, and a release branch/tag tied to immutable source. Version user data and bundle schemas independently of app semantic version. Any incompatible schema requires migrations, recovery copy, old fixtures, future-schema rejection, rollback/read-only export, and release notes.

Initial Expo updates are disabled. Do not enable over-the-air updates until a separate safety ADR defines native/runtime compatibility, signature, staged cohort, no-update-while-armed/show window, rollback, and store policy. Native modules always require matched native builds.

## Continuous integration gate

`.github/workflows/ci.yml` installs the committed pnpm lock on Node 22.13 and runs `pnpm run verify`. This covers TypeScript, ESLint, Jest, architecture isolation, translation parity, and Expo Doctor as implemented. CI must fail on warnings/errors or lock drift. Dependency/security/license review is required in addition to automated output.

Linux CI does **not** compile the iOS Swift module, prove an Android native module exists, validate native audio timing/session/focus, Flic SDK/hardware, system media controls, output routes, store entitlements, EAS credentials, or accessibility on devices. Separate signed native workflows may be added only with protected secrets and the same evidence discipline.

The [24–25 October SDK alignment record](sdk-patch-alignment-2026-10-24.md) closes E-61's five-patch Doctor advisory: its exact internal Android candidate passes all software check components and Doctor 21/21, native release build/lint, installed artifact identity and the bounded protection/import/share matrix. Expo Modules Core 57.0.24 still requires the registered atomic-Promise backport; actual-source regressions and APK field inspection verify it. Use the pinned pnpm 11.16.0, frozen lock and disabled lifecycle scripts. This closes that advisory only; iOS, physical/OEM/hardware, two-hour runs, the historical renderer/focus ANR, pilot and production/store gates remain open.

The [25 October capacity/lifecycle candidate](current-build-lifecycle-2026-10-25.md) adds a shared native voice-count readout to Run/Hits and retains all 72 E-62 native/DEX/manifest/resource payloads. Its 1,063-case software suite, native release build/lint, exact artifact/source identity, 15 current-APK focus cases, bounded 600-second native main/foreground retention, full-capacity refusal, panic, large-text/landscape and silent exit/relaunch are recorded separately. Eight-voice endpoint observations and a ten-minute emulator check do not establish continuous eight-voice acoustic output or the two-hour/physical/customer gates. The historical focus ANR remains unresolved.

The [25 October store-result candidate](entitlement-reliability-2026-10-25.md) fixes shared cache/refresh ordering, uncertainty, cancellation and Retry feedback, with 1,092 tests, 29 added cases and all ten-language copy checks. Its signed refined APK retains E-63's 72 native/resource payloads and verifies actual unavailable-store Retry/loading, silent 1,200-cue preparation and exit. It does not establish completed purchases or fix native store callback lifetimes. Native main-queue checkout admission, concurrency/teardown, SDK background transport/privacy, configured store accounts, iOS builds and physical transaction/refund/transfer gates remain required before customer release.

## Release gates

The [25 October closure-protection candidate](closing-protection-2026-10-25.md) adds preparation-only foreground-loss guidance, bounded Android exit reason/time and a ten-language pre-show checklist. Its 1,127-case suite, native release build/lint, exact signed/installed APK, locked notification and silent force-stop/relaunch checks are recorded separately. A quiet ongoing notice and optimization exemption cannot prevent user/OS termination. Existing physical/OEM/iOS, historical ANR, two-hour, privacy/store and customer gates remain open; incomplete native-store edits are excluded from this candidate.

The subsequent [native store-lifecycle candidate](native-store-lifecycle-2026-10-25.md) includes E-65 protection and completes the native request/admission and save-before-confirm source changes. It passes 1,147 shared tests, actual-module synthetic SDK/runtime cases, Android release build and strict audio/commerce lint. Installed no-op admission rejects store work during silent preparation without creating a Billing client and succeeds after deliberate exit. These checks do not establish paid transactions, SDK privacy, iOS compilation, physical reliability or customer readiness; those gates remain open.

The [retained critical-UI candidate](critical-ui-lifecycle-2026-10-25.md) reproduces and fixes four mounted-surface lifetime failures, with 14 added cases and 1,161 full tests/72 suites. Its exact signed/installed APK retains E-66's 72 native payloads, unchanged live safety bounds, silent preparation and clean Exit/Settings return. The focused changed suite has no console errors; the full suite still has pre-existing act warnings elsewhere. This evidence does not close physical/iOS/store/privacy, historical ANR, two-hour or customer rollout gates.

The [focused protection candidate](focused-protection-2026-10-25.md) fixes six reproduced hidden/critical advisory-read failures, retains real/windowed system-settings return, and passes 1,175 tests/72 suites with Android release/audio-commerce lint. Its exact installed APK keeps E-67's 72 native payloads, passes 15 process-continuous focus-return cases without a new ANR, retains real battery-page warnings after unchanged settings, and silently prepares/exits with unchanged safety bounds. Non-reproduction does not close the historical renderer/ART ANR; all physical/iOS/store/privacy/long-run/customer gates remain required.

The [Recovery workspace candidate](recovery-workspace-2026-10-25.md) additionally windows large cue collections, preserves search through native selection, rejects stale controls and keeps Recovery safety controls above its keyboard. Its stable compact search remains outside the windowed list, prevents Android full-screen IME extraction and submits without transport. It passes 1,210 tests/73 suites and full software checks; exact native build, installed evidence and APK identity live in the linked record. Packaged-source checks preserve Run code, safety styles and E-68 native payloads. Intermediate keyboard/search findings and the incomplete QA observer are retained and superseded. These changes do not close the historical ANR, physical/OEM/iOS, store/privacy/licensing, long-run or customer rollout gates.

### 1. Scope and truth gate

The [keyboard text-safety candidate](keyboard-text-safety-2026-10-25.md) closes a reproduced Android callback typing collision and adds matching iOS guard source, with ten-language guidance. It passes 1,249 shared tests/73 suites, native policy/callback fixtures and Android release/audio-controller-commerce lint. Exact installed synthetic focus/admission, native media Resume/Pause, panic, stable controls and clean Exit are recorded separately. iOS compilation, real HID/Full Keyboard Access, historical ANR, physical/long-run and customer gates remain open.

The [keyboard capture-lifecycle candidate](controller-capture-lifecycle-2026-10-25.md) additionally prevents an older queued stop/background cleanup from removing a restarted capture. The same native main-queue helper reproduces both failures on E-71 and passes on the exact new installed APK; typing/safety admission, 93-second locked foreground notification, native GO/Pause/Resume, touch Fade and silent Android Stop/relaunch are recorded. It passes 1,249 tests/73 suites, 80 native lifetime scenarios/1,640 reattachments and strict Android audio/controller/commerce lint/build. UI bundle, 66 library/manifest/resource payloads, closure safeguards and fixed controls are unchanged. Mirrored iOS source is uncompiled; physical/OEM/HID/Flic, historical ANR, long-run and customer gates remain open.

The [current memory-advisory candidate](memory-protection-2026-10-25.md) retains prepared-show foreground protection and battery/notification repairs, adds Android's public current low-memory warning, and passes 1,239 tests/73 suites, shared checks and Android release/audio-commerce lint. Its exact installed APK passes 384 packaged policy combinations, observes the real memory flag, preserves quiet locked Ready for 65.381 seconds and relaunches silently after Android Stop. Source/manifest/native-library and fixed-control checks are recorded separately. Actual memory-pressure survival, physical/OEM/iOS, historical ANR, two-hour and customer/store gates remain open.

- V1 PRD acceptance list maps to implementation/tests; non-goals are absent or explicitly experimental.
- README/store/support copy distinguishes configured, tested, named-hardware, pilot, and store evidence.
- No claim of universal Bluetooth/Flic/codec/device/venue reliability, no fabricated review/metric, and no stale competitor claim.
- Native iOS and Android engine, SQLite/media/bundle, native Flic 2, background/lock/system controls, promotions/entitlement are actual implementations—not sample/provider-only.

### 2. Source and automated gate

From a clean checkout:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run verify
```

Review dependency/license/security advisories, generated token parity, bundle corpus, migration fixtures, signed manifest attacks/cache fallback, product/entitlement tests, and forbidden dependency imports. Build native projects deterministically from the reviewed config/plugins and inspect generated permission/capability changes.

### 3. Native/device gate

Run signed release-like builds on at least one minimum/low-mid and one current phone/tablet per platform. Cover every advertised codec/sample-rate/channel, local import, eight voices, fades/loops/trims/Hits, 2+ hour/repeated full shows, rapid/held input, low storage/battery/thermal pressure, airplane mode, foreground/background/lock/unlock, iOS remote commands, Android MediaSessionService/notification, calls/Siri/assistant/alarms/focus loss into Interrupted, process kill/relaunch silent, and cable/route removal muted before speaker fallback.

Test internal speaker only for recovery observation, representative analog/USB adapters, headphones, audio interface, DI, mixer/PA, route changes, mono summing, and loudness externally. Capture timing/output where ears cannot prove it.

### 4. Controller gate

Native Flic 2 is a v1 release blocker: confirm lawful SDK/licensing access and test exact button/firmware/SDK/OS/device across foreground/background/locked, range/performing positions, populated RF, battery loss/replacement, rapid/single/double/hold/repeat, disconnect/reconnect, last-event flush, visual/haptic/engine/remote acknowledgement level, and touch takeover. Generic HID/media/page-turner claims get their own exact model ledger. Never infer MediaStar/Audio Ape support.

### 5. Data, migration, backup, and security gate

Test clean/upgrade/corrupt/disk-full/interrupted SQLite migrations with rollback/read-only export; staged media import and orphan cleanup; `.showbundle` round-trip/transfer plus traversal, separators, absolute/UNC, symlink, duplicate/case collision, count/size/compression bomb, checksum/unknown-schema/malformed fixtures; low-space atomic failure; and restore on a second device. Complete threat/privacy review and address `SECURITY.md` priority cases.

### 6. UX, accessibility, and localization gate

Audit all routes and states on small phone/tablet, portrait/landscape, English/Hebrew/RTL, largest supported Dynamic Type, screen readers, keyboard/switch, reduced motion, contrast, 48 dp targets, focus, Touch Guard/Stage Blackout exits, panic under overlays/errors, and fixed Run geometry. Test system lock/notification controls on real devices. Promotions obey exact six-screen allowlist/fixed geometry/label/focus and never appear/fetch on live/system surfaces.

### 7. Store and commercial gate

Approve final privacy policy/store data-safety labels/permissions (audio files, Bluetooth, local network if any, notification/media service, crash reporting consent), accessibility declarations, export compliance, content/age rating, support/security/source/notice links, and screenshots that reflect real functionality.

Create `remove_promotions` as the stable restorable one-time non-consumable. Price comes from localized storefront metadata and remains an owner/store decision. Test sandbox/internal then release-like purchase, pending/cancel/failure, restore, reinstall/device transfer, family/store behaviors where applicable, refund/revocation, offline cache, store outage, currency/RTL/large text, signed manifest validation/key rotation, bundled fallback, and live-path isolation. No hardcoded price or subscription.

### 8. Performer-pilot gate

Freeze a candidate build. Complete repeated whole-show rehearsals, exact venue/RF/output tests, and low-risk performances with a second device/emergency playlist, spare control/cables/adapters/power, written cue sheet, and drills for panic, replay/skip/previous, arbitrary finale, controller loss, route loss, interruption, restart, and no-audio continuation. Record/redact incidents and block release on unintended audio, panic failure, wrong cue, data loss/restore failure, speaker fallback, multi-GO, inaccessible recovery, or commercial/network coupling.

### 9. Staged store rollout

Submit signed artifacts built from the tagged source/lock/config; archive symbols/mappings, checksums, store metadata, third-party notices, corresponding source location for bundled copyleft components (such as the GPL-3.0 Android downloader adapter recorded in `NOTICE.md`), test ledger, and rollback build. Start with internal/TestFlight tracks, then small production cohort. Updates are never forced during show use. Pause/rollback on any release-blocking incident and rerun affected gates after the fix.

## Release checklist artifact

Each release record must include:

- owner-approved version/build/tag/commit and final app/store/product IDs;
- clean CI and native artifact hashes/toolchain/lock/config;
- schemas/migrations/bundle compatibility/rollback and backup restore proof;
- device/codec/lifecycle/output and Flic/generic controller ledgers;
- accessibility EN/HE/RTL report;
- privacy/security/dependency/license/NOTICE/copyleft-source review;
- promotion manifest key/revision/fallback and store purchase/restore/offline evidence;
- performer pilot/incident disposition;
- known limitations phrased at their evidence level;
- staged rollout owner, stop criteria, rollback build, and support/security channel.

## Current blocking truth

At the time this guide was written, no completed record proving all gates was present. The Android audio, controller, and commerce sources pass their targeted debug compilation/lint checks, but that is not production-device evidence. The iOS native module source and configuration remain compile-unverified on this Windows host. Native Flic hardware behavior, measured preload/onset budgets, store products/approval, signed remote manifest infrastructure, performer pilots, and exact physical hardware tests remain unverified. Keep this paragraph current as evidence changes—never delete it merely to make a release look ready.
