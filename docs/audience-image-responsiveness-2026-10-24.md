# Audience image responsiveness · 24 October 2026

## Plan

The preceding goal turn made progress through direct protection repairs, committed-backup recovery, 938 tests and an exact installed internal APK. The customer-readiness goal remains active. The historical renderer/focus ANR still lacks an established root cause; do not label the following independent correction as its fix.

Source inspection finds disk-backed audience-image decoding on both platforms' UI queues. iOS also defers decode caching until rendering and reads renderer state in an asynchronous seek completion without an explicit main-queue hop.

1. Move audience-image decoding/downsampling to a bounded native worker on both platforms. Keep a single in-flight result and only the latest waiting request; never accumulate decoded images behind a busy UI queue.
2. Publish view changes only on the main queue. Cancel ownership on blackout/replacement/close; discard obsolete images and errors, including already-posted completions. Keep local-only media, 40-million-pixel validation, downsampling, visual fault isolation and audio/GO/panic ownership intact.
3. Reject output work after native module teardown and marshal iOS seek completion to the main queue with its existing renderer revision and pause guard.
4. Add deterministic native scheduling/resource regressions, run the full software and Android native checks, and exercise large-image/blackout/replacement behavior on an isolated virtual display with separate test-only instrumentation. No production fault endpoint, AI request, library/media mutation, permission or schema change.
5. Perform the scoped crit audit, promote verified files and deliver an immutable internal APK. Record iOS/Xcode, physical HDMI, timing and historical ANR gates honestly.

## Evidence

Both native audience renderers now decode and downsample still images away from the UI queue. The latest-request worker admits one decode/result and one waiting request; it waits for UI consumption or disposal before starting another decode. Blackout, replacement and close invalidate queued/already-decoded results and obsolete errors. Android recycles never-published stale bitmaps and closes the executor when the presentation stops. iOS releases stale CGImages through ARC and requests immediate decode caching, avoiding deferred image decompression at render time. The existing 1920-pixel display bound and 40-million-source-pixel limit remain, with fresh decode-time validation. No unbounded image cache was added.

View mutation remains on the main queue. iOS seek completion now returns to that queue before consulting its renderer revision/pause state. Both modules reject setup/preparation requests after teardown and ignore late output events. Audio, its command ownership, media paths, song/backup schemas, dependencies, permissions, translations and Run layout are unchanged. This corrects a concrete image-rendering risk; it does not establish the cause of the historical focus ANR. Other existing validation/video paths are not claimed to be entirely free of main-thread work.

## Artifact and automated evidence

The immutable internal APK is `Show-Control-Audience-Rendering-2026-10-24.apk`, 154,765,429 bytes, SHA-256 `261D287BE2BC54822A0ED25E3F4C379259F9B8214270742C5EFA78112476CEF6`. Signature verification passed with the existing internal/test certificate and provisional identity; arm64-v8a and x86_64 are included. The installed APK hash was checked by both test runs. All 66 shared-library/manifest/resource payloads match Protection Repairs; six DEX files changed. New native worker/decoder classes and the closing guard were found in packaged DEX. The JavaScript/UI bundle is byte-identical (`23B2BE9D5771916F776F8E82B1330350FC5F8FD2DEBAF8F25A2ED3E69EDAD964`). Test instrumentation and its fixture are verified absent from the delivered APK.

**Automated verified:** 941 tests in 64 suites, type, lint, architecture, tokens and 772-message/native-copy parity in ten languages. Eleven standalone Kotlin regressions execute the production worker and cover asynchronous admission/publication, 1,000 replacements with bounded backpressure, queued cancellation, already-posted result disposal, close, current/stale errors, rejected executors, reentrant replacement and actual worker-thread execution. Three new architecture checks guard the decoder/UI boundary, size bounds, teardown and iOS seek queue. Those source checks are not an iOS compilation pass.

Android native lint/release assembly passes. Visual-module lint retains three existing advisories: pinned Media3 version, optional KTX URI style and the translated test-pattern label composition. No new image-worker issue is reported. The full Jest log retains 45 existing React act warnings; it is not warning-free. Expo Doctor and iOS/Xcode were not run.

