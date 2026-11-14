# Design system: Midnight stage instrument

The owner removed the bottom promotional panel on 26 October 2026. All application routes now use the complete screen without a promotional footer or placeholder; Settings has no purchase panel for removing it. Historical promotion-component guidance below applies only to retained dormant components. Run, Recovery and prepared Rehearsal safety geometry is unchanged.

## Approved parity design extension

[OMS parity](oms-parity.md) expands the historical single-theme/two-language baseline below. Dark Blue, Purple Night and Cobra are persistent semantic-token palettes with the same safety hierarchy. English, Hebrew, Spanish, French, German, Italian, Portuguese, Russian, Japanese and Arabic have complete dictionaries; Hebrew and Arabic use logical RTL. System font fallback covers scripts outside the bundled Latin/Hebrew fonts.

The editor adds source-time waveform trim/seek/scrub and isolated native audition, plus artwork, visual and voice-rule controls. Preparation routes include assistant, music, provider keys, voice, audience output, help and first-run language selection. The floating stopwatch is bounded to the readout and never covers GO/panic. Run retains a fixed safety motor map, including a 96-dp minimum compact GO, with portrait/landscape layouts. Token/key checks and component tests do not prove physical contrast, largest-text reachability or screen-reader quality; those remain recorded gates in [the checklist](oms-parity-checklist.md).

The owner-requested [Midnight Studio refinement](ui-refinement-plan.md) applies shared compact rows, cover tiles, grouped cards, disclosures, setup steps, localized feedback and recovery to every screen. Unavailable optional promotion slots collapse after local hydration rather than leaving permanent empty space; known placements retain their fixed size and live routes remain independent of them.

Stage controls keep the same physical position in every language. Fixed actions use the tokenized 1.3× text cap; the large GO word uses 1× and its cue name 1.2×, with fitted text and complete assistive labels. Reading regions continue to scale. Fitted Android text uses natural font metrics rather than a fixed line-height span. Landscape panes use explicit equal widths inside the safe area; shorter layouts retain a single footer row, taller layouts use two rows. Recovery's Stop/Panic footer does not scroll. Hiding the stopwatch preserves its clock within Run.

Non-live operation failures use a persistent notice in a reserved layout lane above the complete footer, action bar and navigation. Explanation, diagnostics and actions share one bounded scroll region; failures take priority over success and never auto-expire. The page shrinks before the notice, preserving full-size actions. Critical sessions suppress this notice, keeping Run and Recovery safety controls unobstructed. [Installed layout evidence](feedback-layout-2026-10-24.md) includes the formerly overlapping Preflight Arm action and large-text landscape recovery controls.

[The 17 October usability refinement](usability-2026-10-17.md) gives preparation tasks focused sections, searchable shows/songs/Hits/help, persistent draft state and explicit next actions. Preflight Arm and silent rehearsal Prepare sit outside the scrolling content. Remote silent testing is a primary early action; connection, button assignment and testing guidance have distinct views. Settings keeps a completed backup available across its sections. Recovery selection follows native state and stays silent until Start, with armed trigger disarm visible. Child preparation pages expose Back. These patterns use the same semantic tokens and ten-language dictionaries; Run adds contextual instruction only within its existing fixed readout/control geometry.

## Intent

Show Control should feel like a premium instrument: calm, tactile, legible at a glance, and emotionally quiet during failure. “Shadcn-like” means source-owned, composable primitives with semantic variants and complete states—not importing web shadcn components into React Native.

The visual system is **Hallmark · atmospheric · Workbench · Midnight**. It is forced dark so the interface does not flood a stage or change motor/visual expectations. The Run screen is operational, never promotional.

## Source of truth

DTCG tokens live in `src/design/tokens.json`; generated React Native access lives in `src/design/tokens.native.ts`. Change source tokens and run `npm run generate:tokens`; never hand-edit generated values. Screen code uses semantic tokens, not raw hex values or feature-local spacing/radius/font numbers.

