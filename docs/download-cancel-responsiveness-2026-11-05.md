# Responsive cancellation during download setup

The preceding checkpoint fixed same-name shows and transient editor/confirmation identity boundaries in the R7 test APK. R8 follows two missing evidence paths: startup timing and actual offline URL cancellation/retry. After clearing the open-ended goal, the owner explicitly approved finishing the pending Run/relaunch checks and delivery. This bounded close-out is now complete; it does not reactivate an automatic improvement goal or claim complete parity. No AI/provider request, decorative animation, public API, schema, playback default or GO/panic layout change was introduced by this fix.

## Plan

1. Preserve the checked R7 APK, canonical source and existing sixteen-show synthetic library. Take at most two guarded process-cold startup samples without UIAutomator during the measured launch. Observe the same process after a timeout; never restart simply because observation expired.
2. Trace startup boundaries before attributing the prior 53,955 ms delay. Current samples display at 20,862 ms and 30,900 ms. Much of the delay precedes `Running "main"`; neither sample identifies its cause. Voice model and downloader runtime initialization are not startup work. Keep this performance issue open rather than make a speculative fix.
3. Exercise the non-AI URL flow in a separate `R8-Offline-QA-20261105` show. Preserve existing shows/tuning, restore connection settings and original selection afterward, and verify cancel/back/retry behavior without starting show audio.
4. Fix the separately reproduced native downloader contention. Its initializer holds the same object monitor required by synchronous Cancel and job-history reads. Actual extracted Kotlin methods, with only a latch replacing initialization dependencies, prove both callers enter JVM BLOCKED state owned by the initializer. Separate runtime initialization serialization from the job-record monitor, retain checksum/atomic-file protections, and honor cancellation before starting subsequent URL work. Normalize uncoded lookup failures through existing download guidance, and keep accepted cancellation ahead of a concurrent error, including late JavaScript delivery. This is not evidence of the historical ANR's cause.
5. Add compiled native concurrency/cancellation regressions; run the required full checks and Android build/lint. Review the scoped change, install/hash the exact new test APK and validate the affected workflow. Promote only checked files and update the master evidence index so superseded findings do not become repeated work.

## Baseline and reproduced failures

Baseline APK: `EB539D9D03EE4BDDAE96733003F2E511FE7BE058AB678800F525576DCF010554`, independently verified on the owned Android 15 emulator. Baseline automated result: 1,609 tests / 87 suites and all eight required checks passing.

The immutable red native proof is `.native-check/r8-download-init-contention-red.json`, source hash `635C3A0517286C46D3F487F4C433DEE4DA6DFDB0BDC647708D007EC2CC6BA0D1`. Compilation succeeds; execution reports two responsiveness failures. Both operations complete only after initializer release; Cancel then records its flag. The fixture establishes lock behavior, not a real-device latency claim.

An installed offline lookup on R7 exposed a second failure: `UnknownHostException` reached the generic settings/Diagnostics guidance instead of an actionable connection/source error. The lookup finished before the attempted Cancel; that observation does **not** prove an installed Cancel success. A concurrent cancellation/error race was subsequently reproduced in both actual native method bodies and the JavaScript search function.

## Fixed in two targeted rounds

- Runtime initialization keeps its own lock. Cancel and history no longer require that initializer's monitor; extraction, checksum verification and atomic runtime replacement remain serialized. Search and download workers check accepted cancellation after initialization, before starting subsequent URL work.
- Search preserves existing `DOWNLOAD_*` errors and classifies otherwise uncoded failures as `DOWNLOAD_SOURCE_FAILED`. An accepted cancellation takes priority over a concurrent failure, including a native rejection delivered late to JavaScript. Non-cancelled error identity and listener cleanup remain covered.
- Existing failure guidance now says to check the internet connection and source access, retry, or choose another source. The same existing message is translated in all ten languages. No new control, animation, persisted field, playback default, AI request or GO/panic layout change was introduced.

The changed scope is eight files: four production files (native runtime, JavaScript downloader and two dictionaries), two regression files and two reports. No additional fix round was started for emulator failures or unresolved startup performance.

