# Stage 04 PRD: multimedia and external displays

**Status:** Later-stage plan; optional one-time add-on candidate

## Objective

Add video, images, slides, PDFs, branded overlays, output blackout, live camera, and wired/wireless external-display routing so a solo performer can run coherent visual production while the proven audio engine and manual recovery remain independent.

## Dependencies

V1 and stage 01 are released; stage 02 group/timing/routing contracts are stable; native video/rendering feasibility and content-format/licensing reviews exist for both platforms; exact HDMI/USB-C/AirPlay-equivalent/casting hardware is available; and stage 08 entitlement isolation can unlock the module without touching free audio.

## Free/paid classification

Candidate restorable one-time multimedia add-on; final product/price is owner-approved and storefront-derived. Free users can keep running all audio and safely open/export shows containing locked visual metadata without losing it. Visual blackout, stop, and manual recovery are never disabled during an entitled run. No subscription.

## Non-goals

- Full video editor, slide-authoring suite, PDF editor, streaming platform, wireless-display reliability guarantee, DRM playback, generative media, audience interaction, lighting control, NDI, or arbitrary web content.
- Rendering active PDF forms/scripts/links or remote URLs in a live cue.
- Combining audio and visuals so tightly that visual failure stops free audio or panic.

## UX

Builder adds typed visual cues/layers with local asset preview, crop/fit/background, transition, duration/end behavior, output target, and safe-area overlays. Slides/PDFs choose explicit pages; live camera chooses a verified source/latency mode. A Stage Canvas preview shows aspect ratio and overscan guides, while a separate operator preview remains dark and private.

Preflight detects output connection/mode/resolution/refresh where observable, missing/unsupported assets, HDCP/permission limitations, camera availability, estimated decode capacity, safe-area conflicts, and a fallback still/blackout. It names unobservable projector/switcher/cable/venue state. Run retains fixed audio controls and adds only compact output status/blackout; complex visual switching occurs through cues, Hits, or Recovery. External output never displays app chrome, promotions, notifications, private notes, or purchase UI.

## Interfaces and schema changes

Add `VisualAsset` metadata/checksum, `VideoCue`, `ImageCue`, `SlideDeckCue`/page sequence, `PdfCue` rendered to safe static pages, `OverlayCue`, `OutputBlackoutCue`, `CameraCue`, transitions, layer/z-order, fit/crop, output target, and capability declarations. Expand groups through stage 02 without altering audio cue semantics.

Define a native `VisualEngine` port parallel to `AudioEngine`, coordinated by a native monotonic scheduler but independently faultable: prepare snapshot, dispatch visual command, output/camera events, fault/blackout/shutdown. Asset import pre-renders thumbnails/PDF pages and validates codecs/dimensions/duration. `RunSnapshot` contains a resolved visual plan only when the entitlement/capability exists; core audio compilation remains valid separately.

## Offline and failure behavior

All live visual media is app-owned/local. Wireless routing may use a local protocol but never internet/cloud. Output disconnect, resolution change, decoder/camera fault, thermal overload, entitlement-store outage, or app background transitions visual output to the configured safe blackout/still while audio continues. It never falls back to showing the private device screen. Reconnection requires explicit preview/route confirmation before returning live.

PDFs are imported/rendered statically with page/count/size limits; active content and external references are ignored/rejected. Capacity refusal is explicit and deterministic; never drop an arbitrary top layer. Visual commands do not block the audio router's panic. Promotion/network code is absent from external output and live path.

## Manual fallback

A globally accessible local output blackout/stop remains available by touch and assignable controller. Every essential visual cue can define a fallback still/blackout and can be skipped while audio continues. Recovery can start any visual state, restore branded backdrop, disconnect external output, and run audio-only. Venue staff can receive local media/cue sheet rather than control the app.

## Accessibility and internationalization

All visual cue/editor controls, output/camera errors, and Recovery ship EN/HE/RTL. Overlays support logical alignment, safe reading order, minimum contrast, text scaling within output profiles, caption/subtitle tracks where provided, and non-motion alternatives. Image/video/PDF assets require creator-entered descriptions for operator accessibility and optional audience alternate output; decorative assets are marked. Reduced motion substitutes cuts/static fades for transitions. External audience content direction is configured per cue, not blindly inherited.

## Privacy and security

Camera access is explicit, visible, and active only for an armed camera cue/preview; no recording unless a later approved feature. Never send camera/media to a server. Sanitize image/video/PDF parsers through bounded native libraries and reject malformed/oversized/decompression-bomb content. Hide private metadata from external displays. Wireless routes expose only deliberate output and require user-selected receivers.

## Migrations

Add optional visual asset/cue/output schema and bundle capability flags; v1 audio shows remain byte/behavior equivalent. Import paid-stage shows without entitlement as preserved locked metadata plus an audio-only compatibility report, never destructive stripping. Renderer/analyzer caches are derived/versioned. Downgrade/export includes original assets/metadata and warns that older apps cannot render them.

## Real-hardware tests

Test every advertised codec/container/resolution/frame rate/color/orientation/alpha/PDF feature on minimum/current phone/tablet, long shows, multiple layers, transitions, audio sync, thermal/low memory/storage, background/lock, calls, camera permission/revocation, front/rear/USB capture if claimed, and recovery. Test exact HDMI/USB-C adapters, displays/projectors/LED processors/switchers, aspect ratios, EDID changes, cable pull/reconnect, mirrored/extended modes, AirPlay/cast receivers and venue RF. Measure A/V drift and output latency with capture equipment.

## Rollout gates

1. Rendering/scheduler/output/privacy/licensing ADR and parser threat model.
2. Corpus/fuzz/capacity tests plus architecture proof that visual faults/entitlements cannot block audio/panic.
3. Wired hardware matrix passes before any wireless support claim; exact receiver ledger for wireless.
4. Accessible EN/HE output and reduced-motion alternatives audited.
5. Performer/venue pilots use explicit audio-only and blackout recovery; staged one-time entitlement/restore tested offline.

## Definition of done

Done means every named medium imports locally and renders through a bounded native engine, exact wired/wireless/camera matrices and measured A/V sync pass, external output never leaks private/promotional UI, any visual/output failure reaches safe blackout while audio/panic continue, manual/audio-only recovery is rehearsed, locked metadata round-trips without loss, accessibility/i18n is complete, and the one-time entitlement is isolated/restorable with no subscription.