The system provides canvas/surface/border/text roles; restrained accent plus success/warning/danger; near-white `go` with dark ink; 4/8/12/16/24/32/48 spacing; 48 dp base controls, 56 dp large controls, 104 dp `GO`; 6/10/16 radii; Geist/Heebo/Geist Mono type roles; and only instant/100/150 ms motion. Color never carries meaning alone. Verify contrast with actual rendering; token names are not evidence.

## Typography

- Latin UI uses Geist; Hebrew uses Heebo; timings and technical IDs use Geist Mono.
- System fallback during font failure must not hide safety controls or shift Run geometry.
- Support Dynamic Type. Critical actions remain reachable at the largest supported sizes; labels may wrap in Builder/Settings and use tested bounded forms in Run.
- Never track Hebrew. Use locale-appropriate weight and line height, not forced Latin casing.
- Use tabular/monospaced numerals for timing so progress does not move adjacent controls.

## Routes and layout

Primary bottom navigation returns to an existing target or replaces the current screen when absent. It must not accumulate duplicate primary screens through repeated tab use. Child-page Back keeps its own history; the highlighted primary item can return from a child page. Focused song drafts continue to hide primary navigation. [Navigation reliability evidence](native-robustness-2026-10-24.md) records real-router and installed checks; Run's motor map is unaffected.

### Library

Shows dominate; last edited/backup/preflight state is secondary. One clear create/import action. Empty state teaches the first action. Destructive actions use confirmation and recovery. One reserved fixed-size first-party promo may appear, clearly labelled and visually subordinate.

Same-name shows retain their saved titles. A wrapping caption identifies each with a localized absolute update time and a collision-checked local reference. References derive from the full active library and do not renumber with search or list order; invalid dates keep the reference with an unavailable-date message. The same context appears in Open/Manage assistive labels, target dialogs and selected-show preparation panels. Deleted-show recovery uses full references when names collide. References are presentation metadata, not restore provenance, a credential or a revision number. Run, prepared Rehearsal and Recovery motor layouts do not gain identity rows. See [show identity workflow evidence](show-identity-workflow-2026-11-04.md).

### Builder

Use an ordered cue list, separate Hits bank, and focused inspector. Phone drills into panels; tablet may use two panes. Drag reorder has accessible move-before/move-after alternatives and undo. Saving status is persistent. One fixed promo slot sits outside cue order, transport, and editing actions.

### Rehearsal

Expose seek, start-anywhere, native progress, active voices, Hits, and drills without impersonating Armed. Rehearsal actions do not change cue order/values. Its fixed promo uses only bundled or already verified cached data; entering Rehearsal never starts network work.

The [Rehearsal workspace](rehearsal-workspace-2026-10-24.md) places Playback, silent song selection and independent Hits in explicit tabs. Compact cover identity, source clocks, seek actions and the next-song strip precede saved-behavior details. Lists stay windowed; prepared screens have no keyboard or modal over the fixed safety footer. At large text or short heights the reading area scrolls, including tabs and Exit. Numeric active-sound ratios retain left-to-right order inside Hebrew/Arabic text and keep plain spoken labels. Preparation search, feedback and the silent Prepare action share shell-owned keyboard avoidance; ordinary navigation hides while typing.

[Rehearsal clarity](rehearsal-glance-2026-10-25.md) keeps current identity/native clocks and a distinct next-song surface ahead of the expandable Seek and replay tools. Waveforms load only while those tools are open. Loading and recoverable waveform errors remain explicit; a waveform failure never starts transport or edits saved tuning. The disclosure resets with native session generation, and the existing safety footer retains its geometry. Long next-song names keep their complete assistive label. Small/large-text reading areas remain scrollable; this does not promise that every detail fits above the fold.

### Preflight

