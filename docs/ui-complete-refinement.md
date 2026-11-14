# Remaining screen refinement, 15 October 2026

Extend the existing Studio design system through Run, Recovery, preflight, controllers, music finding/downloads, backup, audience display, settings, help and optional preparation screens. No provider calls, data/schema/native transport changes, new dependencies or decorative motion.

Run receives an artwork-led NOW and quieter NEXT within the existing fixed readout. Preserve the entire control stage, GO/panic sizing, spacing, orientation rules, guard, blackout, timer and Hits boundaries. Route and controller claims remain explicitly unverified.

Use a shared compact workflow hero and accessible action tiles for secondary workflows. Remote setup keeps connection, assignment and silent testing distinct. Imports expose the captured destination, local import, category and source details. Backup keeps measured stages, cancellation, atomic restore and reuse of saved archives after share failure. Existing data and tuning remain intact.

Verification: type/lint, all unit and architecture suites, ten-language parity and token check; current Android standalone release build; emulator walkthroughs, unsafe URL/error/picker cancellation, backup share/cancel, silent remote test, Run controls/guard/blackout/timer, RTL/large text/orientation and GO/panic bounds. Record observed evidence below after completion. Physical output, exact remotes, iOS/Xcode and two-hour runs remain separate open gates.

## Automated and build evidence

- TypeScript and ESLint pass. All 424 tests in 39 suites pass, including architecture, native source contracts, backup progress/retry, controller admission and Run safety. The controller guide test now opens the disclosure and checks its expanded state before checking the four media actions.
- All 612 messages and native OS copy pass ten-language parity; generated tokens match their source.
- Android `assembleRelease` succeeds for arm64-v8a and x86_64. Embedded JavaScript and native app modules are present; v2 signing verifies against the previous internal test certificate. No Metro connection is required.
- The complete RunScreen control implementation and its layout stylesheet compare identical to this turn's baseline. The fixed-height readout is the only live presentation changed.
- No provider calls, dependency changes, native transport edits, schema changes or library replacement.

## Emulator observations

Android 15 / API 35, emulator-5560, internal test package `app.showcontrol.working`. Update preserves the synthetic QA library (5 shows, 6 playlists, 13 song references, 5 media files in the exported archive). Device-specific and physical-platform claims remain open.

- Standalone cold launch reaches Shows with no resumed playback. The first post-update launch took longer during emulator setup; no Show Control crash was observed.
- Remote hub displays connection, assignment and silent-test workflows. Custom remote guidance names standard HID/media protocols and explicitly distinguishes proprietary BLE and volume-only camera shutters.
- Local import opens the Android picker. The emulator's system Files app displayed an unresponsive-app dialog. Closing Files returned Show Control to an idle import screen with 3 indexed songs and no false success or added media. A clean physical picker run remains unverified by this observation.
- A `file:` URL is rejected with a persistent localized explanation, Retry, Diagnostics and Dismiss. No download or media change occurs.
- Full-library export reaches Android's share sheet with a completed ZIP; cancelling sharing leaves a saved result and accurate counts. Automated tests prove that retry reuses the saved archive without another export.
- Native GO followed by the Android media play/pause command reaches Paused with source-time progress. Touch Guard disables GO while panic stays available; blackout exits deliberately and the stopwatch stays within the readout area.
- GO/panic bounds match the baseline exactly: portrait GO `[42,1582][1038,1855]`, panic `[556,1403][1038,1550]`; landscape GO `[1211,303][2124,555]`, panic `[1684,156][2125,282]`. Guard, blackout and timer do not move these controls.
- Hebrew remote setup and Arabic import layouts render with logical RTL, full labels, and direction-neutral physical remote symbols. All ten language catalogues pass automated parity.
- The first 1.6× landscape inspection found the progress track outside the NOW card. Compact internal padding/gaps were reduced and fixed readout chrome now uses the existing 1.3× stage text cap. Cue names retain fitted full assistive text. Safety-control source/layout is unchanged.
- The final rebuilt APK was installed over the existing app and re-armed silently at 1.6× in landscape. The inspected screenshot confirms the track is contained within the NOW card and GO/panic retain their recorded bounds (`.native-check/ui-complete-final-large-run.png`).

## Artifact

`Show-Control-Premium-2026-10-15.apk`, 154,449,409 bytes, version 0.1.0 / internal build 1. SHA-256: `43EEAC9C8ECAC55AC18417ACA85CB7DD87895EEC801B5B1FF69A4EF067E416C3`. Store publication and production signing are separate. A transient final packaging failure was resolved by a bounded-worker incremental retry; only the successfully built, signature-verified artifact is delivered.
