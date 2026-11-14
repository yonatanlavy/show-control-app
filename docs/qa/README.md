# Android test evidence — 13 October 2026

See the [verification record](../oms-verification.md) for the test scope, limitations, build identity and outstanding physical/iOS gates. All screenshots use synthetic emulator data. No live AI request or recognition inference was performed. The emulator had audio disabled: native state and successful decoding do not prove audible quality.

## Rendered interface

- [English / Dark Blue Run, portrait](run-default-portrait.png)
- [Hebrew at 1.8× text, portrait](run-hebrew-large-portrait.png)
- [Hebrew at 1.8× text, landscape](run-hebrew-large-landscape.png)
- [Persistent corrupt-backup error with visible recovery controls](backup-error.png)
- [Recovery's fixed Stop/Panic footer while scrolled](recovery-large-landscape.png)

The floating gear in screenshots is Expo's development-client overlay. It is not part of the product UI. Screenshots establish layout for this emulator only, not device ergonomics, acoustic output or assistive-device acceptance.

## Compiled native results

- [Combined native stress results](native-stress.json): repeated shutdown/reprepare, contextual transport, rejected URI inspection and voice capacity.
- [Preview-error and silent/paused Panic cases](native-preview-panic.json).
- [System media commands while JavaScript was suspended/backgrounded](native-suspended-js.json).
- [Touchscreen GO before forced stop](process-kill-before.json) and [silent cold-relaunch state](process-kill-after.json).
- [Final automated verification log](verification.txt): type, lint, 176 unit tests, architecture, 319 translated messages, tokens and 21 environment checks.

These are captured results for the development APK identified in the verification record. Android-to-iOS backup transfer, acoustic fade/pitch measurement, named controllers, microphones, HDMI and physical lock/background/soak testing remain open.
