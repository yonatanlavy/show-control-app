# Stage 08 PRD: commercial ecosystem

**Status:** Governance plan; v1 already has bounded first-party promotions and `remove_promotions`

## Objective

Establish one-time add-ons, optional marketplace/content packs, contributor governance, signed promotion tooling, and explicit MIT/open-core boundaries that can fund maintenance without subscriptions, third-party ads, safety paywalls, account-dependent playback, misleading claims, or capture of community contributions.

## Dependencies

V1's bundled/signed first-party promotion manifest, exact placement allowlist, restorable `remove_promotions`, offline entitlement cache, storefront release process, privacy disclosure, MIT LICENSE/NOTICE, contribution/security processes, and architecture isolation tests are proven. Any add-on stage has met its own definition of done. Marketplace/content licensing, tax/store policy, signing-key operations, moderation, refunds/support, and shutdown/export plans are owner-approved.

## Free/paid classification

The app's core remains free and unlimited. `remove_promotions` and optional capability/content packs are restorable one-time non-consumables; no subscriptions, consumable safety actions, per-show/per-cue fees, behavioral ads, or hardcoded prices. Project source remains under MIT. Separate proprietary modules/content are allowed only across documented interfaces; changes to core files, safety, and fixes are published in the public repository as project policy.

## Non-goals

- Paywalling local audio, shows/sets/cues/Hits, background/lock playback, native Flic 2, manual controls, panic, preflight, backup/restore, recovery, safety diagnostics, accessibility, security fixes, or open bundle access.
- A subscription/SaaS dependency, third-party ad network, behavioral targeting, dynamic auction, dark pattern, crypto/token economy, DRM that traps user shows, or a first-party private fork that withholds community contributions or core fixes from the public repository.
- Launching a marketplace before licensing, moderation, takedown, tax/store, malware/content review, and continuity plans exist.

## UX

V1 promotion rules remain: at most one clearly labelled fixed-size first-party placement on Library, Builder, Rehearsal, Preflight, Controllers, and Settings; none on Armed/Run, Recovery, lock screen, or Android notification; no network refresh in Rehearsal/Preflight; no layout surprise. “Remove promotions” shows the localized storefront price, one-time/restorable terms, what changes, and Restore Purchases. Purchase failure never nags or blocks.

An optional Add-ons area lists owned/available capability modules with exact device/OS/hardware prerequisites, evidence level, one-time price, restore, offline behavior, and compatibility preview. Locked show content remains preserved/readable and offers safe free fallback; never disguise a paywall as data loss.

A future marketplace distinguishes official, community free, and third-party paid packs; shows creator/license/version/compatibility/checksum/size/accessibility/language/content warnings/update policy/support, previews safely, and stages import like any untrusted bundle. Contributors see governance, review, license, revenue terms if any, appeals, and export before submission.

## Interfaces and schema changes

Evolve signed `PromoManifest` with explicit schema/revision/key ID/signature, placement surface allowlist, first-party source, fixed dimensions, localized bounded copy/action, allowlisted HTTPS destination, date bounds, and safe bundled fallback. Signing is an offline/restricted release operation; clients contain public verification keys and support key rotation/revocation.

Define `ProductId`, storefront `ProductMetadata`, signed/cached `EntitlementSnapshot` with source/revision/verified/expiry semantics, `CapabilityId`, and an entitlement adapter outside playback. Prices/currency come from store metadata. Capability modules register via versioned ports; core can compile a compatibility report without loading paid code.

For content, define signed `PackManifest`, creator/publisher identity, license/SPDX or custom terms, assets/checksums, bundle schema/capabilities, locale/accessibility metadata, provenance/permissions, content warnings, dependency/version range, update/withdrawal, and review state. Packs contain declarative data/media only—no scripts/native code.

## Offline and failure behavior

Bundled promotions render offline; a signature-verified cache refreshes only idle/noncritical over HTTPS and swaps atomically. Invalid signature/schema/key/date/URL/revision fails to bundled/no promo. Verified `remove_promotions` and owned add-ons work offline from a durable local entitlement; normal store revalidation happens only outside live paths. Uncertain store state never interrupts an armed or previously prepared entitled show; it is reconciled later.

Store, manifest, signing service, marketplace, creator removal, or company shutdown cannot block free core or user export. Downloaded packs remain locally usable according to license; withdrawal stops new distribution and warns about security/legal reasons without secretly deleting shows. Failed purchases/downloads/imports roll back. No promotion/add-on/marketplace code or network work in Armed/Run/Recovery/system surfaces.

## Manual fallback

