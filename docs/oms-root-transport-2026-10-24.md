# OMS root transport and admission · 24 October 2026

## Evidence and required result

The preceding [installed native matrix](native-work-readouts-2026-10-24.md) made verified progress and reproduced a release blocker: a main ordered group is reported Ready; another GO starts the same group instead of advancing. Group children deliberately cannot auto-follow or own the single primary audio cursor. Native transport must therefore own the root sequence separately from its individual voices. Preserve the existing legacy cue-stack selection/stop policy and independent Hits.

The root/admission implementation is now integrated into both native sources. The original repeated-GO defect is closed on the exact installed Android candidates below; this is not acceptance of the whole matrix or iOS. Customer readiness, physical Android/iOS, iOS/Xcode, the historical ANR and other release gates remain open. No AI/provider calls, new dependencies or persisted-show schema changes.

## Implementation order

1. Introduce matching native root/admission policies, with deterministic tests for contextual GO, aggregate group completion, cancellation, stale identities and voice capacity. A started group remains the main root until it completes or advances, even if a child ends or a later child has not started.
2. Tag main voices and pending actions with a root epoch; independent Hits have no main epoch. Epochs are runtime-only. Group children retain their root epoch while permission to auto-follow remains false. Selection, stop, panic and replacement invalidate staged work without invalidating preserved Hit activity.
3. Add bounded incoming preparation for group advancement. Android prepares paused private players; iOS validates/decodes local source segments before committing. Prepare the entire incoming group, not just its first child. Keep staged resources separate from active voices and system/visual output. A readiness timeout, decoder error or capacity refusal releases staging and preserves the outgoing root/selection for deliberate retry.
4. Reserve future independent-Hit capacity while staging. Non-overlapping group advancement can reuse outgoing main slots after their fade; independent active/reserved Hits plus the entire incoming group must fit eight voices. A Hit admitted during preparation must also satisfy the future limit. Never reclaim a Hit implicitly.
5. Once preparation succeeds, cancel remaining outgoing main actions and fade each outgoing main voice with its saved policy. Keep GO blocked through preparation/fades; Pause suspends transport timing, and panic/stop preempt everything. Commit the incoming root once, then schedule its delays/offsets and real playback on the native queue. Incoming visuals start only with actual incoming audio.
6. Complete a root group only after its own voices, deferred starts and timed control actions finish. Independent Hits do not delay or complete the root. Keep source clocks unavailable for groups. Natural completion selects the next item silently unless its existing autoplay setting permits a start; the final root never wraps.
7. Add a recoverable transition-refusal event and localized feedback. A refused incoming admission is distinct from an unsafe engine fault: retain native playback ownership, allow deliberate retry, clear transition/pending GO state and keep Stop/Panic available. Actual interruptions/faults retain deliberate recovery and never resume automatically.
8. Integrate both native implementations, run the complete required software/native checks, and build an immutable test APK. Reproduce the original GO case and the matrix below on the exact installed build; preserve the original library and clean only named synthetic fixtures. Record actual limitations rather than promoting policy tests or emulator state into physical-device proof.

## Acceptance matrix

- Root identity: group versus one audio voice, independent same-content Hit, pending child only, child ending before later starts, final child completion, looping child, cancelled completion callback and last-root no-wrap.
- Commands: first GO, GO during group playback, GO during initial delay/preparation/outgoing fade, repeated/held GO, paused group/paused countdown resume, Previous/selection, global Stop/Panic and stale remote/session actions.
- Admission: group→audio, group→group, incoming delay, child offsets and auto-follow suppression, zero-audio control group, empty group, eight outgoing main voices, active/reserved Hits, capacity refusal, missing/corrupt incoming media, decoder timeout, route loss, background/foreground and process death during staging.
- Output/UI: truthful main playing/transition/selection state, no staged audio/visual/clock, actual-start audience cut, complete refusal feedback/manual retry, group voice-count visibility, and unchanged GO/panic geometry.

## Verification record

