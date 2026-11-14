# Show Control UI refinement plan

Owner request, 13 October 2026: refine defaults and reliability; examine at least 20 edges and 10 combinations; inspect Dribbble references first; then substantially improve every interface through shared components and a design system, without unnecessary animation.

## Visually inspected references

Inspected the actual Dribbble shots in the browser before implementation:

- [Music Player App / Dark Teal — Muhammad Usama Qaisar](https://dribbble.com/shots/27042527-Music-Player-UI-UX): compact library rows, subtle surface layering, clear filter pills and a dominant player.
- [Music Player UI / Dark Mode Aesthetic — Budiarti R.](https://dribbble.com/shots/25787741-Music-Player-UI-Dark-Mode-Aesthetic): artwork-led lists, generous title hierarchy, selected navigation and restrained secondary controls.

Use their hierarchy and spacing as inspiration. Retain Show Control branding, actual user artwork and original native components. Static lighting/gradients in references do not authorize motion or decorative effects in Run.

## Direction and component system

Midnight Studio: deep ink backgrounds, distinct inset/raised surfaces, calmer borders, generous section spacing, rounded cards, compact cover/monogram tiles, strong headings and muted metadata. Dark Blue remains the default, with Purple Night and Cobra using the same hierarchy. Near-white GO and red Panic remain unmistakable and fixed in place. Every theme must retain readable text and semantic warning/error states.

Extend source-owned tokens and reusable components rather than styling each screen independently: screen headers, section cards, cover/monogram tiles, compact action rows, disclosure/overflow groups, selected segments, status banners, loading/empty/error states, typed fields, sliders, theme options, workflow steps and safety controls. Use consistent iconography from existing/source-owned capabilities; avoid a dependency solely for cosmetic effects. All input fonts follow the selected script; numbers/keys/waveforms stay LTR. Navigation exposes selected state to assistive technology.

No entrance animations, bouncing buttons, pulsing decoration, rotating artwork, fake equalizers or animated backgrounds. Immediate pressed/focus/selection feedback and real native progress are sufficient. Preparation may scroll; Run geometry and safety access stay stable.

## Screen-by-screen implementation

| Surface | Change and purpose |
| --- | --- |
| Onboarding | Clear language choice, short setup steps and one primary continue action; persistence avoids repeated interruption. |
| Library | Show-focused header, clear create action, compact show cards/counts, selected state and secondary management in disclosures; genuine loading/error/retry and first-show guidance. |
| Builder/playlists | Artwork/ordinal/name/tag/duration rows, a focused playlist chooser, accessible overflow actions and a dedicated song inspector with protected return navigation. |
| Song editor | Group sound/timing/media/voice controls, clear units/ranges, waveform and isolated audition; bound numeric entries, preserve unsaved intent and recover visibly from save failure. |
| Rehearsal | Clear rehearsal identity and selected song, coherent preview/seek controls and compact cue selector; never masquerade as a live show. |
| Preflight | Separate required/recommended checks, readable readiness summary, clear disabled reason; confirmations are revision-specific and arming is single-flight. |
| Run | Strong Now/Next hierarchy, correct selected ordinal, separate intent/title in GO where practical, meaningful status hierarchy; Pause cannot start Ready audio. Preserve GO/Panic geometry, guard/blackout/disarm accessibility and no decorative motion. |
| Recovery | Clear immediate safety controls, deliberate cue selection/start, explicit return/exit paths and optional diagnostics. |
| Controllers | Setup → assign → test/health groups, compact mappings and state-complete pairing buttons; portable/unbound and foreground-only limits are clear. |
| Voice | Download → calibrate → arm steps, coherent Rules/Transcript/Terminal segments, rule scope/target clarity and immediate disarm; downloaded readiness must survive native unloaded states. |
| Audience output | Simple enable/default-media state, actual connection feedback, privacy explanation and failure isolation; no early visual start. |
| Assistant/history | Focused prompt input, clear optional-provider status, selectable clarification choices, readable result/Restore history and cancel/progress. |
| Music | Guided purpose/style/details/lyrics fields, bounds before request, paid-account explanation and explicit generation/import stages. |
| Provider keys | Secure-store hydration/error before allowing Save/Delete, consistent secret fields and per-provider status; never replace an existing key with an unhydrated blank. |
| Settings/More/help | Grouped task-oriented rows, visual three-theme choices, ten-language options, backup/restore/help discoverability and concise expandable guidance. |

## Defaults

New song, refined on 14 October: full source range, −18 dB volume, speed 1×, zero pre-wait, smooth 800-ms fade-in and 1,800-ms fade-out; autoplay/loop/crossfade off; crossfade duration two seconds. Explicit role presets offer quieter speech beds or stronger entrances/finales. Existing saved tuning is preserved. New playlists use OMS behavior; existing legacy playlists keep their grammar. Dark Blue is the default. Voice and audience output start off and require deliberate setup; no relaunch resumes audio. Local controls do not require an account/key/network. Cloud requests remain optional and use secure user keys.

## Execution and verification

1. Complete reference/plan grounding and maintain [edge/combinations ledger](refinement-edge-cases.md).
2. Fix core state/storage hazards and their focused regressions in parallel with the shared component/token work.
3. Apply the component system to all surfaces, preserving existing functionality, translations and safety geometry.
4. Exercise the actual Android screens in loading/empty/filled/editing/Ready/playing/recovery states; inspect screenshots, RTL, themes and constrained layouts. Fix observed clipping, hierarchy and interaction failures.
5. Run type, lint, complete regression, architecture, translation, token and applicable native checks. Update evidence, then promote only authored changes to the original app with hash validation.

Absolute absence of bugs cannot be proven by a finite test suite. Physical Android/iOS, Xcode, Flic, microphone/voice corpus, HDMI, live BYOK and two-hour acceptance gates remain explicit in [the verification record](oms-verification.md).