Group blocking failures, warnings, passed observations, and unobservable operator checks. Avoid a wall of green checks. Each failure names the object and repair. Arm deliberately. Its fixed promo uses only bundled/verified cache and cannot move checks/actions or start network work.

### Run / Armed

The motor map is fixed and bottom weighted:

1. compact run/output/controller status;
2. dominant NOW card with state/progress;
3. quieter NEXT card naming what `GO` will do;
4. Recovery access;
5. panic fade physically/visually separated from `GO`;
6. near-white `GO`, at least 96 dp high (104 dp token), across the thumb zone.

Cue names, language, progress, controller state, lock/background state, and warnings cannot move `GO` or panic. Bound text regions with accessible full labels. No promotions, promotional fetches, decorative meters, particles, pulsing ornaments, gradients, or scrolling text.

### Recovery

Prioritize fade/stop, replay, previous, skip, choose cue, controller reconnect test, preflight, and no-audio continuation. A selected cue is not triggered until a separate deliberate action. Recovery never contains a promotion.

### Controllers and Settings

Show named device/adapter health, assigned input, semantic command, last receipt, background/lock availability, and safe Test state. Do not imply remote-side acknowledgement. Settings groups safety, audio, controls, language/accessibility, backup, promotion removal/restore, diagnostics, and legal. Each may reserve one fixed promo slot when not removed.

### Lock screen and Android notification

Expose only the platform-approved, safety-reviewed command subset with unambiguous localized labels/metadata and no sensitive cue/show names unless the user explicitly enables them. Never include promotions. System layout is platform-owned; test screen readers, large text, media-button mapping, accidental activation, and Interrupted state on devices.

Android's prepared-show notice uses the app language captured at preparation for warning text and actions. Its channel remains quiet and ongoing, with all independently observed restrictions and recovery guidance retained. Permission denial remains explicit: native foreground ownership does not prove that the Ready/Paused notice is visible. The preparation panel offers deliberate permission/settings repairs; no prompt, settings change or transport action happens automatically.

## Source-owned primitives

Create a small native system: `Button`, `IconButton`, `Surface`, `Card`, `Divider`, `Text`, `Heading`, `TimingText`, typed fields/sliders, switches/check/radio/segments, `ListRow`, `CueRow`, `HitPad`, `StatusChip`, `Banner`, `Progress`, empty/loading states, coordinated Dialog/Sheet/Menu/Toast, and safety-reviewed `GoControl`, `PanicControl`, `NowCard`, `NextCard`, `TouchGuard`, and `StageBlackout`.

Every interactive primitive defines default, pressed, focused, selected/toggled, disabled, loading, error, warning, and confirmed states where relevant. Disabled controls explain why. Loading never replaces a safety action in Run.

## Interaction and feedback

- Touch targets are at least 48 × 48 dp, separated against accidental activation.
- `GO` fires once on the defined event; touch, Flic, system media controls, and other adapters share semantic duplicate rules.
- Sound-producing recovery choices are deliberate; panic remains immediate.
- Haptics supplement visible/text state and respect preference/availability. No workflow depends on haptics.
- Engine ACK, voice start, playing, Interrupted, route changed, controller disconnected, and uncertain command are distinct. Button receipt alone is not “played.”
- Announce concise state changes; throttle progress for screen readers.

## Touch Guard and Stage Blackout

Touch Guard blocks casual screen input while supported external/lock controls continue. Use a documented accessible exit distinct from `GO`; never trap screen-reader/switch users.

Stage Blackout renders near-black/low-light UI without stopping audio. Exit is distinct from `GO`, panic, and guard unlock. Critical route/interruption/panic state may break blackout visibly. It does not control external displays until stage 04.

## Promotion component

`FirstPartyPromo` has a fixed reserved size, visible “From Show Control”/localized first-party label, bounded title/body/action, allowed HTTPS destination, no animation/auto-rotation/dismiss dark pattern, and complete offline/error states. It accepts only bundled or signature-verified manifest data. Its component and provider are forbidden from Armed/Run, Recovery, lock screen, and Android notification. After verified `remove_promotions`, eligible layouts collapse the reserved slot predictably; live controls never depend on its measurement.

