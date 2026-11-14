# Stage 03 PRD: controller ecosystem and wearables

**Status:** Later-stage plan; v1 Flic 2 and generic controls are dependencies, not work deferred here

## Objective

Add Apple Watch and Wear OS, MIDI, OSC, a browser/crew remote, verified Audio Ape and MediaStar profiles, and true bidirectional acknowledgement where hardware supports it, while retaining simple semantics, local touch control, and exact capability language.

## Dependencies

V1 native Flic 2 and generic controller adapters, profiles, router, health, lock/background lifecycle, and exact-hardware test ledger are complete. Stage 01 local pairing/authentication patterns are available. Stage 02 MIDI/timebase types are coordinated where applicable. Vendor protocols/SDK licenses and test hardware are lawfully available.

## Free/paid classification

Free software capability. Users purchase third-party hardware separately. No controller, profile import, acknowledgement display, touch fallback, or recovery path is paywalled. A vendor-funded integration must be disclosed and cannot alter rankings/defaults without test evidence.

## Non-goals

- Claiming universal Bluetooth/HID/MIDI/OSC compatibility, reverse-engineering protected protocols, or promising manufacturer range/battery figures as app evidence.
- Public-internet remote control, automatic arbitrary controller mappings, complex multi-gesture safety defaults, or replacing local panic.
- Treating phone haptics/engine ACK as remote-side acknowledgement.

## UX

Controllers shows adapter families, exact connected model/firmware when observable, supported app states, battery where reliable, round-trip capability, last input/ACK, and test status. Setup captures one physical input and assigns a semantic command; recommended templates reserve distinct single actions for `GO` and panic. Conflicts, holds/repeats, unavailable background behavior, and destructive gestures are explained before save.

Watch apps present a minimal Armed face: connection/role, NOW/NEXT summary with privacy option, large `GO`, separated panic, and haptic/visual receipt semantics. Crew browser remote uses an explicit local pairing code, role (`observer`, `operator`), session expiry, and a fixed control layout. MIDI/OSC profiles show endpoint/message/channel mapping and an input monitor that is disabled or bounded while Armed.

Profiles for Audio Ape/MediaStar name the tested operating mode and physical control; they are not generic brand badges. UI labels acknowledgement as `App received`, `Engine accepted`, or `Remote confirmed` only when each layer truly exists.

## Interfaces and schema changes

Extend adapter capabilities: transport (`watch`, `midi`, `osc`, `lan`, `vendorUsb/Rf`), lifecycle states, battery, latency/quality sample, supported input phases, delivery level (`unconfirmed`, `adapterReceived`, `engineAck`, `remoteRoundTrip`), and command allowlist. Add versioned profile match predicates using vendor/product/protocol/firmware ranges without stable identifiers in exported profiles.

Add authenticated `RemoteSession`, role/permissions, ephemeral keys, nonce/sequence/expiry, command/ACK envelope, heartbeat, and revocation. MIDI/OSC parsers normalize bounded messages to `ControllerInput`; they never directly dispatch engine commands. Watch connectivity adapters and vendor integrations implement the same interface. Run snapshot references a resolved immutable profile/capability set.

## Offline and failure behavior

Wearables and browser remote work over local platform connectivity/LAN without internet/account. Loss/latency/duplicate/reordering changes health and preserves touch operation; it never queues a later burst of `GO`s. Stale commands expire. Reconnect does not trigger the last action. A controller profile that no longer matches blocks that binding, not Run itself when touch is available.

MIDI/OSC parsing is rate/size bounded; malformed floods are dropped and surfaced without starving panic. Browser server starts only for an explicit session, binds to intended local interfaces, ends automatically after Run/session, and never refreshes promotions or exposes shows. Vendor SDK failure is isolated to its adapter. Bidirectional-ack loss downgrades the displayed confidence; it does not fabricate confirmation.

## Manual fallback

Touch `GO`, panic, Recovery, and stop remain available. A user can disable any adapter instantly without unloading the show. Crew/watch/vendor controls cannot prevent local commands; local panic preempts and revokes pending remote work. Each setup teaches a show-without-controller drill.

## Accessibility and internationalization

Watch and browser controls meet their platforms' target, focus, contrast, screen-reader, reduced-motion, and large-text standards. Haptics are supplemental. Controller diagrams have textual input descriptions and are not blindly mirrored in RTL. MIDI/OSC technical labels are bidi-isolated; semantic commands and errors are localized in EN/HE. Crew remote locale may follow its device while shared cue names preserve author text direction.

## Privacy and security

Local remotes use authenticated pairing, short-lived keys, explicit roles, rate limits, nonce/sequence replay defense, TLS or platform-encrypted transport where feasible, idle/session expiry, and visible connected-peer count/revocation. Observer views reveal the minimum; cue/show names are optional. Never persist OSC/browser endpoints or stable controller IDs in exported diagnostics without consent. Validate vendor SDK data and pin no secret in the client.

## Migrations

V1 profiles migrate unchanged. New capability/version fields receive conservative defaults (`unconfirmed`, foreground-only, no battery). Imported profiles with unknown adapters remain visible but disabled. Watch/browser session keys are ephemeral/secure-store state, not showbundle content. Vendor templates version separately so an update never silently remaps a physical button; require review when mapping semantics change.

## Real-hardware tests

Test exact Apple Watch/iPhone and Wear OS/Android supported combinations, OS versions, app killed/background/locked states, wrist down, connectivity handoff, battery saver, range, disconnect/reconnect, haptics, accessibility, and rapid presses. Test named MIDI devices/interfaces, USB/BLE/network transports, channel/message floods, clock traffic, and adapter changes. Test OSC/browser across representative routers/hotspots, captive/no-internet networks, IPv4/IPv6, multiple peers, packet loss/reorder/replay, unauthorized attempts, and venue RF.

For Audio Ape and MediaStar, test purchased exact model/firmware/mode/accessories on both platforms claimed, raised controls, full range/positions, populated venue, battery depletion, receiver disconnect, standalone vs control mode, every template mapping, and whether true remote round-trip acknowledgement exists. Record vendor claims separately from measured results.

## Rollout gates

1. Protocol/permission/threat/licensing review per adapter family.
2. Parser/session/router tests prove bounds, expiry, replay defense, duplicate suppression, revocation, and panic priority.
3. Exact physical matrix and accessible UX pass; no family claim from one model.
4. Performer/crew pilots rehearse controller loss and touch takeover.
5. Enable adapters independently and publish a precise compatibility ledger with app/OS/hardware/firmware evidence.

## Definition of done

Done means each advertised adapter works in every claimed lifecycle state on the named matrix, mappings remain semantic/simple/versioned, remote sessions are authenticated/bounded/revocable, stale/duplicate inputs cannot cause extra cues, acknowledgement language matches actual protocol, touch/manual recovery always works, accessibility/i18n is complete, compatibility evidence is public and precise, and software control remains free.

