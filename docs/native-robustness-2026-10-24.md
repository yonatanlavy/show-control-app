# Native robustness follow-up · 24 October 2026

## Plan and baseline

The previous goal turn made verified progress: root/group transport, recoverable refusal, exact installed Android checks and an immutable APK. The broad customer-readiness objective remains active. This pass targets missing real-engine failure evidence and the historical app-visible rendering/focus ANR. It does not change music, provider keys, permissions, schema, production signing or GO/panic geometry, and makes no AI requests.

Baseline: `Show-Control-Show-Protection-and-Transport-2026-10-24.apk`, SHA-256 `E7EED0D3CA6300CA1FF9A05C2526A87F10113F006CB83EC5169CC29E64F5B09D`; compiled source/tests still match the preceding frozen ledger. The old ANR captures the UI thread waiting in Android RenderProxy/setStopped and RenderThread waiting in FrameCommitWrapper/ART coordination. This does not prove either an application cause or a host-only cause.

1. Reuse the isolated API-35 emulator and exact immutable APK; record initial library/settings/process state. Exercise warm navigation, external-settings returns, lock/foreground and preflight without playing real media. Preserve a new trace if a freeze occurs; do not apply speculative renderer flags or call a non-reproduction a fix.
2. Add a separate same-signer Android instrumentation helper, not bundled in the app. Android [instrumentation](https://developer.android.com/reference/android/app/Instrumentation) runs on its own thread against the target application; [same-certificate signing](https://source.android.com/docs/core/tests/development/instr-app-e2e) authorizes the target. Keep the delivered APK byte-identical rather than enabling a debug runtime or adding a production fault endpoint.
3. The helper may change only the known synthetic 20-second fixture with SHA-256 `ef235e9eaef2e5e9f27f4d34cd7ceb6f0b82de9b1781b36436c85d32d15adcdb`. Require one canonical app-owned file, bounded size, expected bytes, a session token and monotonic command sequence. Embed the exact original fixture for checksum-verified atomic restoration. Restore on normal finish, timeout or helper failure; preserve a recovery route after process death. Reject arbitrary paths, unexpected file contents and operations outside this fixture.
4. With an outgoing loop running, corrupt only that incoming fixture, press GO, and inspect playback, selection, capacity and recoverable refusal. Restore exact bytes and retry deliberately. Exercise stop/late callbacks and process interruption where the test mechanism permits. Record that instrumentation itself changes process observability and does not measure audible/physical timing.
5. Fix reproducible app defects on both native platforms, preserving legacy semantics and independent Hits. Run proportional repository checks and native builds for any code change. Audit the scoped delta with `crit`; restore the original library/settings, remove the helper and close only the task emulator.

## Results

The installed decoder-refusal and group-refusal cases passed, including deliberate retry and exact media restoration. Twenty normal-process warm navigations plus four app-information/lock returns recorded no new ANR. This does not close the historical rendering ANR. A separate, concrete navigation issue was found: the shared bottom navigation always pushes new stack entries. Retained primary screens can accumulate through ordinary tab use. The deep-link stress also increased PSS, but that observation alone does not prove a leak or the ANR's cause.

Extend this pass to fix primary navigation with the installed router's `dismissTo` operation: pop to an existing target, or replace the current screen when absent. Child-page Back remains separate; the song editor hides primary navigation while drafts are open. Add real StackRouter history regressions, repeat actual bottom-tab switching, run software/build checks, and issue an immutable updated APK. No layout, text, tokens or live controls change. Physical Android/iOS, Xcode, actual audio/display/remote hardware, long runs and the other parity/release gates remain open.

## Verified change and artifact

The shared bottom navigation now uses `router.dismissTo` instead of `push`. It reuses an existing primary target or replaces the current route if the target is absent. It does not pile up duplicate primary screens. The current-tab no-op and highlighted-parent navigation from child pages remain supported. No live navigation, draft, audio, persistence or visual layout code changed.

`Show-Control-Navigation-Reliability-2026-10-24-c1.apk` and its final download alias `Show-Control-Navigation-Reliability-2026-10-24.apk` have identical bytes: **154,725,693 bytes**, SHA-256 `12545A3CA540E0FD56993A7BEB47A8C5004644D1C253536414A71A175FF7A55E`. Embedded/generated bundle SHA-256: `288D46553D1DDCFFA26451436AA42106F90CDBF46AF548FAAC0CE45A1C7BB421`. Signature verification passed with the existing internal/test certificate and provisional identity. Both arm64-v8a and x86_64 remain included. This is an internal test APK, not a customer/store release.

All **72 checked DEX, native-library, manifest and resource payloads are byte-identical** to the prior protection/transport APK. The separate probe is not shipped. Seven frozen production TypeScript sources matched the package source map or type erasure. The installed candidate identity is checked separately from its filename.

Final software checks passed: **807 tests in 60 suites**, type, lint, architecture, token generation, and 759 messages/native-copy parity in all ten languages. Android strict native lint/release assembly passed, 1,050 tasks. Existing 45 React `act` warnings remain; the helper's Java-8 compile emits three obsolete-source/target warnings. Dependencies, lockfile and native sources did not change; Expo Doctor, Xcode and physical-device tests were not rerun. The first full check caught test-only partial-state typing and a controller mock missing the new router method; both were corrected before the complete passing rerun and build.

## Installed evidence

Isolated API-35 emulator, no audio output. Preflight acknowledgements were synthetic setup, not acoustic/venue certification. Decoder tests used the exact previous APK under separate instrumentation; the final APK's matching native payloads preserve that implementation. Navigation and safety checks used the exact final candidate without instrumentation.

| Case | Actual observation |
| --- | --- |
| Single incoming decoder failure | After normal preparation and outgoing-loop start, the helper replaced only the known incoming WAV with the bounded damaged payload. ExoPlayer logged `UnrecognizedInputFormatException`. The outgoing cue/selection and one voice were retained, with recoverable retry feedback. Pause remained usable; no fatal recovery state. |
| Deliberate single-cue retry | Exact original SHA-256 was restored. GO resumed the paused outgoing cue; a separate GO advanced. The incoming cue started once at its trim-relative position, with one native voice and no stale warning. |
| One bad child in an incoming group | The two-child group was refused as a whole. No prepared good child became an active voice; outgoing cue, one voice and retry access remained. |
| Repaired group | After restoration and deliberate retry, the first child started, the later child joined at its offset, and Paused showed 2/8. Panic cleared both to 0/8; explicit exit released the session. |
| Probe safety/cleanup | Corruption and restoration receipts recorded expected hashes. Normal finish returned instrumentation code 0 with original bytes and `corruptActive:false`. Audited stricter scan/storage checks rebuilt, signed and passed locate/finish smoke. Both probe installations were removed. No debug flag or production fault endpoint was added. |
| Normal-process warm navigation | After removing instrumentation, 20 observed routes across Preflight/Settings/Controllers/Builder/Rehearsal, four system app-information returns and four lock returns passed. Each return restored the expected app page. Final Android record reported no ANR since boot. |
| Historical freeze | Not reproduced in this bounded run. The prior renderer/ART trace remains unresolved. PSS rose from 138,023 to 250,660 KB during deep-link route stacking; that is not proof of a leak, causation or a fixed memory budget. |
| Old primary navigation | On the old APK, three actual More→Shows round trips left history behind: Android Back returned to Backstage. |
| New primary navigation | On final candidate, 20 actual bottom-tab switches each reached the expected page. Back left the primary root instead of traversing old tabs. Regression tests also exercise 250 switches, 20 rapid presses, an absent target and reuse of an existing Builder identity. |
| Child Back and Hebrew | Settings Back returned to More. Hebrew Settings→More→Shows worked with mirrored primary navigation and complete labels. English was restored afterward. This is not a full new ten-language visual audit. |
| Safety geometry | Final Ready/Paused Run retained GO `[42,1582][1038,1855]` and panic `[556,1403][1038,1550]`. Native GO/pause worked, panic stayed available, and explicit exit returned to Library. |
| Data cleanup | Root transport QA and Group admission fault QA were soft-deleted. Original OMS_smoke_test and its one original synthetic song remained selected. Only the unique QA payload was temporarily changed and checksum-restored; original show media and secure keys were not edited. |

The navigation harness initially checked the last settings/lock return indirectly. The audit added explicit page and final-ANR assertions, and independently checked all four captured returns before accepting the result. The helper audit tightened its count bound to include files and rejects absent external control storage; the audited helper was rebuilt and smoke-tested.

## Remaining work and scope limits

The renderer/focus ANR is still open. Installed decoder timeout, process death/route loss during staging, audible timing/loops/fades, physical Android/iOS, Xcode, exact remotes/Flic, HDMI/microphones, cross-platform restore and two-hour/pilot runs remain gates. No claim of complete parity or readiness for 1,000 customers is made. The goal remains active.

A separate non-live usability follow-up was observed: language-save feedback can occupy the Preflight action-bar area. Its visual impact needs confirmation and reserved-space treatment; Run suppresses this feedback during critical sessions. This is recorded for the next UI refinement, not attributed to the navigation change.

The current `crit` loop audited the scoped tool/UI delta, affected navigation callers, real router behavior, safe fixture restoration and evidence claims. All compiled source/test hashes were retained and only scoped files were promoted. Source/binary/check/build/installed receipts and observations are under `.native-check/robustness-*`, `.native-check/fault-c2-*` and `.native-check/probe-*`. The reusable test helper is in [tools/native-fault-probe](../tools/native-fault-probe/README.md).
