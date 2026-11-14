# Android focus-return investigation

Test-only PowerShell 7/ADB harness for the unresolved API-35 renderer/focus ANR. It does not change the APK, inject faults, arm audio, press media controls, alter notification settings, clear app data or access credentials/media. Run only on an explicitly owned pair: `ShowControl_QA_API35` at `emulator-5562` (the default), or `ShowControl_LibraryLoad_QA` at `emulator-5564`. Both are checked against their exact expected AVD names. Use English UI and no native playback/download/voice owner. Do not start or reuse a separate original/user fixture merely because its serial is allowed.

Start the emulator separately. Pass a fresh UUID and the exact expected signed APK:

```powershell
./tools/android-focus-return/Invoke-FocusReturn.ps1 -RunId <fresh-uuid> -ExpectedApk <absolute-apk-path>
# Owned large-library fixture, three complete repetitions:
./tools/android-focus-return/Invoke-FocusReturn.ps1 -RunId <fresh-uuid> -ExpectedApk <absolute-apk-path> -Serial emulator-5564 -Cycles 3
```

`-ValidateOnly` prints the schedule without ADB or file mutations: 15 cases by default; `-Cycles` accepts 1–5 complete repetitions, with cycle IDs in the results. The actual run verifies AVD identity and the installed APK checksum before touching navigation, then tests notification-settings returns with ordinary, lock and Home variants and 0/50/150/300/600-ms requested spacing between warm Settings and Preflight intents. App process identity is checked before each return, before the warm intents and after observing the page, so a relaunch cannot silently count as success. The final page and Android ANR record are checked after every case. Timing includes ADB/UI-dump overhead; it is not frame latency, precise delivered-intent spacing or acoustic evidence.

The `lock` variant means a screen-off/wake sequence on this unsecured test AVD. It verifies and records Android's `Asleep` or `Dozing` display wakefulness before waking. Display `Dozing` is not proof of battery deep Doze, a secure lock screen, suspended JavaScript or long background retention.

Receipts, XML, app memory, guest pressure and results are retained under `.native-check/focus-return-<uuid>/`. Production-like images may deny shell access to guest pressure; its failed receipt and denial are retained and availability is marked false. Missing optional pressure telemetry does not count as an app failure or a successful reading. Each ADB command has a deadline. A still-running observer is recorded with PID/output paths in `pending-handles.json`; it is left running, and no scenario is restarted. Reconcile that exact process before proceeding. A pending observation or missing page is not automatically an app ANR. On failure, inspect the retained Android report/traces and available diagnostics; do not bypass it with rendering flags or claim a fix from a later successful run.

Android's UI dumper can also terminate with exit 0, a null-root error and no file. Capture requires confirmation that a new dump was written before pulling it. Up to three terminal unavailable dumps are re-observed with the same app PID; no navigation or app restart occurs between them. A live/pending observer throws immediately and is never retried by this logic. Existing wrong-page snapshots still fail the page assertion; they do not become successful observations through retries.

`./tools/android-focus-return/Test-Observation.ps1` runs offline failure-boundary fixtures against the actual capture/page functions: terminal null-root recovery, exhausted observations, pending handles, changed process, wrong page and wrong dump path. It contacts no ADB/device/provider and preserves its receipt under `.native-check/focus-observation-<uuid>/`.

The harness leaves the app on Preflight and leaves its own XML under `/sdcard/sc-focus-return-<uuid>-*.xml` for deliberate cleanup. Return to the original idle page, remove only that run's owned temporary files, and close only its AVD after retaining evidence. Never use a production device, change a real performer's notification choices or stop an existing native session for this test.

See [the investigation record](../../docs/focus-return-investigation-2026-10-24.md). A passing bounded run does not close the historic ANR or satisfy physical Android/iOS/customer-release gates.