The implementation uses a main-root epoch separately from the child voices and the global session generation. A group stays active through child gaps and completes only when its own voices and actions finish. Incoming preparation stays private and bounded before an outgoing root is disturbed. Known admission failures retain the outgoing root and return a recoverable refusal; real interruption/fault recovery remains mandatory. Stop, panic, selection and session replacement invalidate staging. Independent Hits retain their own ownership and capacity reservations. Android's prepared zero-PCM media-button owner and the [protection/pressure work](show-protection-pressure-2026-10-24.md) are preserved. The older `.native-check/oms-root-deferred` experiment was not restored.

### Final internal artifact and software checks

`Show-Control-Root-Transport-2026-10-24-c2.apk` is 154,725,689 bytes, SHA-256 `E7EED0D3CA6300CA1FF9A05C2526A87F10113F006CB83EC5169CC29E64F5B09D`. The final download alias `Show-Control-Show-Protection-and-Transport-2026-10-24.apk` has identical bytes. Packaged/generated bundle SHA-256: `CA7E180615869484AB4F72ACE642F67C84724F19DFB93567A352A55C7F0F1971`. Signature verification passed using the existing internal/test certificate and provisional package identity; arm64-v8a and x86_64 are included. The pulled installed APK matched the candidate. This is an internal test build, not production signing or store readiness.

Final checks passed: **805 tests / 60 suites**, type, lint, architecture, generated tokens, 759 messages plus native-copy parity in all ten languages, and native background/transport/ownership/media/remote/root-policy regressions. Android strict native lint and release APK assembly passed. Six production TypeScript sources matched the frozen package map or type erasure; the compiled source/test ledger matched authoring and promotion. Existing React `act` warnings remain. A new UI test fixture initially omitted a required capacity-event field; type checking blocked the build, the fixture was corrected, and the full checks reran successfully.

Candidate c1 used the same native source hashes and passed the broader matrix below. c2 adds only the Rehearsal warning correction and its tests: recoverable refusal now displays the actual localized reason and permits retry, while genuine interruption still requests re-preparation. Its exact installed tests repeat capacity/refusal/retry and performance group advancement. No Run layout code changed.

### Installed observations

Isolated `ShowControl_QA_API35`, serial emulator-5562, no audio output. All observations are UI/native-state evidence, not audible timing, physical remotes or manufacturer retention proof. Preflight acknowledgements were simulated synthetic setup, not audition/venue certification.

| Scenario | Observed result / candidate |
| --- | --- |
| Normal backup import | Canonically validated synthetic ZIP restored one show, six playlists, 21 audio cues and two media references alongside the original show; c1. |
| Ready and independent Hit | Silent preparation retained 0/8; starting an independent loop gave 1/8 without moving the main selection; c1. |
| Original group restart defect | Group A started with one child and an independent Hit. GO at 2.580 seconds, before the 12-second child, advanced to Group B. Three extra transition presses did not queue another advance; c1. |
| Cancelled late child / aggregate completion | At 49.786 seconds after initial GO, only the independent Hit remained, Group B had completed, and After groups was selected silently. The cancelled A child did not start; c1. |
| Eight independent voices | Eight Hit voices remained alive after main GO was refused. Stop then deliberate GO started the eight-voice main group; c1 and c2. |
| Refusal feedback | c1 exposed incorrect generic re-preparation advice. Corrected c2 showed “Next cue unavailable · Current cue kept · Retry GO”, retained 8/8 and enabled GO; no false recovery instruction. |
| Reuse outgoing main slots | Eight main voices advanced to the incoming cue. c2 retained a paused pre-play countdown, then a deliberate resume produced exactly one incoming voice and the expected source position. |
| Control-only cancellation | A zero-audio control group cancelled a future child and completed to silent Manual hold, without leaving transition state stuck; c1. Empty groups were separately rejected by canonical validation and were not imported. |
| Manual and automatic waits | Manual hold required GO. The 1.2-second automatic hold started the final cue once; pausing retained its position; c1. |
| Final no-wrap | Natural final completion had 0/8 and disabled Complete. Another native NEXT did not restart the playlist; c1. |
| Delayed crossfade and rate/trim | Pausing a four-second delay retained outgoing position 1.048 seconds and one voice. It remained paused beyond the five-second preparation timeout. Resume followed by rapid extra GO reached a paused two-voice overlap with the 2× incoming cue at source 1.885 seconds; c1. This is state/rate evidence, not measured pitch or fade envelopes. |
| Paused overlap / rapid GO / panic | Contextual GO resumed overlap, extra presses did not advance it, and pause retained two voices. Panic returned to 0/8 at incoming trim start; a later check remained clear; c1. |
| Legacy compatibility | Legacy first completion left the group next. Advancing that group retained its old voice alongside the next cue, with the next cue's measured clock; c1. |
| Locked grouped playback / call | Locked native NEXT started Group A. The earliest call snapshot still reported Playing; the settled state reported Recovery required, disabled GO and paused media. Ending the local simulated call did not resume audio; c1. No instantaneous-call-detection claim. |
| Exact c2 Run group advance | Early GO plus three extras advanced once to Group B, ordinal 2/4. Pause, locked media resume/pause and foreground return retained Group B without command replay. |
| Silent Previous and panic | c2 Previous selected Group A silently. Panic remained available and opened Recovery; explicit exit ended the session. |
| Safety geometry | Six Ready/Paused/locked-return/interrupted snapshots matched GO `[42,1582][1038,1855]` and panic `[556,1403][1038,1550]`. Rehearsal's fixed footer also retained its original bounds through refusal and overlap. |
| Cold relaunch | Exact c2 relaunch returned to Library with no audio service, notification, media owner or automatic cue start. |
| Cleanup | Only Root transport QA was soft-deleted into recoverable trash. Original OMS_smoke_test and its synthetic song remained selected; no original media bytes or keys were edited. Device settings and no-call state were checked before task-emulator shutdown. The final idle Library warning card was visually inspected and offered Review show protection; no playback service/notification/media owner remained after exit. |

