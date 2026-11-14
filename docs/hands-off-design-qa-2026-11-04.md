# Ordered native design QA — 4 November 2026

Verdict: **blocked for full design sign-off**. The sampled installed Run layout meets its measured safety geometry. The confirmed valid-input boundary contrast defect has been corrected in source; installed verification of that correction is pending. Native Android ChoiceChip focus is visibly present; other focus paths remain unverified. Missing viewport, RTL, density and assistive-technology coverage remains an evidence gap, not proof of a product failure.

The initial audit was read-only apart from this document. A subsequently authorized targeted correction changes only the normal `Field` border and adds a rendered-style contrast regression test; its evidence is recorded below. This task made no provider requests, operated no device/browser and ran no whole-project checks. It does not certify physical playback, external displays, remotes, iOS or customer-release readiness. Native seek/independent-Hit isolation and Run Hits windowing are owned by separate investigations and are not duplicated here.

## 1. Inputs and source of truth

- Contract: [design-system.md](design-system.md), especially source of truth, typography, Run/Armed, interaction states and accessibility. Its 26 October owner decision removes the promotional footer and supersedes historical promotion-slot paragraphs.
- Tokens: [tokens.json](../src/design/tokens.json); native theme overrides: [ThemeProvider.tsx](../src/design/ThemeProvider.tsx). Supported palettes are Dark Blue, Purple Night and Cobra. No light palette is specified.
- Reviewed components: [primitives.tsx](../src/ui/primitives.tsx), [screens.tsx](../src/ui/screens.tsx), [CueTitle.tsx](../src/ui/CueTitle.tsx), [rehearsal-screen.tsx](../src/ui/rehearsal-screen.tsx), and font registration in [app/_layout.tsx](../app/_layout.tsx).
- Installed baseline: `.native-check/single-button-2026-11-04-r1-artifact.json` and `single-button-2026-11-04-r1-installed.json`; APK SHA-256 `E2CB760EF61E63C95F4118C67F5BBF5AB6507AAF6C5C1679214670E795917FC5`, 154,832,789 bytes, internal/test signing.
- Captures: `.native-check/final-closeout-device/sb-fresh-{run-ready,run-paused,run-complete,run-complete-landscape,guarded-landscape,name-invalid-final}.xml`, with their available PNGs. Ready and large-text landscape Complete PNGs were visually inspected after XML measurement. These are existing R1 captures, not a claim that subsequent source changes are installed.
- Geometry uses the recorded 420-dpi Android density: `px / (420 / 160) = dp`. Portrait is 1080 × 2400 px (411.429 × 914.286 dp); landscape is 2400 × 1080 px. The landscape Complete/guard captures use 1.5× system text with the intentional 1.3× chrome cap.
- Source snapshot hashes before any root-agent remediation: `primitives.tsx` = `23DE634FDB4745083C154643DECABD8A8201C9A81771EC4E9996A7F762BA4F4B`; `tokens.json` = `2F16063D57AEB0B23366F9C9299F0D0B41D8F3448B85BEDDAF536D14ED825BDB`; `ThemeProvider.tsx` = `DD6E1EEF5A3EA4D39657C9D186121DC11C2AB52B5F611980302439AEEBD433FC`.

The required 320-dp-to-tablet sweep and 1×/1.5×/2× density checks were **not performed** in this read-only assignment. The captures cover one density and two orientations, not that entire matrix.

## 2. Layout pass

XML bounds serve as the native ruler; values below are measured rather than estimated from screenshots. The repository's 48-dp target minimum is stricter than the generic checklist's 44-pixel guidance.

