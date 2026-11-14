# UI edge-case refinement · 14 November 2026

Owner request: refine the UI so it holds up in every edge case and looks finished. This pass audited all screens through code reading, with three independent read-only audits: stage screens; library and editor; settings and services. It then fixed the confirmed defects in shared primitives and screens. Run's GO/panic motor map, native timing, persisted schema and translations are unchanged. No dependency, permission or token value was added.

**Evidence level:** automated (Jest/TypeScript/ESLint) only. Nothing in this pass was installed or observed on an emulator, a physical device or with an assistive technology. Every rendered-size claim below is `physical-device unverified`.

## Cross-cutting defects fixed in primitives

| Defect | Cause | Fix |
| --- | --- | --- |
| Fitted labels shrink to about 4 pt: long cue names in NOW/NEXT/GO, badges, fixed stage buttons, dialog and hero titles | The RN 0.86 New Architecture ignores `minimumFontScale`. iOS `RCTTextLayoutManager` and Android `TextLayoutManager` read only `minimumFontSize`, default 4. That prop is not in the Text view config, so JS cannot send it. | `AppText` enforces the floor (default 0.72). An invisible, absolutely positioned, assistive-hidden probe measures the label at full size in the same width. If fitting would go below the floor, the label renders at floor size with a tail ellipsis. Nothing is measured until the visible text reports its width, and a wider layout re-measures. |
| Preflight Arm (`go`) and every loading primary button showed near-white text on a near-white or light-accent fill | `stateInk` was applied to every non-idle state | Only `error` and `confirmed`, which replace the fill, switch to light ink. Loading keeps the variant's ink. |
| Keyboard/switch focus moved content, and `TaskRow`, `Disclosure`, `ChoiceChip`, `Field` and `CollectionRow` had no visible focus (NQA-02) | 2-dp border on focus; missing handlers | A layout-neutral outline ring (`uiStyles.focusRing`, `useFocusRing`). Fields use the accent boundary while focused. The GO box is unchanged. |
| Segment and theme labels split mid-word (German "Bibliothekssiche/rungen", "Dunkelbla/u"; Russian "Фиолетовая") | Stacking was triggered only by font scale or a fixed 340-dp width | `useWordBreakFallback` reads `onTextLayout` lines. A line that ends without whitespace or break punctuation stacks the group, keyed by labels and width. Japanese wraps also stack, which is safe. |
| Failure notice actions truncated in long languages | Three `flex: 1` slots in a non-wrapping row | Content-sized wrapping row (`app-feedback-actions`) |
| Speed and other stepped values stored float noise ("1.1500000000000001×") | `Math.round(v/step)*step` | Snapped values pass through `toPrecision(12)`. Builder rows format with `Intl` (2 decimals). |
| Slider labels collapsed to one letter per line at large text | Uncapped value chip and no wrapping | Chip capped at 1.3×. The header wraps with a readable label basis. |
| iOS switch touch target 31 pt and drawn high | `UISwitch` ignores its stretched frame | The whole `SwitchRow` toggles. The switch is centred in a 48-dp slot and remains the only assistive element; it claims its own touches, so it cannot toggle twice. |
| `StatusBanner` warnings read like ordinary cards | Bare text glyph, neutral edge | Toned edge plus a circled `!`/`✓`/dot marker. The glyph, not colour alone, carries the tone. |
| Badge text had no shrink floor; `SectionHeader` actions crushed display titles at large text | — | Badge floor 0.72. Header action stacks above 1.3×. |
| Latin user names reordered in Hebrew/Arabic on iOS ("(Lovely Day (Remix") | Forced RTL `writingDirection` | `isolateName` wraps visible names in first-strong isolates in `CueTitle` and `CollectionRow`. Assistive labels stay raw. |

## Stage screens

- **Stage Blackout** now dims GO, Recovery and the routine footer tools in place (`Button dimmed`: blackout fill and subtle ink), and mutes the blackout title. Panic, Guard and the blackout exit keep their normal treatment. A fault or interruption still breaks blackout. Geometry is unchanged, and a regression compares GO's box.
- **Run clocks** follow the unmirrored progress bar: the row is LTR, and captions share their value's edge in RTL. Compact clocks keep mono tabular digits, and remaining time carries a minus sign. Remaining time rounds up: 400 ms left reads `00:01`, a 3:00 cue reads `03:00`, and 17.14 s at 0.7× reads `00:18`. `formatTime` rejects non-finite input.
- **Run Hits** are spaced apart against accidental neighbours, with complete labels kept as before.
- **Recovery** no longer shows "No songs yet. Import local audio" as a mid-show selection, or "Ready" as a show name. "No results" now appears only for a non-empty search and uses Recovery-appropriate guidance (no category-filter advice).
- **Settings panic fade** shows the operator's latest value immediately and saves only the newest one once the app is idle, including after any import or restore. Before, quick taps were silently dropped. The collapsed summary now shows the fade length.
- **Dimmed controls stay dim when pressed.** Guard can be unlocked while blackout stays on, so a press must not flash the bright GO fill.