## Motion

No decorative motion in Run. Micro transitions are 100–150 ms maximum and communicate direct state. Reduced motion makes them instant and disables interpolated progress. No continuous motion, parallax, spring bounce, rotating content, or color-only flashing. UI lifecycle never controls native audio timing.

## Accessibility

Provide names, roles, values, state, hints, errors, logical focus, dialog focus return, keyboard/switch navigation where relevant, Dynamic Type, zoom/bold/reduced-motion/high-contrast compatibility, non-color cues, visible focus, accessible reorder/slider actions, and complete labels. Panic and recovery remain assistive-technology accessible; safety cannot be gesture-only. Promo labelling and removal/restore meet the same standard and never precede the screen's task in focus order.

## English, Hebrew, and RTL

All visible/assistive strings, errors, confirmations, permission rationale, system media metadata, promo labels/actions, purchase/restore states, diagnostics, and legal navigation come from parity-checked dictionaries. Do not concatenate fragments.

Use start/end for semantic alignment. Mirror reading/order navigation in RTL. Do not blindly mirror media, universal play/pause/stop icons, waveforms, clock progression, physical controller/cable diagrams, or brand marks. Test mixed Hebrew/English cue names, numbers, formats, prices, and devices with bidi isolation.

## Design QA gates

Require token lint/no raw feature values; every component state; all routes on small phone/tablet/both orientations; EN/HE/RTL; largest text; reduced motion; screen readers; contrast; 48 dp targets; Run geometry comparisons across states/locales; guard/blackout exits; panic under overlays/errors; lock screen/Android notification on devices; exact promo allowlist/fixed geometry/removal/restore/no-network Rehearsal+Preflight; and real-device dim-stage readability. Simulator screenshots prove layout only, not ergonomics, haptics, system controls, audio, or hardware.
# Routine music surfaces

Find music uses existing semantic surfaces, buttons, typography, covers, disclosures and status banners. Device library, routine recommendations and downloads have separate tabs. Category selection is an accessible button grid with 26 translated show roles. Results load in bounded pages. The header names the captured destination; external sources show title, uploader and URL before download.

## Premium studio, 15 October

[The premium redesign](ui-premium-redesign.md) gives the selected show a featured artwork treatment, distinct local cover fallbacks, a compact collection, and a grouped Backstage tool grid. Song settings use a larger artwork identity, explicit bundled font weights, measured value chips, contextual preview actions, and inline 48-dp step controls. Preparation navigation floats within the safe area; Run and its GO/panic geometry are unchanged.

Artwork fallbacks are static native geometry derived from the title and existing theme roles. They require no downloads or AI and never overwrite attached artwork. Reading layouts stack for narrow viewports and large text. New primary actions and tool tiles expose focus/pressed/disabled states, and decorative artwork stays out of the accessibility tree.

Non-live route content mounts after bundled fonts are ready or have failed, avoiding stale fallback-font measurements during cold launch. The navigator remains mounted throughout. A reconciled live session bypasses this typography gate so safety controls remain immediately available. Font failure continues with system fallback. First-run and empty-library screens use the same local visual system.

[The remaining-screen refinement](ui-complete-refinement.md) extends this treatment through Run's bounded readout, Recovery, preflight, remote setup, local imports/downloads, backup, audience output, settings and help. Reusable workflow headers and action cards give each task a clear identity, explanation and accessible target. Tabs expose selected, focused, pressed and disabled states. Remote instructions reveal on demand; connection, mapping and silent testing stay distinct. Backup create/restore actions remain separate from measured progress and saved results. Run's control stage and layout styles remain unchanged; only its fixed-height NOW/NEXT content gains artwork and clearer hierarchy.