## Verification completed

The final frozen source passes **1,615 tests / 87 suites**, type, lint, architecture, translation and token checks. Translation parity covers 831 messages plus native OS copy in all ten languages. Native audio source checks, the existing nine download-completion cases and sixteen compiled initialization/cancellation/error cases pass. The six new JavaScript regressions failed in the intended cancelled cases on the baseline; the final focused downloader/panel set passes 117 tests. Final combined receipts are `.native-check/workflow-r8-checks.json`, `.native-check/r8-download-round2-result.json` and `.native-check/r8-js-cancel-result.json`.

The native checker executes extracted production Kotlin method bodies with observable I/O adapters and a latch replacing the initialization dependency. It verifies JVM lock ownership, serialization and cancellation admission. It does not execute the APK, benchmark actual runtime extraction, prove that an initializer or already-running DNS can be interrupted, establish the historical ANR's cause, or validate iOS.

Android release assembly and all four local native-module release lint checks pass (build `6478c9c1-2569-4565-9e76-00259522fd66`, exit 0). APK signature verification passes with internal/test signing. Packaged source proof matches the three changed Metro sources and the compiled release runtime; the runtime bytecode uses the separate lock rather than an object-synchronized initializer. Of 72 native/DEX/manifest/resource entries, 71 match R7; only `classes3.dex` changes. All 66 libraries/manifest/resources and the nine R7 UI sources remain identical. Test helpers are absent from the packaged bundle, manifest and DEX files. These comparisons preserve evidence scope; they do not replace installed workflow checks.

## Installed verification completed

The exact APK installs on the owned Android 15 emulator, and pulled/remote installed bytes match its SHA-256 before and after recovery and final relaunch. Initial acceptance was interrupted by emulator framework restarts, a system **Bluetooth keeps stopping** dialog and a **Settings isn't responding** dialog. A normal guest reboot subsequently reached an Android watchdog termination in `NetworkManagementService.systemReady` before Show Control was launched. The original live emulator was then stopped gracefully and restarted once using the same owned AVD, unchanged configuration and existing data files. Android boot completed, the package remained installed, and the saved library was visible. No factory reset, data clearing, uninstall, root operation, emulator recreation or speculative product fix was used. This recovery does not establish the cause of the historical app/focus incident.

The recovered installation passes the pending scoped checks:

| Check | Observed result |
| --- | --- |
| Saved library | Current R8 fixture and sixteen other shows remain visible. The original `WF-Setup-20261104`, reference `8A366A35`, still has three cues and its previous update time. |
| Offline HTTPS lookup | With networking deliberately disabled, the exact public beep URL produces the new connection/source guidance, with enabled Retry, Diagnostics and Dismiss. Diagnostics reports `DOWNLOAD_SOURCE_FAILED`. |
| Retry and active Cancel | From the still-mounted Finder, Retry starts a fresh lookup. Cancel is pressed using the freshly observed enabled native button; the screen returns to idle with Find sources enabled and no error. A later observation also has no stale cancellation failure. The earlier missed Cancel attempt is retained as a miss, not counted as a pass. |
| Valid URL/download/import | After a validated default connection returns, `https://actions.google.com/sounds/v1/alarms/beep_short.ogg` resolves to `beep_short`. Download & add completes through the normal media pipeline. The captured R8 section then contains exactly one cue, `beep_short`, at 1×. |
| Silent preparation | The original three-cue show prepares to Ready with zero of eight active sounds. Preflight checks use the existing synthetic, previously auditioned fixture; this is a bench attestation, not a venue or acoustic certification. |
| Ready GO and pause | Touch GO starts the first looped/trimmed/delayed cue. System media Pause leaves the same first song selected, with one paused sound. |
| Paused GO | The fixed GO/Resume control resumes that song. The app's own MediaSession reports `PLAYING(3)`; a subsequent system Pause again retains one sound and the same pointer. Unrelated Bluetooth sessions are excluded from this assertion. |
| Panic and recovery | During resumed loop playback, Fade 2s enters Recovery. Returning to the armed view shows Ready and zero active sounds, without starting another song. |
| Fixed controls | Ready, Paused and post-panic Ready retain GO bounds `[42,1582][1038,1855]` and panic bounds `[556,1403][1038,1550]`, matching R7. Paused and Recovery screenshots were visually inspected. |
| Exit and process relaunch | Stop and exit returns to Library. No active app service or app MediaSession remains. After an idle force-stop and relaunch, Library returns with the original show/reference, three cues and sixteen other shows; onboarding and audible-session restoration do not occur. |
| Final state | The app is left idle in Library. Airplane mode is off, Wi-Fi and mobile data are on, font scale is 1.0, rotation is portrait with auto-rotation enabled, and the original 1080×2400 / 420-density display settings remain. Default network 103 is validated. |