Final software receipt: `8a850456-c475-4028-a6ee-188ec9d3c998`. Final native build receipt: `ac5c69e3-4d31-4aa2-a164-994c07b52f06`. The first build was superseded after the scoped audit added closing-module setup guards; only the final immutable hash above is delivered.

## Installed Android evidence

Isolated `ShowControl_QA_API35`, API 35, host audio disabled. A separate same-signer [renderer helper](../tools/visual-image-probe/README.md) uses the actual private production Presentation on a private 640×360 virtual display. It checks image/pattern view bindings, not captured HDMI pixels; the audience window retains its secure flag. No production fault endpoint, audio command, original-media scan or credential access is involved.

| Case | Actual result |
| --- | --- |
| Large image | Owned 6000×4000 PNG (24MP, 101,467 bytes, SHA-256 `9EFB59A919AA42BC6CD1FD2704655716FD8B80523F0B156A97A8C3EE7909F387`) loaded through the production renderer as the expected 1500×1000 bitmap and color. |
| Blackout | Worker held before queued image work, then blackout. Releasing/settling work left the image blank with no stale fault. |
| Replacement by test pattern | Main-thread pattern remained usable while image work was held. Releasing work did not overwrite it. |
| Rapid replacement | Fifty large-image requests followed by the small green image published the final green binding without a fault. Standalone native tests separately prove the 1,000-request bound. |
| Damaged image/retry | Current malformed owned image produced one fault and blackout. Explicitly requesting the valid image succeeded with no additional fault. |
| Dismissal | Closing while work was queued left the presentation dismissed and blank, terminated the worker and produced no stale error. |
| Audited repeat | All six cases passed again after tightening helper ownership cleanup and installed-probe identity checks. Final run `b100f8ec-c0ba-4865-b65d-dbd94531f8d6` has a terminal success receipt, one intentional damaged-image fault and `ownedFilesRemoved=true`. No live observation was restarted after a deadline. |
| Normal app afterward | Helper uninstalled; virtual display released; original `OMS_smoke_test` and one cue retained. Silent Ready at position zero, foreground native service, panic→Recovery and deliberate exit passed. GO remains `[42,1582][1038,1855]`; panic remains `[556,1403][1038,1550]`. No playback was started in this normal-app check. |
| Cleanup | Original English/Dark Blue, font 1.0, portrait/auto-rotate, notification denial/flags, Saver/DND 0, no exemption and AC/100/normal heat retained. Only the helper's three known cache files/empty directory and owned device XML copies were removed. Original media, library tuning and keys were untouched. Native owners were released and the task emulator is verified closed. |

The final Android ANR record says none since boot. A malformed shell assertion during cleanup was corrected by explicitly reading/asserting the retained final ANR file; no app restart or production workaround was used to replace that check. This bounded non-reproduction does not close the historical incident.

Evidence remains under `.native-check/audience-image-*`, `.native-check/protection-v2-audience-image-*` and `.native-check/protection-pressure-audience-image-*`. The single scoped crit loop audited six native production files, two regression files, the separate helper and documentation. It fixed closing-module admission and helper cleanup/identity findings, then repeated software/native build checks and installed helper checks proportionally. No known critical/high issue was found in this delta; broader release gates remain open.

Android's [threading guidance](https://developer.android.com/guide/components/processes-and-threads) separates image decoding from UI updates; Apple's [image best practices](https://devstreaming-cdn.apple.com/videos/wwdc/2018/219mybpx95zm9x/219/219_image_and_graphics_best_practices.pdf) describe downsampling and immediate caching. These sources support the design, not a claim of measured latency or a historical root cause.

iOS source compilation/device evidence, physical HDMI/privacy and song/visual timing, actual low-memory/thermal behavior, exact audio/remotes, two-hour runs, the renderer/focus ANR, performer pilots and customer/store release remain unverified. The full customer-readiness goal remains active.
