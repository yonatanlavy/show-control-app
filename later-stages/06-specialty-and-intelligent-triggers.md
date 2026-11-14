# Stage 06 PRD: specialty and intelligent triggers

**Status:** Later-stage plan; experimental inputs cannot be sole essential triggers

## Objective

Add NFC/RFID and prop triggers, then voice and camera recognition, with explicit arming, confidence/status, duplicate suppression, and a manual equivalent for every essential action so invisible interaction expands performance possibilities without hiding uncertainty.

## Dependencies

V1 controller/router/recovery and stage 03 adapter health/acknowledgement are stable; stage 01 diagnostics/drills exist; representative NFC/RFID readers/tags, props, microphones/cameras, lighting and noisy rooms are available; platform permissions/background limits and model licenses/privacy have been reviewed; native/local inference feasibility is measured.

## Free/paid classification

Manual equivalents, trigger disable/panic, arming/status, diagnostics, and recovery remain free. The specialty trigger pack may be a restorable one-time add-on because it requires specialist adapters/inference, but no subscription or cloud-per-trigger fee. Hardware is purchased separately. Owner approval of final packaging/price is required and never hardcoded.

## Non-goals

- Mind-reading claims, covert audience surveillance/recording, face/identity/emotion recognition, biometric profiles, cloud-required inference, autonomous show direction, or guaranteed recognition in every venue.
- Allowing an unarmed observation, low-confidence result, duplicate tag, common audience phrase, or ambiguous prop to fire an essential cue.
- Replacing manual panic/GO or choreographic testing with AI.

## UX

A Trigger Lab creates a source, calibrates in the actual space, binds a finite observation to one semantic command/cue, defines armed window/context, debounce/cooldown, minimum confidence (where applicable), confirmation mode, and manual twin. It visualizes `Off`, `Calibrating`, `Ready`, `Armed`, `Observed`, `Confirming`, `Triggered`, `Cooldown`, `Degraded`, and `Fault` without implying certainty.

NFC/RFID setup maps tag identity/read zone and rehearses duplicates/removal/re-entry. Prop setup uses explicit object/marker models and constrained stage regions. Voice uses uncommon performer-owned trigger phrases, language/model, push-to-arm/context window, and negative examples. Camera uses a visible framed region and lighting preview. Preflight requires an actual test from performing positions and verifies the manual twin.

Run shows only a compact trigger armed/health state; no live camera feed distracts unless deliberately opened in Recovery. A low-confidence observation does nothing or requests explicit confirmation per profile. The user can disarm all specialty triggers instantly without stopping audio.

## Interfaces and schema changes

Add `TriggerProfile` with source type/version, hardware/model capability, scoped observation descriptor, arming rule/window, context, threshold, confirmation policy, duplicate/cooldown policy, semantic command, manual binding, and privacy disclosure version. Add bounded `TriggerObservation` (source/session, monotonic time, confidence/category, duplicate key), `TriggerDecision`, health/calibration events, and model/firmware versions.

Adapters never dispatch directly. A deterministic decision gate checks current armed snapshot/context, source health, freshness, confidence, duplicate/cooldown, and command allowlist before submitting through the normal router. Essential cues require a manual twin at compile/preflight. Audio/video bytes are processed ephemerally by local native inference; canonical show stores descriptors, not recordings/templates of people.

## Offline and failure behavior

All live recognition is local/offline. Model or hardware unavailable, permission revoked, sensor occluded/noisy, thermal pressure, low confidence, duplicate read, or app background limitation changes state to Degraded/Fault and does not fire. No cached observation may fire after re-arm/reconnect. A source reconnects disarmed and requires a fresh health test.

Voice/camera are optional secondary inputs until long-term evidence supports more; an essential cue remains manual. RFID tag collision or continuous presence fires only under the explicit edge policy. Intelligent inference overload drops observations rather than audio work. Entitlement/model update failure leaves manual operation and existing locally verified module available.

## Manual fallback

Every trigger binding has an on-screen/controller manual twin visible in Recovery and validated by preflight. Global `DISARM TRIGGERS`, touch `GO`, panic, choose-cue, and stop remain. The performer can complete the show with sensors powered off. Written cue/prop maps describe recovery from accidental/missed detection.

## Accessibility and internationalization

Trigger state and confidence have text/icon/non-color cues and screen-reader announcements that are rate-limited. Calibration does not depend solely on hearing/vision; provide meters plus numeric/text feedback, captions/transcripts during explicit voice setup, and alternative manual setup. Voice models/phrases explicitly support claimed EN/HE varieties only after tests; RTL layouts and mixed technical/tag IDs are bidi-safe. Reduced motion and large text apply. Camera/prop framing includes accessible instructions and assistant-assisted setup.

## Privacy and security

Prominent, contextual mic/camera indicators; explicit permission; no covert recording; no face/biometric/emotion recognition; no upload; ephemeral buffers cleared; diagnostic exports contain category/confidence, not audio/images/transcripts/tag stable IDs. Validate model provenance/licenses/checksums and signed updates while idle only. RFID/NFC IDs are salted/local and redacted. Document audience/venue consent obligations without pretending app consent replaces law.

## Migrations

Add optional trigger profiles, model/capability versions, and privacy-disclosure acceptance. Imported profiles default disarmed and must rebind local hardware, recalibrate, and verify manual twins. Unknown model/adapter versions remain preserved but disabled. Threshold/default changes never silently alter existing profiles; require a migration review/rehearsal and new revision.

## Real-hardware tests

Test exact NFC/RFID readers/tags, read zones/orientation/materials, multiple/duplicate/continuous tags, props moving/drifting, batteries, venue RF, reconnect, and arbitrary routine order. Voice tests cover claimed EN/HE speakers/accents, performer distance/orientation, applause/music/audience dialogue, reverberant ballroom, mic types, rare/common/near phrases, false positives/negatives, background/lock constraints, and thermal load. Camera tests cover exact devices/lenses, stage/LED/flicker/backlight/low light, occlusion, costumes/props/backgrounds, camera loss, audience variation, and no identity inference.

Measure false-trigger and missed-trigger rates from preregistered scenarios; conduct adversarial negative tests and long idle/armed runs. Every physical pilot uses manual twin and incident logging; no essential finale relies solely on recognition.

## Rollout gates

1. Ethics/privacy/legal/model-license and threat reviews; identity/emotion/biometric features explicitly excluded.
2. Deterministic arming/decision/dedup/cooldown tests and architecture proof inference cannot starve audio/panic.
3. Hardware/language/venue benchmark meets published false/miss thresholds chosen before pilots.
4. Ship NFC/RFID/prop adapters separately before voice/camera if their evidence is stronger; all experimental/off by default.
5. Performer pilots demonstrate manual fallback after missed/false/sensor-loss cases; staged one-time entitlement remains isolated.

## Definition of done

Done means every advertised trigger has exact hardware/model/language/environment evidence, operates locally with visible arming/health/confidence and deterministic duplicate policy, cannot dispatch outside context, clears stale observations, preserves privacy, includes a tested manual twin and global disarm, cannot starve panic/audio, survives migration without silent behavior changes, and meets owner-approved error thresholds through real performances. Voice/camera remain labelled experimental until that evidence exists.

