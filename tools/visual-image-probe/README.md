# Audience image renderer probe

Separate same-signer Android instrumentation for the private ShowControl_QA_API35 AVD, emulator-5562. It is never included in a delivered APK and adds no production fault endpoint, permission, network request or audio command. Instrumentation starts a fresh target process: **run only while the app is idle**, using the wrapper below, never on a customer device or during a prepared show.

Build with build.ps1, explicit SDK/JDK/public test-keystore paths, the generated synthetic 6000×4000 PNG, its SHA-256, the exact target APK and a new output directory. The build verifies the target and probe certificates. Install the target and probe separately, then call:

    ./tools/visual-image-probe/invoke.ps1 -RunId <fresh-uuid> -ExpectedApk <absolute-apk-path> -ProbeMetadata <probe-output/metadata.json>

The wrapper refuses a different AVD/target/probe APK, active instrumentation or any active target service. Each run retains its exact ADB process handle and output. An observation deadline leaves that process running and preserves pending-handle.json; reconcile that same PID before continuing. Do not restart a live observer or target merely because a deadline expired.

The probe constructs the actual private production AudiencePresentation on an isolated private virtual display. ImageReader drains only that owned display; it does not capture the phone or another app. Six cases cover real 24MP downsampling, blackout, a responsive test pattern while the image worker is held, fifty rapid replacements, damaged-image failure/retry, and dismissal/worker release. Reflecting private fields ties this helper to the current implementation; rebuild and audit it after changes.

Files are created only in a fresh canonical cache/visual-image-qa-UUID directory. The embedded large image is checksum-verified; the tiny green and malformed images are generated there. No library scan, media edit or credential access occurs. Normal/failure cleanup removes only these three known files and their empty directory, then releases its presentation, virtual display and reader. A killed process cannot run finally: preserve the terminal evidence and inspect only that exact owned cache directory before deliberate cleanup; never clear app data.

Require six passing cases, ownedFilesRemoved=true and instrumentation success. Assertions inspect the production image/pattern view binding, not captured HDMI pixels; the audience window retains its secure-output flag. Uninstall the probe afterward, cold-launch the normal app and verify its original library and idle ownership. Instrumented virtual output is not physical HDMI, acoustic, end-to-end song/visual timing, iOS, long-run or historical-ANR proof. See [the plan and evidence](../../docs/audience-image-responsiveness-2026-10-24.md).