| Element/state | Expected, from tokens/contract | Measured bounds in px | Actual dp/result |
| --- | --- | --- | --- |
| Portrait GO: Ready, Paused, Complete | `size.go` = 104 high; fixed coordinates across transport states | `[42,1582][1038,1855]` in all three XMLs | 379.429 × 104; exact same bounds |
| Portrait panic: same states | `size.controlLarge` = 56 high; physically separate from GO | `[556,1403][1038,1550]` in all three | 183.619 × 56; exact same bounds |
| Portrait Recovery | 56 high, alongside panic | `[42,1403][524,1550]` | 183.619 × 56 |
| Portrait panic-to-GO gap | `space.sm` = 12 | `1582 - 1550 = 32` | 12.190; rounding difference 0.5 px |
| Portrait side gutter | `space.md` = 16 | 42 left and right | 16 exactly |
| Landscape Complete GO | `size.goCompact` = 96 high | `[1211,303][2124,555]` | 347.810 × 96 |
| Landscape panic | `size.control` = 48 high | `[1684,156][2125,282]` | 168 × 48 |
| Landscape guard | 48 high; panic retains position under guard | `[1211,576][1652,702]` | 168 × 48; panic unchanged |
| Landscape NEXT feedback | two caption lines, 36 dp reserved | `[457,567][1157,662]` | 266.667 × 36.190; no >2-px discrepancy |
| Invalid-name modal Close | at least 48 × 48 | `[890,1432][1016,1558]` | 48 × 48 |
| Invalid-name field | `size.controlLarge` = 56 high | `[64,1700][1016,1847]` | 362.667 × 56 |
| Invalid-name Create/Cancel | at least 48 high | 126-px heights | 48 exactly |

No measured layout deviation over the checklist's 2-pixel tolerance was found in these samples. Sampled actionable Run controls fit inside the viewport. Blank portrait space between readout and fixed controls is consistent with the bottom-weighted motor map; it is not a spacing defect. Static source uses tokenized content width, gaps and control heights. Broader Builder/editor/remotes/backups layout and narrow/tablet overflow remain unmeasured.

## 3. Typography pass

The source assigns body 16/24, caption 13/18, label 17/22, title 24/30, display 34/40 and time 28/32 from tokens. The `GeistMedium`/`HeeboMedium` registration names map to the actual 600 SemiBold bundled files, so their names do not imply an erroneous 500 weight. `AppText` selects registered strong/bold families. Arabic/system fallback and fallback on font-load failure are explicit contract behavior. Hebrew is not letter-spaced; neutral clocks remain LTR.

`CueTitle` preserves the complete accessibility name while allowing two lines or compact fitted text. Compact NEXT reserves two caption lines and retains complete status text in its assistive label. The large-text Complete capture contains “Set finished. Choose a song in Recovery.” and the guard capture contains “Hold to unlock touch controls” inside the measured region. Main section headings expose the native header role.

No source-token typography mismatch was established. Android XML does not expose registered font family/weight/line-height, so exact native glyph metrics and fallback behavior are **not independently verified**. A three-times-length title test, current Hebrew/Arabic glyph/layout captures, largest-text sweep and iOS Dynamic Type remain required before full sign-off.

## 4. Color pass

Contrast was computed from current DTCG hex values and actual theme overrides using WCAG sRGB linearization (`c / 12.92` below 0.04045; otherwise `((c + 0.055) / 1.055)^2.4`), luminance weights 0.2126/0.7152/0.0722, then `(Llighter + 0.05) / (Ldarker + 0.05)`. These are token-color measurements, not calibrated physical-display measurements. Disabled controls are excluded from normal-text contrast assertions.

| Foreground/background | Dark Blue | Purple Night | Cobra | Required |
| --- | ---: | ---: | ---: | ---: |
| `text / surfaceRaised` | 14.761 | 14.614 | 12.714 | 4.5 |
| `textMuted / surfaceRaised` | 8.694 | 8.607 | 7.488 | 4.5 |
| `textSubtle / surfaceRaised` | 5.532 | 5.477 | 4.765 | 4.5 |
| `textSubtle / surfacePressed` | 4.753 | 4.753 | 4.753 | 4.5 |
| `accent / accentSurface` | 5.274 | 6.272 | 6.477 | 4.5 |
| `accentInk / accent` | 7.991 | 8.805 | 11.710 | 4.5 |
| `goInk / go` | 16.241 | 16.241 | 16.241 | 4.5 |
| `border / surface` | **1.886** | **1.883** | **1.790** | 3 for identifying an input boundary |
| `border / canvas` | **2.032** | **2.020** | **1.996** | 3 for identifying an input boundary |
| `borderStrong / surface` | 3.594 | 3.588 | 3.412 | 3 |
| `borderStrong / canvas` | 3.872 | 3.849 | 3.803 | 3 |

All sampled enabled text roles on canvas/surface/raised/pressed meet 4.5:1; the lowest result is 4.753. Warning/warningSurface = 7.555, danger/dangerSurface = 5.447 and success/successSurface = 7.230 in all palettes. Decorative surface outlines are not falsely treated as controls requiring a 3:1 boundary.

