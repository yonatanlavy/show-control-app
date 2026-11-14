# Show Control · premium preparation UI

The owner rejected the October 15 APK's visual quality. This pass replaces the repeated panel-and-initials presentation with a music-first studio while preserving the existing transport, persistence, offline behavior, and safety controls.

## Direction and references

Use editorial hierarchy, expressive artwork, tactile controls, compact ordered tracks, and a distinct tools hub. Reference the artwork/collection hierarchy in [Riotters' Dark Music Player](https://dribbble.com/shots/14216970-Dark-Music-Player) and the focused controls in [Music Player App UI](https://dribbble.com/shots/27033925-Music-Player-App-UI-Dark-Neumorphic-Concept). These are visual references only; no third-party artwork is copied into the app.

## Delivery

1. Extend source tokens with preparation artwork sizes and the already bundled font weights. Build reusable artwork, masthead, show hero, tool tiles, section headings, and complete slider states.
2. Apply the system to Shows, playlists, the song studio, rehearsal preparation, and Backstage. Shared fields, dialogs, disclosures, navigation, and controls carry the design through imports, backups, settings, and secondary screens.
3. Verify real Android screenshots, narrow/large-text and RTL layouts, all translations, type/lint/unit/architecture/token checks, then promote only this pass's files and produce a standalone APK.

## Constraints

No decorative motion, new dependencies, AI requests, fake meters, fabricated readiness states, schema changes, or native transport changes. Keep Run GO/panic sizes and positions unchanged. Selection remains silent; artwork failures use a deterministic local fallback. Large text may stack non-live layouts. Keep distinct, named 48-dp actions and all existing error/recovery paths.

## Evidence

Final source passed TypeScript, zero-warning lint, 424 tests across 39 suites (including architecture and startup/font-failure/live-session regressions), 611-message translation parity in ten languages, generated-token verification, and Android `assembleRelease` with release lint. The source of Run and its layout styles matches the pre-redesign baseline.

On the Android 15/API 35 emulator, the standalone APK updated the existing installation without clearing the library and opened without the development-server connection. Reviewed Shows, playlist, song studio, Backstage, Settings, first-run, Hebrew/Arabic RTL, 1.6× text, and landscape screenshots. Font and rotation preferences were restored. A last text-fitting pass bounds longer Backstage labels without changing actions.

The navigator stays mounted during font loading; only non-live route content waits for font registration or a loading failure. Prepared live controls bypass the typography gate. No AI-provider calls, media downloads, data-schema changes, or native transport changes were made.

Local evidence is under `.native-check/ui-premium-*`; the delivered APK is `Show-Control-Studio-2026-10-15.apk`. Android screenshots establish layout evidence only. iOS builds, physical-device accessibility/audio/controllers/HDMI, and venue use remain unverified by this visual pass.