## Preparation screens

- **Library and editor:** the Builder action bar and playlist actions wrap instead of splitting words. The Builder header keeps the show name visible at large text. A show without playlists gets an empty-state card instead of an unbounded repeated name. An empty Library shows one create action. An empty current playlist explains the disabled Rehearse/Run, reusing `common.empty`. `MetricGrid` stacks from its measured width. Duplicated Backup/History headings are removed when hosted inside a disclosure. Token hygiene fixes are included.
- **Rehearsal:** an empty playlist shows the shared empty state. The waveform ± and screen-reader steps move 1 s, not 1 ms. With no show selected, navigation highlights Rehearsal, so the Builder tab works.
- **Services:**
  - Assistant and music progress clear on failure or cancel.
  - Cover generation is hidden without a song.
  - Audience output shows Unavailable instead of an endless Loading when its first status read fails.
  - Empty history, transcript and terminal views explain themselves.
  - The RTL diagnostics arrow points the right way.
  - Voice selectors use selection chips instead of success-styled buttons.
  - Provider cards no longer repeat their title and show a saved badge.
  - The duplicate "Open notification settings" button is removed.
  - Percentages are localized and clamped.

## Owner-approved copy and Preflight honesty

The owner approved the proposed strings. `src/i18n/edge-messages.ts` adds 21 keys in all ten languages; three existing strings were also changed (below).

- **Short labels for fixed-width slots:**
  - Stopwatch Start / Pause / Reset / Hide;
  - the Run footer's Timer;
  - voice Disarm;
  - Rehearsal seek `−10 s` / `+10 s`. The signed number is isolated in Hebrew and Arabic so it stays intact.
  
  Each control keeps the full existing string as its accessible name.
- **Shorter "Fade all"** in French ("Fondu général"), Portuguese ("Desvanecer tudo") and Russian ("Заглушить всё").
- **Empty and blocked states:**
  - Recovery shows "No song selected".
  - The empty-playlist and no-playlists messages replace the import prompt in Library, Rehearsal and Preflight.
  - Rehearsal says "Start playback to seek" while seeking is unavailable.
- **Voice:**
  - Arm's step names the missing prerequisite: model, calibration, or an enabled rule for the current language.
  - Each rule carries a badge with its listening language (warning-toned when it won't listen now).
  - "Rename" becomes "Edit rule".
- **Services:**
  - Music states its actual requirement (purpose and style, or a description) instead of "Optional", and fields are capped at the request schema limits.
  - Assistant explains where single-song covers start.
  - API key cards show "Not set" once loaded.
- **Preflight `order`** is relabelled as the manual confirmation it actually is: "Manual: playlist order was rehearsed from start to finish", in all ten languages. Beside it, Preflight now shows the real compiler result as an observation: a pass, or a count of issues with raw details under Diagnostics. The observation does not gate Arm by itself; Arm still compiles again and refuses on failure. So the only behaviour change is that the operator sees the refusal coming. When the saved remote needs the touch fallback, the observation compiles the same profile-free show that touch preparation will. Controller-mapping problems are therefore explained by the existing fallback panel, and never reported as a refusal.

## Verification

- New regression suites: `primitive-states.test.tsx` (25), `panic-fade-setting.test.tsx` (2), `edge-strings.test.tsx` (8: catalogue placeholder parity, Preflight pass/fail/touch-fallback/empty, voice Arm reasons and rule language badge), `library-edge-cases.test.tsx` (6), `service-edge-cases.test.tsx` (7). Each targets behaviour that differed before its fix. The panic-fade suite covers taps during a pending save and waiting for other tasks such as import/restore. Two existing expectations changed deliberately:
  - `oms.test.tsx`: remaining time rounds up at 0.7×.
  - `workflow-usability.test.tsx`: Recovery's no-results text.
- The whole-project results of the final run are recorded in the task hand-off, not in this file.

## Not done / follow-up

- **Copy review:** the new strings were written for this pass and pass automated parity. A native-speaker review of the nine non-English versions is still open, as it is for the rest of the catalogue.
- **Not attempted:**
  - Theme-specific `surfacePressed` and border roles for Purple Night/Cobra. The Cobra candidates fail the 4.5:1 `textSubtle` gate.
  - Locale digits in ordinals and `t()` parameters.
  - Song editor sticky-header height at large text.
  - Dialog busy feedback.
- **Device gates:** verify the fit-floor probe's `onTextLayout` on both platforms. Also check word-break detection with iOS line text, focus rings with external keyboards and switch access, blackout luminance on a dim stage, and RTL isolation on iOS, in an installed build on emulator and physical devices.
