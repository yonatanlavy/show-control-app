# Feedback and fixed-action layout · 24 October 2026

## Baseline and plan

The previous goal turn made verified progress on primary navigation and native decoder refusal/retry. The full customer-readiness goal remains active. Its follow-up captured a language-save notice occupying the Preflight action-bar area. The shared feedback style offsets only navigation height, without reserving the footer or Arm/Prepare bar.

1. Reproduce the overlap on the unchanged navigation APK and preserve native UI/visual evidence. Use the isolated API-35 emulator; preserve its original show/settings. No AI/provider requests or music changes.
2. Give feedback its own layout space above the complete bottom section. The main page may shrink/scroll; fixed footer, Arm/Prepare and navigation remain below the notice. Bound notice height by viewport, safe insets and measured bottom-section height. Keep critical-session feedback suppression unchanged. No animation, new dependency, permission, schema or native-engine changes.
3. Put complete success/error content, including Restore/Retry/Diagnostics/Dismiss, in one bounded scroll region. Persistent failures retain priority and do not expire. Preserve feedback semantics and child/primary navigation.
4. Add regressions for tall/short viewports, changing bottom height, hidden navigation, long diagnostics, Restore, persistent failure, invalid layout readings and critical suppression. Run software checks and build an immutable internal APK.
5. Inspect the exact candidate in English/Hebrew, portrait/landscape, large text, successful/failed operations, preparation, Run/Recovery and fixed safety geometry. Audit with `crit`, restore settings and original library selection.

## Verification

The final layout ships in the combined `Show-Control-Protection-and-Controls-2026-10-24.apk`, SHA-256 `AB5E3626A0E065B9C78149B5B45DACBE166615DD43896C5E62625D76174F887F`. The installed APK matched that identity. See [the protection refresh report](show-protection-refresh-2026-10-24.md) for checks, signing and platform limits.

Eight layout regressions pass, covering normal-flow placement, bounded scrolling, tall/changed/hidden bottom sections, invalid layout observations, Restore, persistent failure and critical-session suppression. The final combined candidate passes 824 tests in 61 suites plus type, lint, architecture, ten-language/native translation and token checks. The Android native lint/release build passed; 72 DEX/native/manifest/resource payloads match the preceding navigation APK exactly.

On isolated API-35 `ShowControl_QA_API35`, density 420:

- The unchanged navigation APK's Dismiss `[869,1958][995,2084]` occupied Arm `[42,1832][1038,2105]`. Its screenshot is retained under `.native-check/feedback-old-overlap.png`.
- Candidate c1 reserved the new lane, but device inspection found Dismiss squeezed to 92 px. The final source prevents shrinking the notice. Final Dismiss `[869,1582][995,1708]` is 126 px / 48 dp; the notice ends at 1730 and the complete bottom section begins at 1751. Arm retains `[42,1832][1038,2105]` and is fully visible/enabled after the three synthetic preflight acknowledgements. These acknowledgements are not acoustic or venue certification.
- Invalid audio selected through DocumentsUI produces persistent global feedback. Retry/Diagnostics/Dismiss are full-sized above Preflight Arm; Diagnostics expands without covering it. In settled landscape at 150% text the notice requires scrolling: all three recovery actions become 126 px high after scrolling inside it, including after expanding Diagnostics. Arm stays outside the notice.
- Hebrew at 150% text keeps the successful-save notice above Arm, with Dismiss 126 px high and mirrored reading/navigation. All ten dictionaries pass automated parity; human translation/screen-reader review remains open.
- A malformed ZIP is rejected through the shared backup panel with its own truthful inline error, working Diagnostics and Retry. Retry reopens the picker; cancellation is safe. The synthetic ZIP/MP3 never entered the library. The original show remains selected with one cue.
- Prepared Ready and Paused retain GO `[42,1582][1038,1855]` and panic `[556,1403][1038,1550]`. Panic reaches Recovery; Android explicit Stop and relaunch remain silent.

Changing font scale restarted the test activity and cleared transient failure state. The first landscape capture is therefore superseded by the settled invalid-audio reproduction and `.native-check/protection-refresh-error-landscape-scrolled.png`; it is not a passing failure-layout observation. Restore and other extreme-layout cases above are automated evidence, not additional installed/physical observations.

The ongoing `crit` audit reviewed the scoped layout change, its callers and regressions, including the device-discovered shrink correction. Final source/test hashes match promotion. English/Dark Blue, font 1.0, rotation 0/auto 1 and the original library were restored. Physical Android/iOS, Xcode, tablet/screen-reader/maximum-text ergonomics, the historical renderer ANR, exact hardware and long-run/pilot gates remain open. This pass is not complete parity or customer readiness.
