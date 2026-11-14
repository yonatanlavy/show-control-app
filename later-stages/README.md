# Later-stage product roadmap

These PRDs preserve ambitious expansion without turning v1 into an untestable feature list. They are ordered by dependency and risk. A stage may begin discovery earlier, but implementation cannot ship until its declared dependencies and rollout gates pass.

| Stage | Capability | Default commercial class |
| --- | --- | --- |
| [01](01-touring-reliability-and-redundancy.md) | Touring reliability and redundancy | Free safety capability |
| [02](02-advanced-audio-and-cue-logic.md) | Advanced audio and cue logic | Free core; professional output extensions reviewed under stage 08 |
| [03](03-controller-ecosystem-and-wearables.md) | Controller ecosystem and wearables | Free interoperability; hardware remains separately purchased |
| [04](04-multimedia-and-external-displays.md) | Multimedia and external displays | Optional one-time add-on candidate |
| [05](05-professional-venue-control.md) | Professional venue control | Optional one-time Pro add-on candidate |
| [06](06-specialty-and-intelligent-triggers.md) | Specialty and intelligent triggers | Manual safety free; optional one-time specialty add-on candidate |
| [07](07-collaboration-audience-and-sharing.md) | Collaboration, audience, and sharing | Local/LAN/BYO free; optional service may be paid once only if sustainable without core dependency |
| [08](08-commercial-ecosystem.md) | Commercial ecosystem | One-time add-ons/content; no subscriptions or safety paywalls |

## Rules common to every stage

- The v1 local audio engine, manual touch controls, panic, recovery, preflight, backups, and diagnostics required to understand failures remain free and work offline without an account.
- Optional modules consume a versioned `RunSnapshot`/event stream through narrow adapters; they do not mutate an armed snapshot or bypass the serialized command router.
- Every essential automated, remote, network, or sensor trigger retains a local manual equivalent. Local panic preempts every module.
- React and JavaScript timers do not become authoritative for audio, timecode, lighting, video, or trigger timing. Use platform/native engines or explicitly bounded best-effort UI behavior.
- A PRD is not an implementation. Interfaces, configuration, mock data, simulator results, and vendor documentation are not evidence of physical-device, exact-hardware, venue, or store readiness.
- Every module ships in English and Hebrew with RTL, Dynamic Type, reduced motion, screen-reader, keyboard/switch, and non-color-state coverage appropriate to its surfaces.
- Every new import/network/file/hardware boundary is untrusted, bounded, authenticated where relevant, and tested for failure. No private show/media data leaves the device implicitly.
- Prices are never hardcoded. Paid items are non-consumable one-time purchases unless a future owner-approved plan explicitly changes the business model; this roadmap authorizes no subscription.

## Stage promotion

A stage moves from discovery → experimental → beta → generally available only when its definition of done is met. Experimental capabilities are visibly labelled, off by default, and prohibited as the sole trigger/output for an essential cue. Roll back or disable a module without making existing shows unloadable; retain portable export and manual operation.

