# Stage 07 PRD: collaboration, audience, and sharing

**Status:** Later-stage plan; local core remains account-free

## Objective

Add authenticated LAN technician control, QR audience interactions and polls, branded audience displays, peer transfer, and bring-your-own/self-hosted synchronization without making accounts, internet, or a hosted vendor service necessary for core playback.

## Dependencies

V1 portability/privacy and stages 01/03 local pairing/session security are stable; stage 04 external displays are proven for audience output; stage 05 operator roles/handoff exist where used; stage 08 open-core and content governance are approved; local-network permissions, QR threat model, self-host protocols, and data-retention policy are complete.

## Free/paid classification

LAN technician control, peer transfer, QR/polls on a performer-operated local session, and documented bring-your-own/self-hosted sync are free. No account is required. A future optional hosted convenience service is outside this PRD unless it can be funded without subscription and without becoming a dependency; any such service requires a separate owner decision and shutdown/export plan.

## Non-goals

- Public social network, permanent audience profiles, lead capture/marketing enrichment, anonymous public-internet control, cloud-required playback, DRM marketplace, ticketing, payments, or behavioral advertising.
- Letting audience devices fire arbitrary cues, access show methods/private notes/media, or control panic.
- Conflict-free real-time editing of an armed snapshot or silent last-write-wins merges.

## UX

A Session flow chooses capabilities and roles, displays a rotating/expiring QR and short code, previews exactly what operator/audience sees, chooses local-only or configured self-host transport, sets capacity/expiry/moderation, and performs a connectivity check. Technician surfaces clearly distinguish observe, request, and operate; every remote action has receipt and local revocation.

Audience templates support anonymous poll/word/number choice within bounded creator-defined options, branded display, moderation/close, and clear local privacy/retention notice. Audience submits from an accessible mobile web page; public display shows aggregated/moderated output, never device IDs or raw unreviewed text by default. A QR can always be hidden/invalidated immediately.

Peer transfer compares show revision/media hashes, available space, schema/capabilities, and conflict choice before encrypted staged copy. Sync is explicit by workspace, endpoint, and direction; conflicts show a structured comparison and create revisions rather than overwriting. Armed Run consumes its snapshot and never updates from collaboration until disarmed/recompiled.

## Interfaces and schema changes

Add authenticated `CollaborationSession`, peer role/permissions, ephemeral identity/key/sequence/expiry/revocation, `RemoteIntent` and local approval policy, audience `InteractionDefinition`, bounded `Submission`, aggregation/moderation state, branded display theme, and retention deadline. Audience commands are not controller commands; only a creator-defined, locally armed aggregate transition may generate a semantic intent through policy.

Add peer/sync protocol with content hashes, chunk manifests/checksums, resumable bounded transfer, revision DAG/parent, conflict records, capability negotiation, and adapter interfaces for LAN, user-configured WebDAV/S3-compatible/self-hosted endpoints as later selected. Credentials live in secure storage and never export in bundles. The canonical show schema remains local and portable.

## Offline and failure behavior

LAN sessions and peer transfer work on a local network/hotspot with no internet. Audience interaction can operate locally when audience devices can reach the host; internet/self-host loss closes submissions or freezes the last safe aggregate without affecting playback. Technician command loss/duplication/replay follows stage 03; local controls win. Reconnect never flushes stale commands/submissions into live state.

Sync runs only while disarmed/idle, stages and verifies data, and commits a new revision atomically. Failure leaves both copies usable. Unsupported/colliding revisions are preserved as branches requiring selection. Audience capacity/rate limits reject excess fairly; malformed/abusive content never reaches external display automatically. No promotion refresh or store dependency enters a live session.

## Manual fallback

Local touch/controller operation, panic, and Recovery remain authoritative. A technician can be disconnected/revoked instantly. Every audience moment has a performer manual result/skip/close path and can continue with no phones/network. Peer/sync failure falls back to `.showbundle` file transfer. Public display can blackout while audio continues.

## Accessibility and internationalization

Technician and audience web clients meet WCAG 2.2 AA targets, keyboard/screen-reader/reduced-motion/zoom/contrast, plain validation, accessible QR alternative short URL/code, and EN/HE RTL. Polls do not require color, speed, fine motor action, or animation; allow adequate response time. Branded display has accessible contrast/text sizing and reduced-motion mode. Mixed cue/brand/user text uses bidi isolation and moderation.

## Privacy and security

Default audience participation is anonymous and ephemeral; collect no contact, advertising identifier, precise location, or cross-session identity. Minimize IP/log retention and disclose unavoidable local-server data. Rotate/expire codes, use authenticated encrypted sessions where feasible, CSRF/origin protections, nonce/replay defense, role allowlists, rate/size limits, moderation, content sanitization, and no active HTML/URLs. Self-host credentials are secure-store only; users can inspect/delete/export all sync data and detach a host.

## Migrations

Add optional collaboration revision parent/conflict metadata, interaction definitions, local session settings, and self-host adapter configuration without credentials. Existing shows remain single-head local revisions. Audience submissions are separate ephemeral storage with automatic deletion and are never in normal bundles unless explicitly exporting anonymized aggregate results. Protocol versions negotiate; incompatible peers use `.showbundle`.

## Real-hardware tests

Test host minimum/current iOS/Android with iOS/Android/web audience browsers, 1/10/50/owner-set maximum clients, venue routers/hotspots/captive/no-internet, IPv4/IPv6, isolation/firewalls, reconnect/roam, packet loss/reorder, code guessing/replay, malicious payloads, moderation, display latency, lock/background, and long sessions. Test technician roles/revocation/panic priority. Test peer transfer with multi-GB bounded bundles, interruption/resume, low space, mixed schemas/platforms, conflicts, corrupt chunks, and encryption.

Test at least one documented self-host stack fresh install/upgrade/backup/restore/TLS/auth/outage if shipped, plus credential revocation and full export. Conduct accessible EN/HE audience pilots including screen reader/keyboard users and low-connectivity/no-device manual fallback.

## Rollout gates

1. Data-flow/threat/abuse/retention/self-host support ADR; no contact/behavioral data.
2. Protocol and adversarial tests prove role/replay/rate/content/conflict/atomicity boundaries.
3. LAN/peer functionality ships before any self-host adapter; exact network compatibility ledger.
4. Accessible moderated low-risk audience pilots with manual path and automatic deletion verified.
5. Self-host docs and shutdown/export procedure independently reproduced; no hosted dependency introduced.

## Definition of done

Done means local authenticated technician/audience/peer flows work without internet/account, roles and content are bounded/revocable, public output is moderated and private methods remain hidden, stale/network failures cannot trigger cues or block playback, sync is transactional/versioned/conflict-safe with full export, self-host setup is reproducible if offered, ephemeral data deletes as promised, EN/HE accessibility passes real users/devices, and every interaction retains a manual/no-network path.

