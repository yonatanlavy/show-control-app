# Workflow refinement evidence — 14 October 2026

Implemented the [four-step workflow plan](workflow-polish-plan.md): compact artwork-led show/song rows; focused creation/rename/playlist dialogs; overflow management and in-dialog delete confirmation; a silent focused editor with protected Back; progressive exact timing and identity panels; category/language chips and theme previews; compact music search, captured destination, explicit Preview/Add, addition feedback and rapid-tap protection; reviewed external sources and measured download progress. Shared semantic tokens and source-owned native icons carry the visual refinement across preparation screens. Run geometry and native transport were not redesigned.

## Automated checks

- Complete regression: **236 tests, 26 suites passed**, including architecture checks. Eleven additional cases cover form cancellation/blank names, trimmed and duplicate pending saves, failed-save retry, dialog Back during save, silent editor entry/return, unsaved-name retention on failed Back-save, cancelled rename/delete, rapid music additions, silent song details, and released SQLite-handle recovery.
- Final type and source lint passed. The complete UI surface passed **82 tests in 10 suites** after the visual audit changes; the subsequent full regression includes the connection fix.
- All **427 messages** and native OS copy have parity in ten languages. Generated-token verification passed.
- Android JavaScript/Hermes production export passed. The new screens run in the existing API-36 development APK; native module source was unchanged. This is not a new physical-device/native release certification.
- AI providers were mocked; no live AI or paid generation was used.

## Android emulator observations

Existing 100-cue and 70-cue shows, older smoke-test shows and their media were retained. Opening a song produced no sound. The focused editor returned to the ordered list; the chooser exposes selection and management separately. English/Hebrew, Dark Blue/Purple Night/Cobra, and a 360-dp phone at 160% and 200% text were visually inspected. A Hebrew dialog at 200% text was inspected in portrait and landscape: Close remained visible, rows scrolled and full object names remained accessible. Chrome labels/headers are bounded while reading regions continue scaling. The Expo tools gear visible in some screenshots belongs to the development client.

Inspection caught and fixed uneven theme preview heights, excessive music-finder setup space, missing waveform loading/failure feedback, repeated large management panels and long modal headings that could displace dismissal controls. Deletion now confirms within the existing modal rather than stacking native dialogs.

Repeated configuration/development-bridge recreation exposed Expo SQLite's cached released native handle (`NativeDatabase.prepareAsync` / NullPointerException). The store now owns a fresh connection using the installed SDK's `useNewConnection` option. A regression simulates a released cached handle and verifies that the next store reads the same shows and persisted language/theme. The already-failed old development instance required a cold restart; the patched startup reopened both original music shows and the persisted Hebrew preference without a reset or reimport. Repeating a font-scale configuration cycle retained both collections. English, Dark Blue, 1080×2424 pixels, font scale 1.0 and free rotation were restored afterward.

## Evidence limits

Windows does not provide an iOS compiler or simulator. Physical iPhone/Android screen readers, keyboard/switch focus, touch ergonomics, venue audio, controllers, microphones, locked/background lifecycle and store release remain the existing platform gates. These checks prove the described code and emulator workflows, not an absence of all bugs or hardware readiness. No publication or paid provider request was performed.