**NQA-01, fixed in source; installed verification pending:** valid `Field` formerly overrode its intended `borderStrong` style with the weaker `border`. The filled field and surrounding surface did not independently identify its boundary at 3:1. The correction restores the strong semantic boundary for normal fields and retains the existing danger boundary for invalid fields. `borderStrong` passes against the outside canvas/surface in all three palettes; no new palette is needed. The inside-fill contrast is not an extra requirement when the outside outline sufficiently identifies the input.

## 5. States pass

Native evidence verifies Ready GO enabled; paused GO becomes Resume and remains enabled; final Complete is disabled. Guard disables ordinary actions while panic remains enabled at the same bounds. The measured invalid-name input contains 371 characters, shows “Use 1–200 characters for the name.” and disables Create. Earlier partial text-injection captures are not validation defects.

Source `Button`/`IconButton`/`Segment` define focused feedback; disabled buttons actually disable interaction; button loading disables the action and exposes busy state. Switches expose checked/disabled state. Errors, status banners and field helpers are explicit rather than blank states.

**Source-contract observation NQA-02:** `TaskRow`, `Disclosure` and `ChoiceChip` have no source-owned focus state or focused style; `Field` also lacks a focus-border state while retaining native caret/selection behavior. Their static/pressed states are implemented. This does **not** prove that Android draws no default focus highlight. The parent task subsequently captured `ho-controller-focus-chip.xml`: Presenter is `focused=true`, bounds `[106,1598][327,1724]`; the matching `ho-controller-focus-chip.png` visibly contains the native gray focus rectangle. Thus an absent visible focus state is **refuted for this Android ChoiceChip fixture**. TaskRow, Disclosure, Field and other platforms remain unverified; do not add speculative focus handlers solely because shared source lacks them.

Targeted reproduction surfaces: Settings language chips (`screens.tsx`, `LanguagePicker`); Remotes Connection protocol chips (`controller-screen.tsx`); Library show-management Rename/Duplicate `TaskRow`; Library Backup or Rehearsal Seek tools `Disclosure`. Compare focus before/after with the existing Button and Segment baseline. Do not modify Run's safety geometry to address preparation focus.

## 6. Motion pass

The audited Run, Rehearsal and shared-primitives files contain no `Animated`, `LayoutAnimation`, timed transition or `withTiming` calls. Pressed feedback applies an immediate one-dp translation; it is direct input feedback, not decorative motion. Core style dimensions remain fixed between Ready/Paused/Complete, as measured above. No ornamental animation was found in these files. Static screenshots cannot prove temporal behavior or OS reduced-motion behavior; those remain runtime evidence requirements for any animated or native modal surface outside this sample.

## 7. Content and native-platform pass

Sampled actions have descriptive native accessibility labels, valid modal fields retain visible labels/helpers, and the long name error explains the allowed range. “REMOTE ?” and “OUTPUT ?” truthfully express unknown status; no hardware readiness is inferred. Complete gives a deliberate Recovery next step, and guarded Complete explains unlocking rather than silently ignoring ordinary touch. No promotional footer appears in the inspected Run captures.

Measured sampled targets meet the repository's 48-dp minimum. Cover images are excluded from duplicate accessibility traversal where adjacent text already identifies the song. Density sharpness at 1×/1.5×/2×, actual TalkBack/VoiceOver order/announcements, switch access, external keyboard focus and all ten languages are not proven by these English R1 captures. Existing translation-check receipts are dictionary coverage evidence, not native-language design acceptance.

Web axe/Lighthouse/DOM computed-style inspection is not applicable to this native React Native surface and was not run. The available native hierarchy verifies names, bounds and selected enabled states only. A native accessibility inspection and assistive-technology run remain necessary; this document is not a WCAG conformance audit.

## Defect log and next actions

