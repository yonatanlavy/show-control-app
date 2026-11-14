# Stage 02 PRD: advanced audio and cue logic

**Status:** Later-stage plan; not implemented by this document

## Objective

Extend the proven audio core with ducking, nested and conditional groups, deterministic branching, wall-clock cues, rate/pitch/pan, multichannel routing, timecode, and richer fade design while preserving manual `GO`, predictable recovery, portable shows, and native timing.

## Dependencies

V1 native engine and stage 01 diagnostic/rehearsal evidence are stable; schema migration and bundles support feature capability declarations; supported audio interfaces/routes can be enumerated; the command/event clock model and voice ownership are documented; and a safety review defines which conditions are deterministic enough for live use.

## Free/paid classification

Core cue logic, ducking, richer fades, and standard stereo rate/pitch/pan remain free. Professional multichannel routing and external timecode may later be included in the stage 05 one-time Pro add-on, but opening, inspecting, exporting, flattening where safe, and manually running a compatible stereo fallback may not be paywalled. No subscription.

## Non-goals

- A general programming language, arbitrary scripts/eval, AI-authored live logic, DAW editor, mastering suite, plugin host, or unlimited graph complexity.
- Conditions based on unreliable cloud data or unarmed sensor recognition.
- Automatic conversion of an unsafe multichannel/timecode show into an allegedly equivalent stereo show.

## UX

Builder introduces an Advanced section progressively: ducking rules, group mode/children, named variables/conditions from a finite palette, branch destinations, wall-clock schedule with timezone/DST preview, rate/pitch/pan, route target, timecode source/offset, and a fade-curve editor with accessible numeric alternatives. A graph/outline preview identifies cycles, unreachable branches, overlapping schedules, route requirements, capacity, and whether `GO` or an automatic source advances each path.

Rehearsal can set deterministic mock variables/time, audition each branch, simulate timecode loss/jump, solo route previews, compare fade curves, and produce a branch-coverage checklist. Preflight lists the resolved route map, clock/timezone, timecode source, variable defaults, automatic triggers, and a manual fallback for each. Run shows only the active branch/next action and a compact automation-armed state; complexity never moves primary controls.

## Interfaces and schema changes

Bump cue/bundle schema with capability flags. Add bounded `DuckRule` (source selector, target selector, attack/hold/release, attenuation, precedence), nested `GroupCue` modes, finite `Condition` AST (typed variable comparison/boolean composition with depth/node limits), `BranchCue` with ordered cases and required default, `WallClockCue` with timezone/ambiguity policy, audio `rate`, `pitchSemitones`, `pan`, route ID, richer parametric/Bezier fade definition with normalized control points, `AudioRouteMap`, and `TimecodeConfig/Event`.

Compilation resolves the complete graph, rejects cycles/unsafe recursion/unbounded fan-out/conflicting duck rules/missing default branches/routes, calculates worst-case voices, and emits an immutable execution plan. Runtime variables are typed, locally sourced, explicitly initialized, and event logged by ID/value category. Native engine commands carry scheduled native timestamps/route/ramp parameters; JS does not step fades or timecode.

## Offline and failure behavior

Everything works offline except a future external source itself; no cloud condition is authorized. Unknown condition takes the declared safe default and is visible. Wall-clock calculations use a stored IANA timezone and show DST ambiguities before arming; system clock/timezone changes during Run enter a warning/paused automation state. Timecode loss, discontinuity, frame-rate mismatch, or route disappearance stops affected automatic advancement and requires explicit recovery. Unsupported routing blocks arming that production snapshot; it never silently folds down.

Ducking/fades are native, bounded, and panic-preemptible. A source or target ending early releases deterministically. Rate/pitch limits are device-tested and preflighted; engine overload refuses the new operation rather than degrading unpredictably.

## Manual fallback

Every branch has a default/manual chooser; every wall-clock/timecode transition has manual `GO`/start-any-cue; every duck rule can be bypassed; every route-dependent show can provide an author-created stereo fallback snapshot. Panic/stop targets all routes. Recovery shows current variable values, chosen branch, schedule/timecode state, and a manual next action without re-evaluating an uncertain condition automatically.

## Accessibility and internationalization

Graph editing has an equivalent ordered outline/form and accessible move/indent/outdent actions. Conditions read as localized complete sentences, with bidi-safe variable/cue names. Fade curves expose named shape plus numeric points; pan/routes never rely on a spatial graphic alone. Wall-clock/timecode uses locale-aware display while storing canonical values. EN/HE, RTL, large text, screen readers, reduced motion, and non-color warnings cover Builder/Rehearsal/Preflight/Recovery.

## Privacy and security

No executable expressions or imported scripts. Parse the finite condition schema with node/depth/value limits. External timecode/MIDI sources are untrusted input, bounded/rate-limited, and cannot invoke actions beyond the armed snapshot. Logs redact cue names and record branch/variable IDs. Route labels may expose connected hardware locally but are not uploaded.

## Migrations

V1 cues migrate without behavioral change: stereo default route, rate 1, pitch 0, center pan, existing fade curve mapped exactly, flat groups, no conditions/timecode. New bundles declare required capabilities. Older clients reject unsupported required behavior but may import a read-only metadata preview; no silent flattening. Downgrade/export may create an explicit user-reviewed simplified copy only when semantic equivalence can be proven.

## Real-hardware tests

Run the full v1 matrix plus nested groups/branches across thousands of generated plans, maximum voices/duck rules, overlapping fades, rapid branch changes, lock/background, interruptions, route loss, CPU/thermal pressure, system clock/timezone/DST changes, and long schedules. Test rate/pitch/pan quality and timing on minimum/current devices. Test every claimed multichannel interface, channel count/order, wired route, mixer, and fallback; every timecode frame rate/source/interface, dropout/jump/reconnect, and latency. Measure native scheduling and cross-route skew with external capture, not ears alone.

## Rollout gates

1. Schema/condition/timebase/routing ADR and bounded-complexity threat review.
2. Compiler/property tests prove termination, default branch, capacity, deterministic schedule, migration compatibility, and panic preemption.
3. Native timing/audio-quality lab passes on both platforms and exact advertised interfaces.
4. Advanced Rehearsal achieves branch/failure coverage; pilot shows include manual fallbacks and stage 01 diagnostics.
5. Enable capabilities separately; do not ship multichannel/timecode from generic stereo tests.

## Definition of done

Done means every new cue is bounded/versioned/portable, compiled execution is deterministic, native timing and routing pass measured hardware tests, automatic source failure stops safely, each automation has a rehearsed manual path, old shows remain identical, unsupported clients fail clearly, EN/HE accessible editing/recovery is complete, and panic/free local playback remain independent of the advanced module and entitlement.

