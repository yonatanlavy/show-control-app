# Capture main-queue lifecycle probe

Separate same-public-test-signer Android instrumentation for the owned synthetic QA AVD and exact provisional target APK. Verify no native audio/voice service, preparation, diagnostics or user interaction before attaching; instrumentation can stop the target process. The probe also requires native idle admission. It is never shipped.

The same helper tests both immutable APKs. It creates one native HardwareKeyCapture and, on the real UI queue, requests Stop→Start and Suspend→Start before queued cleanup can run. A second main turn drains cleanup before checking native listening health. Old behavior returns false; fixed behavior remains true. It then stops the capture and verifies that the original Window.Callback was restored. No keys, semantic commands, audio, profiles, media, library, provider keys or receipts are accessed or changed.

Use a fresh UUID token per run. Preserve the result and instrumentation code: 1 is the expected old-APK regression, 0 is required for the updated APK. This is Android main-queue ownership evidence, not physical remote/HID, acoustic or iOS evidence. The result is one `capture-lifecycle-<token>.json` under target external files. On timeout, inspect the existing process/result without blindly restarting. Remove only the helper and exact token-owned result files after preserving local evidence.