Only the separate R8 fixture gained a downloaded cue. Existing shows, music and tuning were not edited. No AI/provider request occurred. These results establish scoped emulator command/state behavior; the host emulator runs without acoustic output, so they do not prove audible quality, exact fade acoustics or physical-device reliability.

Device evidence is `.native-check/workflow-r8-acceptance.json`, `workflow-r8-finish-*.txt` and the native XML/PNG captures under `.native-check/final-closeout-device/wf-r8-recovered-*` and `wf-r8-finish-*`. Receipt paths are relative to the authoring checkout, `C:/Users/Administrator/Documents/ChatGPT/Computer Use/show-control-oms`. The original blocked captures and watchdog traces remain available with their original outcomes.

## Remaining issues and external gates

- A recoverable navigation/Retry limitation was observed: after a failed Finder search, expanding inline Diagnostics and pressing Android Back leaves Finder. Its global error notice can remain in Builder; Retry then clears the old failure without reopening/restarting the unmounted search. Returning to Find the right music and submitting the query works. Retry on the still-mounted Finder is verified above. This separate stale-owner UX issue is not fixed or concealed by the R8 cancellation fix.
- The two bounded R7 process-cold samples displayed after 20,862 ms and 30,900 ms; the original timed observation was 53,955 ms. Filesystem cache was uncontrolled, and neither sample identifies the cause. No startup optimization is claimed. Fast synthetic ADB text entry lost characters in the earlier unstable environment; complete inputs were verified before submission. Its cause remains unresolved.
- Physical Android/OEM, iOS/Xcode, exact remotes/Flic, real audio/HDMI, screen-reader use, cross-device restore, endurance and production/store gates remain external validation work. The broader claim that every UI workflow is flawless or parity complete is not established.

## Artifacts and closure

- Android test APK, with scoped installed acceptance completed: `Show-Control-Responsive-Download-Cancel-2026-11-05.apk`, 154,888,601 bytes, SHA-256 `E1C8408B3F7E9FC77EA0B9DC9096178651FB19F31687CEE2471A179661EEBD61`. Bundle SHA-256 `1C32E5C48BC5DD43E18D6018027C257FBBCD7026DC714D74477DBA14394F0A44`. Internal/test signing remains.
- Previous verified fallback: `Show-Control-Clear-Show-Identity-2026-11-04.apk`, SHA-256 `EB539D9D03EE4BDDAE96733003F2E511FE7BE058AB678800F525576DCF010554`.
- Package/install evidence: `.native-check/workflow-r8-package-proof.json`, `.native-check/workflow-r8-installed.json` and `.native-check/workflow-r8-after-framework-installed-hash.txt`. System-dialog captures are `.native-check/final-closeout-device/wf-r8-current.png` and `wf-r8-after-dismiss.png`; failed subsequent observations are `wf-r8-after-bluetooth-dialog` and `wf-r8-after-settings-dialog` in the same directory.

The owner-approved pending acceptance and Android test-build delivery are finished. This final continuation changed reports/evidence only; the checked production source and APK bytes remain unchanged. The open-ended goal was cleared and was not recreated. Stop after this delivery; the explicitly listed remaining issues and external gates are a separate task.