### Additional deterministic boundaries

The production root-policy regressions cover the following additional edges separately from installed-device evidence: no primary clock on a group; pending-child-only root; one remaining sibling; root launch in progress; held manual root; no root; full-group readiness before fade; duplicate/unknown readiness callback; old generation; old root epoch; pause before fade; pause before commit; repeated commit; refusal before admission; refusal after fade rejected; cancellation twice; readiness after panic; outgoing voice still fading; elapsed delay with outgoing voice; absent/negative capacity; reserved independent Hits; new Hit stealing future capacity; zero-audio preparation; nine-voice gate rejection. Runtime/provider tests cover stale refusal, strict structured recoverable errors, retained foreground refusal, and fatal interruption priority. Remote-coordinator tests include 100 concurrent urgent-stop/admission races.

### Audit and remaining gates

The current `crit` loop reviewed the scoped native/runtime delta and UI callers, corrected the Rehearsal feedback found in installed testing, and reran verification. React review retained derived warning state, existing effect cleanup, full localized assistive labels and fixed controls. No schema, dependencies, permissions, music content, keys or AI requests were added.

Incoming decoder corruption/timeout still needs installed fault-injection evidence. The release denies `run-as`; the task emulator also rejects root. Those two read/access attempts did not modify any file. The unique corruption fixture was never changed. Pure admission-policy tests and reviewed cleanup code are not a decoder-failure device pass. Full group-gap/late-callback combinations, route/process death during staging, visual-start timing, exact hardware input, audible source/fade/loop timing and long-run stability also remain open.

Subsequent evidence: [the robustness follow-up](native-robustness-2026-10-24.md) exercised single/group incoming decoder corruption and deliberate retry through a separate same-signer instrumentation APK. Only the known synthetic fixture was changed and exactly restored. That closes the bounded Android corruption case missing from this initial matrix; timeout, physical/iOS and the other listed gates remain open.

iOS includes matching source policy and admission handling but has **no Xcode/Swift build or device evidence on this Windows host**. The historic rendering/focus ANR remains separately tracked. Physical Android/iOS, manufacturer sleep/autostart behavior, HDMI, microphones/Flic, cross-platform restore and two-hour runs are still required. The original Android group-restart reproduction is closed; whole-app parity and 1,000-customer readiness are not claimed.

Immutable candidates, build/check/source/signature receipts, synthetic fixtures and UI/native observations are retained under `.native-check/oms-root-integration-*`, `.native-check/protection-v2-root-c1-*`, `.native-check/protection-v2-root-c2-*` and `.native-check/protection-pressure-root-*`.