| ID / severity | Location | Expected and source | Measured actual | Targeted remedy / acceptance |
| --- | --- | --- | --- | --- |
| NQA-01 — **Fixed and installed** (baseline severity: Blocker) | `src/ui/primitives.tsx`, `Field` normal border (reviewed lines 188 and 241) | Design QA color pass: identifying control boundary ≥3:1; source declares `borderStrong` | Baseline outside surface 1.886/1.883/1.790, canvas 2.032/2.020/1.996. Corrected strong boundary: outside surface 3.594/3.588/3.412, canvas 3.872/3.849/3.803 | Valid fields retain `borderStrong`; danger remains for invalid fields. Final APK pixel acceptance in all three themes is recorded below. Remaining native focus/disabled/large-text permutations are separate evidence gaps. No schema/API change. |
| NQA-02 — **Observation; remaining native evidence required** | `primitives.tsx`: `TaskRow`, `Disclosure`, `ChoiceChip`, `Field` | Design-system interaction/accessibility sections require defined focused state and visible focus | Source handlers absent, but native Presenter ChoiceChip focus is visibly verified in `ho-controller-focus-chip` XML/PNG; no invisible-focus defect established there | Preserve working Android native focus. Capture TaskRow/Disclosure/Field and supported native keyboard/assistive paths; change only demonstrated missing or ambiguous focus, with no geometry shift. |

Required evidence before full sign-off: 320-dp-to-tablet layout sweep; all three themes on installed forms; Hebrew/Arabic RTL and long strings; actual font registration and scaled glyph rendering; native focused states and screen-reader order; 1×/1.5×/2× image density; remaining non-AI workflow states and iOS/device gates. These are explicitly unperformed checks, not additional confirmed product defects.

## NQA-01 targeted source correction

The exact pre-edit `primitives.tsx` is preserved at `.native-check/hands-off-2026-11-04-baseline/src/ui/primitives.tsx` with the original SHA-256 listed above. The only product diff is normal `Field` border selection: `colors.border` → `colors.borderStrong`. No focus handlers, tokens, Run dimensions, persisted settings or native contracts changed.

The new `src/ui/__tests__/field-contrast.test.tsx` renders the real `Field` within each theme, flattens the complete rendered TextInput style array and measures its actual boundary against both theme canvas and surface. Six cases cover valid/error fields in all three palettes. On the unchanged baseline it reproduced three valid-field failures (2.032028/2.019964/1.995745 against canvas), with all three invalid-field cases passing. After correction, **6/6 focused cases pass** (one suite; 62.39 seconds).

Command: `node node_modules/jest/bin/jest.js src/ui/__tests__/field-contrast.test.tsx --runInBand --silent --cacheDirectory .native-check/jest-design-field`. An initial attempt without the explicit local cache failed before any test ran because Windows denied a Temp-cache rename; that infrastructure failure is not a product-test result.

Focused lint also passes with no warnings: `node node_modules/eslint/bin/eslint.js src/ui/primitives.tsx src/ui/__tests__/field-contrast.test.tsx --max-warnings=0`. Full-project checks and installed validation remain owned by the parent task.

Corrected `primitives.tsx` SHA-256: `048F2E0338F08B4BA7880A2271FA118217D616D81986080BDBBDA0015132D0D2`. New contrast-test SHA-256: `8E5313502EEC808A6C2F250163FACEF6DB48C7D4004F4E94D76BCE470E35A6A2`. These source results do not retroactively change the R1 installed evidence or claim that the correction is installed.

## Subsequent final-APK acceptance

NQA-01's normal input boundary is now **fixed and installed** in APK SHA-256 `F652DAB4B770661E1F5655F41DB35F26E6A2124A7E3DACF3CED6777F68AE138A`. The real New show dialog was opened and cancelled in Dark Blue, Purple Night and Cobra; screenshots/XML are `ho-field-dark-blue`, `ho-field-purple-night`, `ho-field-cobra`. At the native input's top-center boundary `(540,1700)`, all three PNGs contain exact `#657085`; the exterior pixels at `(540,1699)` are `#121722`, `#1A1427`, `#101F1B`. Actual sampled contrast is **3.594, 3.588, 3.412**. Receipt: `.native-check/hands-off-installed-field-contrast.json`. Invalid-field rendered styles are covered by the six-case regression; native focused/disabled/error permutations are not all manually accepted.

The final installed Run overlay also passed first/last Hit access, independent Hit pause/resume/completion, fixed Cancel and unchanged safety-control bounds in portrait and landscape at 150% text. See [the workflow checkpoint](hands-off-workflow-follow-up-2026-11-04.md) and `.native-check/hands-off-run-bounds.json`. English/Hebrew/Arabic settings layouts were observed; these samples do not establish every workflow in every language.

Revised verdict: **the confirmed normal-field contrast blocker is closed; full design sign-off remains pending the explicitly unperformed layout/assistive/platform matrix**. Preserve the baseline report above as historical evidence rather than turning its R1 observations into final-APK claims.