All safety/manual operation remains free. A show using a missing paid capability opens with a precise compatibility report, preserves metadata, and offers author-created free/audio-only/manual fallback or export; it never silently changes behavior. Users can restore purchases, enter documented support, export all shows/packs/license records, remove cached commercial data, and continue with the open-source core.

## Accessibility and internationalization

Promos, store/add-on/marketplace, terms, purchase/restore/errors, compatibility, licenses, creator metadata, and content warnings ship EN/HE/RTL with Dynamic Type, screen-reader, keyboard/switch, reduced-motion, contrast, and bidi-safe localized prices. Commercial elements are clearly labelled, never masquerade as system/show warnings, do not precede primary tasks in focus order, and avoid urgency/scarcity manipulation. Packs declare localization/accessibility coverage accurately.

## Privacy and security

No third-party ad SDK, tracking identifier, behavior/show/media targeting, or sale/share of data. Store receipts are minimized and verified using platform-recommended methods; never log receipt secrets. Manifests/packs are signed, schema/size/path/checksum/URL bounded, replay/downgrade protected, and imported in staging. Signing keys use least privilege, offline/HSM-backed release flow where practical, rotation, incident revocation, and dual review. Marketplace has identity, moderation, malware/content/license review, reporting/takedown/appeal, and transparent retention.

## License and contributor governance

The repository's source is MIT-licensed. MIT is permissive: distributors must preserve the copyright and permission notice, but the license does not require anyone, including the project, to publish modifications. The open-core boundary below is therefore a project commitment rather than a license obligation. Copyleft third-party components, such as the GPL-3.0 Android downloader adapter recorded in `NOTICE.md`, keep their own corresponding-source obligations for any build that includes them. Preserve all notices and document required source locations in distributed builds. This is project governance, not legal advice; obtain counsel for commercial launch.

Core domain/audio interfaces, safety, storage/bundle interoperability, accessibility/i18n primitives needed by core, and fixes remain in the public MIT repository. Proprietary optional modules live in separate files/packages/repos across public versioned interfaces, are never required for core, and carry their own notices/licenses. Contributors sign off that they have rights via Developer Certificate of Origin; no CLA assignment is assumed unless a future transparent decision changes it. Paid content creators retain stated rights and grant only documented distribution licenses.

## Migrations

V1 `remove_promotions` product ID remains stable. Entitlement schema migrations preserve ownership/offline cache and can rebuild from store restore; never revoke due to local migration failure. Manifest keys/schema support overlap during rotation, reject downgrade, and retain bundled fallback. Add-on capability/pack versions migrate independently from show schema; missing/unknown versions preserve opaque metadata and block unsafe execution, not export. Marketplace shutdown produces signed final catalog/receipts and user export instructions.

## Real-hardware tests

Use sandbox/TestFlight/internal tracks then production-like staged tests on minimum/current iOS/Android, new/returning/family-sharing or platform-equivalent accounts where applicable, offline purchase cache, restore after reinstall/device transfer, refund/revocation, store unavailable, locale/currency/tax, interrupted purchase, pending/ask-to-buy, app upgrade/downgrade, clock changes, and entitlement corruption. Confirm every eligible/ineligible surface, lock/background/system notification, large text/RTL, and no live network work.

Test signed manifest valid/invalid/wrong key/tampered/replayed/downgraded/expired/future schema, cache atomicity, offline fallback, key rotation/revocation, allowlist redirects, and compromised endpoint drills. Fuzz pack archives/manifests and reproduce license/source-notice delivery from installed binaries. Independently audit that paid-module/store imports cannot reach command router/audio/preflight safety/Recovery.

## Rollout gates

1. Owner approves pricing/package (not source-hardcoded), safety-free matrix, privacy/store/tax/refund/support, MIT/open-core boundary, DCO, and shutdown plan; legal review before marketplace.
2. Architecture/license automation proves file/dependency separation, notices/source availability, and live-path isolation.
3. Signing operations/key rotation/incident drills and adversarial manifest/pack tests pass.
4. Store entitlement/restore/offline/refund/localization matrix passes with no core regression.
5. Release one owned add-on before any marketplace; marketplace remains disabled until creator/content/takedown/payment/continuity operations pass pilot and counsel review.

## Definition of done

Done means the free unlimited safety/core matrix is enforceable and tested, every commercial item is optional/restorable one-time with storefront pricing and offline continuity, promotions obey the exact six-screen allowlist and never touch live/system surfaces, manifests/packs are signed/bounded/revocable without destructive deletion, MIT notices ship in distributed builds, core changes are public, corresponding source for bundled copyleft components is available, proprietary boundaries are file/interface-clean, contributor/content rights are documented, store/key/shutdown incidents have rehearsed recovery, accessibility/i18n is complete, and no commercial/network failure can block or alter core playback.
