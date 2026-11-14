# Native work observations and ownership · 24 October 2026

## Plan and scope

Continue the full customer-readiness goal. The preceding pass made verified progress: active-Hit touch pause/resume, truthful paused-countdown labels, measured-only Seek, a readable rehearsal header and paired landscape controls. Its recorded pending-Hit and retained legacy-pointer gaps remain to be corrected here.

1. Add read-only native observations for pending pauseable work and active voices owned by the ordered sequence. Count suspended iOS actions as pending, retain unknown values for older bridges, validate adoption, and clear observations on recovery/reset. No persisted schema change or JavaScript playback scheduling.
2. Separate main-sequence ownership from permission to auto-advance. Ordered group children belong to the main sequence without independently advancing it. OMS Previous/selection stops those children and their pending work, preserving independent Hit groups. Legacy selection retains its existing full-stack stop. Apply matching Android/iOS source behavior.
3. Use the observations for touch Pause during a delayed Hit, generic scheduled-work resume, accurate Hit-only labels after a retained legacy main ends, and rejection of stale main clocks. Preserve GO/panic geometry, offline operation and native timing.
4. Reproduce failures with runtime/real-provider regressions, exercise native ownership policy, run required software/native checks, build the Android APK and test actual delayed-Hit/legacy/group scenarios on the isolated emulator. Preserve the original library and prior APK; no AI/provider calls.

## Evidence boundaries

Results will be recorded after verification. iOS/Xcode, physical Android/iOS audio, exact remotes/Flic, HDMI/microphones, two-hour runs, historical rendering/focus ANR and the complete release/parity gates remain open. Neither source parity nor an emulator proves readiness for 1,000 customers.

## Continuation evidence

### Installed native matrix plan

Use the exact installed show-protection APK first. Build a canonical, checksum/CRC-validated ZIP containing only a new synthetic `Native work QA` show with three playlists and the existing original 30-second tone. Restore through the normal system picker, which adds independent show identities; preserve the original library and settings. Exercise delayed-Hit pause before voice start, suspension past the original deadline, explicit resume, stale cancellation, retained legacy main clocks, group ownership/cancellation, independent pending Hits, no child auto-follow, and Stop/Panic. Record native/UI evidence and fix reproduced defects before building a new candidate. Clean up only the named synthetic show through recoverable deletion. No provider requests or direct database edits.

The subsequent [show-protection pass](show-protection-2026-10-24.md) retained this work, corrected the deliberate invalid-native-payload test cast, and built it into that exact APK. Its 775-test suite included the delayed-Hit/retained-pointer/adoption/readout regressions; native ownership policy passed and Android compiled/linted successfully. The following installed matrix extends that evidence. iOS remains compile-unverified and physical acceptance remains open.

## Installed matrix and group readout refinement

The current internal test APK is `Show-Control-Native-Playback-2026-10-24.apk`, 154,689,089 bytes, SHA-256 `EA489992647C05D872E15501F76B512912AC79622182312BB8A8CFF49C78B836`. The installed base APK matches. Its bundle SHA-256 is `B3FD740D471FDA74F3097F61EFE09431E15EC2ABD3AECF734AA4677408CB3674`; signature and both ABIs passed. Eighteen embedded Metro sources match reviewed source; all 70 native DEX/shared-library payloads match the preceding show-protection APK byte for byte.

One UI defect was reproduced before the fix: a current group cue hid the active-sound count. Rehearsal now retains the same semantic metric for non-audio cues, without inventing a clock or exposing seeking. This changes scrolling readout content only; the footer remains fixed. A real-provider regression covers count changes from three sounds to one and the independent-Hits Resume label. A runtime regression rejects late progress after native main ownership reaches zero.

**Automated verified:** 777 tests in 58 suites, type/lint/architecture, 744-message/native-copy translation parity, generated tokens, Android background/ownership/media/remote policy regressions and native release lint/build. The pre-fix focused run failed only the missing group count (1 failed / 34 passed); the completed suite passes. The project `crit` audit and React review cover this small UI/test change, native evidence and scoped promotion; the broader transport finding below remains a customer-release blocker.

**Simulator/emulator verified**, isolated API 35, no audio output:

| Case | Result and evidence |
| --- | --- |
| Canonical fixtures | ZIP writer/parser, manifest/compiler, CRC and SHA-256 validated. `Native work QA` contains three playlists; separate `OMS group QA` tests mode-specific selection. Restore used the system picker and retained the original show. Only the original synthetic tone was used. |
| Delayed Hit before voice start | A 20-second Hit enabled touch Pause with zero active sounds and no main playback. Paused at about 15.5 seconds, it still showed zero sounds 51.6 seconds after the original trigger. |
| Resume suspended work | Large action read Resume · Scheduled actions. Resume first retained zero sounds during the remaining delay, then started one independent sound while the main selection stayed Ready. |
| Panic pending Hit | Pending work observed, then panic at about 2.5 seconds. Pause disabled, count remained zero 60.2 seconds after the trigger; no stale start. Active-Hit Stop also cleared the sound. |
| Retained legacy main | Independent looping Hit started, one-second main played and ended. Paused count was 1/8; elapsed/remaining were Not measured, seeking/back/forward disabled, action Resume · Hits bank. Resume retained one sound and the next legacy pointer. |
| Legacy group compatibility | Two sounds before Previous; Previous stopped the whole stack, including independent group activity. This is the existing legacy selection branch, not an OMS ownership failure. |
| OMS group ownership | Two sounds before Previous. Previous occurred 4.75 seconds after main group start, before the ordered 12-second child and independent 20-second child. Count became one, then two independent sounds; at 97 seconds the preceding main remained silently selected. Pause read Resume · Hits bank, corroborating zero main-owned voices. |
| Non-audio group readout | New full-width Active sounds metric observed at 0, 1 and 2/8; no audio clock or waveform seek for a group. Original fixed Previous/Pause/Stop/Fade/GO footer coordinates retained across observations. |
| Safety and cleanup | Global Stop/Panic remained available. Both named temporary shows were deleted through their observed recoverable confirmations. Original `OMS_smoke_test` and one cue retained; keys/user media untouched, no provider requests. |

Delayed-Hit observations used the preceding exact show-protection build; its native payloads are identical to the current candidate. Retained-main, group/UI and repeat-GO observations used the current exact installed APK. Evidence is retained under `.native-check/native-matrix-*`, canonical-fixture proofs and UI hierarchies/screenshots. This is state/lifecycle evidence, not audible timing or physical-device proof.

## Open customer-release blocker: ordered groups in OMS transport

The installed matrix exposed a broader native transport defect outside the readout fix. An ordered group in an OMS playlist reports Ready despite active ordered voices. A deliberate second GO after 4.41 seconds starts the same group again: Active sounds increases from 1 to 2 before the deferred child's 12-second deadline; selection and GO target remain the group. No independent Hits were active in this reproduction. Global Stop safely clears it.

Android's contextual GO checks `mainVoiceId`, which group children do not own, rather than the root main sequence. Corresponding iOS source has the same single-primary-voice assumption, but its behavior is not runtime verified here. The next native refinement must give the root sequence a coherent playing/completion/advance lifecycle, retain independent Hits and legacy compatibility, preserve admission/recovery guarantees, and test group delays/completion/repeated GO on both platforms. Do not label this candidate customer-ready or complete OMS parity.

Natural group completion/child auto-follow, maximum-capacity groups and admission failure need dedicated installed tests beyond the passing ownership policies. All earlier physical Android/iOS, licensed Flic/named remotes, output, long-run, cross-platform restore and historical ANR gates remain open.