Downloads show measured progress or an indeterminate stage with Cancel. Unassigned files expose Attach to current section, Save/share and confirmed removal. Provider, pairing, source and storage errors use translated recovery messages and existing toast/diagnostics. New copy, native permissions and notifications cover ten languages. Run geometry and motion policy are preserved.

## Workflow refinement, 14 October

[The workflow plan](workflow-polish-plan.md) replaces repeated Open/Edit/Manage panels with compact artwork-led collection rows and named 48-dp overflow actions. Show creation/renaming and playlist selection use bounded native dialogs. Delete confirmation stays within the active dialog. A song opens silently in a focused editor; Back protects unsaved names and notes, while timing remains autosaved. Exact timing, identity, history and advanced management reveal progressively. Waveform processing exposes loading, failure and Retry instead of silently hiding failure.

Source-owned native marks replace inconsistent navigation glyphs. Subtle borders, selected checks, category/language chips, evenly sized theme previews and grouped search controls use semantic tokens. Large text stacks the theme previews. Dialog headings and navigation labels use the existing 1.3× chrome cap with full accessible names; reading and editing content continues to scale. Dialog headings are bounded to two lines so long object names cannot displace Close. No decorative motion is introduced; Run's motor map is unchanged.

Music results keep Preview and Add separate, mark completed additions, guard rapid duplicate taps and offer explicit Add another in song details. The destination remains captured, source results are cleared before a new search, download progress is measured and completion provides a deliberate return to the target playlist. [Verification](workflow-polish-verification.md) distinguishes automated, emulator and pending physical-platform evidence.

## Remote hub refinement

[Keyboard text safety](keyboard-text-safety-2026-10-25.md) adds ten-language guidance to keyboard/presenter/custom setup. Ordinary HID shortcuts pause while editing; the operator finishes editing and releases held keys before using them again. Assigned panic/stop and supported media/Flic paths retain their safety behavior. This changes no layout, motion, token, profile or live control geometry.

The [remote plan](remote-control-plan.md) adds a static source-owned physical diagram, four compact media action rows and an accent-bordered operating-scope note. A protocol picker reveals the relevant vendor/mode guide. Numbered connection, mapping and silent-test surfaces replace repeated headings. Mapping uses collection rows, explicit removal confirmation and a separated panic mark; the test dialog shows action counts, actual progress and unknown inputs. Success means inputs received, not hardware certification.

All accents, danger/success states, borders and typography use the existing theme roles. Large text stacks the hero and connection summaries; modals scroll and retain 48-dp actions. RTL mirrors reading/navigation while keeping physical media symbols and the remote diagram fixed. RTL text uses a neutral physical text-layout direction plus RTL writing direction/right alignment to avoid Android double-mirroring under a mirrored parent. No decorative motion or Run geometry change is introduced.

## Non-AI preparation surfaces

Background readiness is a shared Preflight/Settings surface with independently measured battery, background, notification and native-service states. Unknown values stay explicit; opening an OS page never marks a warning resolved. Actions refresh on return, remain unavailable during a critical session, and report unavailable/fallback settings without replacing an unrelated operation's Retry. The ongoing Android media notification returns to controls and carries a quiet battery advisory; interruption recovery takes priority. Keep visible show controls awake, releasing the screen policy on background/exit. There are no Run overlays or changes to GO/panic positions. See [background-readiness evidence](background-readiness-2026-10-17.md) for platform limits and validation.

[Quiet protection rechecks](show-protection-refresh-2026-10-24.md) keep preparation warnings current every 30 seconds while active and idle. They preserve the current layout during reads, stop automatic reads in background/critical/settings states, reject stale responses and replace failed observations with the existing Retry guidance. These checks do not start a playback service or request permissions.

