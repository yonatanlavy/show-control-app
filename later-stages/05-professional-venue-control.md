# Stage 05 PRD: professional venue control

**Status:** Later-stage plan; optional one-time Pro add-on candidate

## Objective

Add DMX, Art-Net, sACN, NDI, professional output routing, operator handoff, production cue sheets, and bounded QLab/Go Button/CSV import so the same show can integrate with a competent venue without turning the mobile app into an unsafe universal console.

## Dependencies

V1 and stages 01–04 are stable as applicable; stage 02 routing/timecode and stage 03 authenticated crew remote exist; official/licensed source-format documentation is available for each importer; representative lighting nodes, networks, NDI endpoints, audio interfaces, consoles, Macs/apps, and venue technicians are available; stage 08 isolates/restores the Pro entitlement.

## Free/paid classification

Candidate restorable one-time Pro add-on. Free users retain complete local audio, safety, import/export of the open native bundle, and readable compatibility reports. Any globally required blackout/panic/manual override while Pro output is active is free. No subscription; third-party licenses/hardware remain external.

## Non-goals

- Replacing a certified lighting console, electrical/safety interlocks, pyrotechnic/rigging control, arbitrary scripts, unrestricted network discovery, cloud venue control, or claiming complete QLab/Go Button compatibility.
- Importing DRM media, vendor secrets, plugins, scripts, or unsupported cues as silently equivalent.
- Making the performer responsible for systems that require a venue technician and risk assessment.

## UX

A Production workspace defines named outputs, universes/channels, fixtures/looks at a bounded abstraction, NDI send/receive targets, audio channel maps, and operator roles. Setup separates `Design` from `Live`; destructive output is disabled until a venue-specific patch is reviewed, tested, and armed. Network scan is explicit and results are selected, never auto-controlled.

Import starts with source/version selection and a dry-run report: imported exactly, adapted, unsupported/preserved, missing media, conflicts, and required stage capabilities. It creates a new show and never overwrites. Operator handoff produces a signed/read-only package, cue sheet, patch/output map, fallback instructions, checksums, app/build requirements, and rehearsal status. A venue/operator mode exposes the cue stack and acknowledgement without private performer settings/promotions.

Preflight includes interface/channel/universe/receiver reachability, address conflicts, network policy, timebase, blackout state, and manual venue fallback; unobservable fixture wiring/focus/power is assigned to the operator checklist. Run shows compact production health while local audio controls and panic remain fixed.

## Interfaces and schema changes

Add versioned `ProductionPatch`, `OutputEndpoint`, `AudioBus/ChannelMap`, `LightingLook/Cue` with bounded values/fades, Art-Net/sACN universe/address targets, `NdiEndpoint/Cue`, operator role/ack/handoff manifest, and source import provenance/mapping report. Network outputs implement ports with rate limits, health, sequence, safe-state, and shutdown.

Importers are pure adapters into an intermediate source model, then explicit conversion to canonical cues. Store source format/version, hashes, importer version, warnings, and preserved unsupported metadata; never run source scripts. Cue-sheet generation consumes immutable snapshot/patch projections. Production commands still pass authorization/arming and native scheduler; local panic broadcasts bounded safe-state commands but does not claim fixture response without ACK.

## Offline and failure behavior

Live control uses a dedicated/local venue network and works without internet/account. Network loss or high latency stops affected automatic output and enters the configured safe-state/manual-operator mode while local audio continues. Never flood reconnect packets or replay stale cues. NDI failure blacks/stills that output, not the audio engine. Unknown fixture/endpoint state is displayed as unknown.

Import failure is transactional and leaves source/library unchanged. Unsupported cues remain listed/preserved, not silently dropped. Entitlement/store failure cannot interrupt an already validated entitled local show; cached verified entitlement works offline. A missing Pro entitlement never corrupts Pro metadata.

## Manual fallback

Every production has a venue cue sheet and named human/operator fallback, local lighting/video blackout/stop where safe, audio-only mode, and a procedure to hand control to the house console. Local panic preempts app-originated outputs but does not replace building/venue emergency systems. An imported show can be stepped manually through supported audio even if automated venue outputs are disabled.

## Accessibility and internationalization

Production editor, patch tables, import reports, operator mode, and cue sheets ship EN/HE with logical RTL while universe/channel/timecode and protocol addresses remain bidi-isolated. Tables have screen-reader headers, keyboard navigation, accessible reorder, non-color health, scalable print/PDF, and high-contrast operator views. Reduced motion does not alter transition timing sent to equipment.

## Privacy and security

Bind only to explicitly selected interfaces; default deny incoming control; authenticated role-based crew sessions; rate limits; replay protection; session expiry; network status banner; no public-internet exposure or UPnP port opening. Treat NDI/network frames and import files as untrusted/size-bounded. Do not include private notes/media in handoff unless selected. Audit licenses/trademarks and use accurate compatibility wording; no affiliation implication.

## Migrations

Add optional production patch/output/import provenance schema and bundle capability declarations. Endpoint IDs are local and require remapping after transfer; never serialize volatile IPs as blindly active. Older clients preserve unknown Pro data and offer audio-only/read-only behavior. Importer upgrades do not mutate existing converted shows automatically; reimport creates a comparison/new revision.

## Real-hardware tests

Test exact DMX USB/Art-Net/sACN nodes, consoles, fixtures/universes, managed/unmanaged switches, Wi-Fi/wired adapters, multicast/unicast, address conflicts, packet loss/reorder/storm, network unplug/reconnect, multiple senders/merging, safe blackout, and two-hour shows. Test NDI versions/endpoints, decode/encode load, latency, dropout, and A/V sync. Test every audio interface/channel map and cable route.

Create official-source fixtures for supported QLab/Go Button/CSV versions and representative unsupported/malformed/huge/malicious files; compare every converted cue/property/media hash. Conduct venue handoff with technicians unfamiliar with the app, in EN/HE where relevant, and verify they can operate/fallback from the package alone.

## Rollout gates

1. Safety boundary excludes hazardous systems; protocol/network/import licensing and threat ADRs approved.
2. Golden import corpus and dry-run report reach documented fidelity; no unsupported silent loss.
3. Exact wired/network/output hardware lab passes with packet/fault instrumentation.
4. Venue technician rehearsals and low-risk productions pass with human fallback and stage 01 logs.
5. Staged Pro entitlement/restore/offline/rollback and module isolation pass; compatibility ledger published by exact version.

## Definition of done

Done means each advertised protocol/source version has exact evidence, production output is explicitly patched/armed/bounded and fails to a safe/manual state without harming audio/panic, imports are transactional with full fidelity reports/provenance, operator handoff works without hidden knowledge, EN/HE accessibility is complete, private data is opt-in, old/free clients preserve metadata, and Pro remains a restorable one-time isolated add-on.

