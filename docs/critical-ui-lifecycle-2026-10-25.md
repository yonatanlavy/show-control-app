# Critical-session UI lifetime · 25 October 2026

## Plan

The preceding goal turn was progress: E-66 completed native admission/request ownership, durable save-before-confirm delivery, 1,147 shared tests, actual-module/runtime checks, an exact signed Android candidate and installed no-op admission/unavailable-store evidence. Its owned emulator is confirmed closed. Physical/iOS/store/privacy/customer readiness remains unproven.

This pass tests mounted preparation surfaces across critical-session transitions. A synchronous safety getter protects an action when pressed but does not by itself notify a memoized or retained React component. Reproduce stale rendering and idle re-entry before changing production code.

1. Preserve current source, the real music library, existing immutable/native transport contracts and all unrelated dirty work. Use synthetic UI/store fixtures only; no AI, purchases, receipts or credentials.
2. If reproduced, provide a dependency-free change subscription for the existing boolean gate and a narrow UI hook. Notify only when the boolean changes; observer failure must never prevent the safety write or other observers. Keep React, store, networking and timing out of the runtime gate.
3. Use that hook on retained cache-only and idle promotion surfaces, preserve fresh action/admission checks, and cancel stale focused work. Preparation/Recovery/Run geometry, native command ownership, persistence and translations must remain unchanged.
4. Cover entering/leaving critical state while mounted, cache-only routes, blur/refocus, pending responses, repeated values, observer teardown/failure and a real synthetic ShowSession. Run type/lint/full tests, architecture, translations and token checks; perform the single final crit loop.
5. Build a new immutable internal Android APK from checked sources, compare native payloads and stable safety UI, verify the installed non-AI navigation/preparation path, and record exact evidence and remaining physical/iOS gates. Do not reuse a stale build or claim 1,000-customer readiness.

## Reproduced and fixed

Four targeted tests failed against the preceding source: retained Library placement after preparation starts, retained cache-only Rehearsal placement, retained cache-only Preflight placement, and a panel mounted while critical remaining blank after deliberate Exit. Existing imperative action checks still blocked store calls; a stale rendered panel was not evidence of an admitted native checkout.

The existing critical boolean now has dependency-free change observation. It writes the safety state first, notifies only boolean transitions, contains observer exceptions, skips removed observers, gives duplicate registrations independent cleanup, and makes cleanup idempotent. A UI-only `useSyncExternalStore` hook observes that narrow boolean. It neither subscribes to source-position progress nor imports React/store/network code into the gate. The cache-only and idle wrappers use it; fresh imperative/native admission remains mandatory. Pending product callbacks also recheck the current critical predicate before changing display state.

No native, audio scheduling, cue/schema, media, backup, entitlement persistence, permissions, dependency, translation, theme or safety-layout change. Existing late paid-result persistence and deferred confirmation tests remain passing; no actual transaction was used.

## Automated evidence

The four-case red run is retained in `.native-check/critical-ui-red-tests.json` and its log. The final focused run passes **67 tests** in two suites with zero console errors. **14 cases are added**: eight retained-screen cases and six observer-lifetime cases. Existing tests were corrected to flush actual React updates and unmount before resetting the global gate, rather than suppressing warnings.

The full frozen candidate passes **1,161 tests in 72 suites**, type checking, zero-warning lint, architecture, **797-message/native-copy parity in all ten languages**, and design-token checks. Results and six changed-source hashes are retained in `.native-check/critical-ui-checks.json` and `.native-check/critical-ui-source-ledger.json`. The full suite still emits 46 pre-existing act warnings in unrelated BackgroundReliabilityPanel/Controllers/Library/SongEditor/VirtualizedList fixtures, versus 47 in E-66. These are not labelled warning-free or silently suppressed. The affected focused suite is clean.

| Combination | Actual evidence |
| --- | --- |
| Retained idle placement + preparation without parent render | Red before fix, hidden after fix |
| Retained Rehearsal + critical preparation | Red before fix, hidden and no store read after fix |
| Retained Preflight + critical preparation | Red before fix, hidden and no store read after fix |
| Panel initially critical + deliberate Exit | Red before fix, fresh idle metadata after fix |
| Cache-only surface + 20 Prepare/Exit cycles | Placement returns, same cache object and one original save, zero store calls |
| Native observer + preparation + late callback + Exit | Cleanup once; late callback ignored; fresh idle subscription/read |
| Pending product metadata + critical round trip + newer price | Old price cannot overwrite current metadata |
| Blurred retained panel + Exit + refocus | Zero store calls until refocused, then one fresh load |
| Broken observer + healthy observer | Safety write and healthy observations both survive |
| Repeated registration/removal, removal during publication, late subscription and nested state transition | Independent/idempotent teardown and newest boolean retained |

The single `crit` audit inspects only this turn's six source/test files, new evidence record and build/verification automation. Native baselines and stable Run source hashes are checked separately. A green UI fixture is not physical audio, iOS, store or customer evidence.

## Build and installed evidence

The fresh offline Android release build and strict audio/commerce library release lint pass. Terminal run: `.native-check/critical-ui-build-e80e2a67-8b70-4fdf-9b9e-7bcc264bc96b.json` and its log. All **72 native libraries/DEX/manifest/resource payloads** match E-66 exactly. Packaged shared source matches the frozen six-file ledger and unchanged live UI. No iOS compiler was available; the shared change does not establish an iOS build/device result.

Internal/test APK: `Show-Control-Session-UI-2026-10-25.apk`, **154,853,645 bytes**, SHA-256 **D3374A9C3EB25A7D24BC9A0FE490BF4854B2BF9146C1E38DB4F7062516726D57**. Bundle SHA-256: `4FF99CB7AF075637099529DCC728CAD219B0E9AD0E34EF0857D89D0893D6CC4E`. Existing internal/test certificate, provisional `app.showcontrol.working`, version 0.1.0/code 1; arm64/x86_64 retained. The installed base APK checksum matches.

On the owned API-35 emulator, the preserved synthetic library and selected `OMS_smoke_test` opened normally. Settings correctly reported an unavailable storefront and disabled purchasing without a price. Explicit Rehearsal Prepare stayed Ready at source position `0:00.000`, zero of eight active sounds; the quiet ongoing foreground service used notification 1001. Current-APK screenshots and native accessibility trees were inspected. The exact bounds match E-66: GO `[32,2033][1049,2306]`, Stop `[32,1875][530,2001]`, Fade `[551,1875][1049,2001]`.

Deliberate Exit removed the audio service. Returning to Settings produced the populated unavailable-store panel with enabled, reachable Retry/Restore and disabled price-less purchase. Shows navigation returned to the same synthetic selection. This proves the installed navigation/preparation path, not the identity of a retained React instance; the no-parent-render lifetime failures are proved separately by the actual component regressions. Device results are `.native-check/critical-ui-installed-results.json`; XML/screenshots, signature, packaged-source and unchanged-payload ledgers are retained alongside it.

The real music library was not used or modified. No AI/provider call, actual transaction, receipt/key inspection, settings change or physical device was involved. The owned test emulator is closed after recording cleanup. The E-65 closure protection and E-66 native admission/delivery fixes remain included. Physical/OEM/HDMI/controller/Flic, iOS/Xcode, cross-platform restore, historical focus ANR, two-hour runs, SDK privacy, configured store and performer/customer gates remain open. This remains an internal test candidate, not a 1,000-customer release claim.