[Focused protection](focused-protection-2026-10-25.md) additionally stops hidden-route checks and waits for known active AppState. Refocus or completion of an OS-settings interaction performs a fresh quiet check; paused checks do not show a false busy spinner or successful status. An initiating windowed-settings Recheck remains available even when its initial observation was slow. Lease release and status refresh are distinct; opening a page never resolves a warning by assumption. Existing semantic surfaces, translations and fixed Run controls remain unchanged.

[The Android memory advisory](memory-protection-2026-10-25.md) uses the same warning surface and ten-language copy. It appears only for a current observed low-memory flag, clears on a fresh healthy reading, and preserves other protection warnings and their deliberate repair buttons. The expanded guidance asks the operator to close demanding apps before preparation and rehearse again; the app never closes other apps. No live overlay or GO/panic layout change is added.

[Recovery's shared workspace](recovery-workspace-2026-10-25.md) uses windowed ordinal rows, normalized multiword search and a separate labelled play action beside the native-selected result. Selecting preserves the query and never starts audio. Stop/Fade remain outside scrolling; during deliberate Recovery text entry the entire workspace docks above the keyboard, then returns to its original safety coordinates on dismissal. Run's GO/panic geometry remains fixed. CueTitle preserves full screen-reader names and native balanced wrapping without changing saved titles, themes, transport symbols or control sizes. No decorative animation is added.

Recovery keeps search in a stable surface above the windowed collection. Compact typing hides duplicate visual headings/counts, keeps the full assistive label and uses the shared 48-dp Field sizing; the placeholder identifies an empty search. Landscape shows the input plus fixed safety actions while the keyboard is open, and restores results after submission/dismissal. The input itself is retained across that change. Android full-screen IME extraction is disabled for collection search; other forms retain their defaults.

Interruption recovery keeps Run's motor map and safety footer fixed. A fault/interruption makes Recovery available through Touch Guard and reveals the normal readout through blackout. Unusable playback choices are disabled until explicit Stop/exit and preparation; the recovery card provides that route without starting audio. Preflight and searchable help explain media volume, ringtone silent mode and DND/Focus exceptions without claiming automatic policy detection or changing device settings. See [interruption safety evidence](interruption-safety-2026-10-17.md).

The focused song editor uses artwork-led identity, a native source-time cursor, outlined trim range, millisecond fields with explicit units and isolated preview labels. Disabled switches expose checked/disabled accessibility state, including legacy crossfade restrictions. Existing tuning is preserved; new songs retain −18 dB, 800/1,800 ms fades, 1× rate, no delay/loop/autoplay/crossfade, and 2,000 ms outgoing crossfade.

Playlist rows show compact behavior indicators and trim/rate-adjusted playable duration. Rehearsal separates silent Prepare from GO; native prepared controls keep stop/panic and GO in a fixed footer, while selecting a cue stays silent. Audience setup uses a static private-phone/audience-screen diagram, explicit hardware/output states, fallback precedence, image-only replacement and confirmed removal. Library and Settings use the same backup component for stages, counts, cancellation and saved/share results. All surfaces use the three existing semantic-token themes and ten-language catalogue, with no decorative animation or changes to Run's GO/panic motor map.

## Edge-case refinement, 14 November

[The edge-case pass](ui-edge-case-refinement-2026-11-14.md) changes these rules:
- **Fitted text:** `AppText` enforces the shrink floor itself (default 0.72×) and ellipsizes below it. React Native's New Architecture ignores `minimumFontScale`, so fitted text could otherwise reach 4 pt.
- **Focus:** a layout-neutral outline ring on every interactive primitive, so focus never moves content or the GO box.
- **Horizontal groups:** segments and theme previews stack when a label would split mid-word.
- **Stage Blackout:** dims GO and routine tools in place. Panic, Guard and the blackout exit keep their treatment.
- **Run clocks:** stay left-to-right with the progress bar, and remaining time rounds up.
- **User names:** isolated for bidirectional text in RTL locales.

All of this is automated evidence only; installed and physical-device verification remains open.
