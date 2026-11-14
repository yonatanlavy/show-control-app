# Live control and rehearsal refinement · 24 October 2026

## Plan and scope

The preceding goal turn made verified progress: ongoing background status, native system controls, 11-minute locked retention with visible return, task-removal retention, denied-permission playback and an exact internal APK. The complete customer-readiness goal remains active.

1. Correct touch Pause admission when native OMS main selection is Ready but independent Hits remain active. Share the healthy-state rule between the real session command handler and Run/Rehearsal. Preserve recovery fences and native scheduling.
2. Give the prepared rehearsal title full reading width, with mode and Exit in a separate wrapping action row. Keep the existing footer, GO/panic positions, semantic tokens, ten languages and no decorative motion.
3. Label paused countdown GO as Resume without guessing an incoming song from the outgoing selection. Show the remaining countdown and retain native resume semantics. No persisted schema or native contract changes.
4. Add failing regressions before correction, run repository checks, review affected React surfaces and the current-turn diff, then build and inspect the updated Android package. Preserve the library and prior APK. No AI/provider requests.

## Verification and remaining gates

Implementation and observed results follow below. Physical Android/iOS, exact remotes/Flic, audible output, HDMI/microphones, two-hour runs, historical rendering/focus ANR and full release/parity gates remain open. Software tests and emulator layouts do not certify distribution to 1,000 customers.

## Implemented and reviewed

Run, Rehearsal and the real session handler share healthy Pause/Resume admission. Independent native voices can be paused while the main pointer remains Ready/stopped; idle silence remains disabled. Interruption/fault and native-owner inspection do not reopen playback, and Touch Guard still disables the touch control. Commands remain serialized semantic native PAUSE/RESUME; no pointer, scheduling or saved tuning is changed optimistically.

Paused countdown GO shows Resume plus remaining countdown time, without guessing a pending song from the current outgoing selection. When native state has no current main cue, Hit-only resume names the Hits bank rather than suggesting the selected main song will start. Both surfaces reuse existing ten-language messages. Rehearsal Seek and ten-second controls require measured native main progress, preventing controls from appearing before the first measurement or after a main voice ends while a Hit remains.

The prepared rehearsal header separates mode/Exit from the full-width title and locked-version caption. Landscape inspection exposed the old wrapping footer's three-plus-one arrangement. Explicit Previous/Pause and Stop/Panic rows now preserve semantic order and the separated safety corner. Existing tokens, capped safety typography, assistive labels and no-motion policy remain. The footer does not scroll. No native source, persisted schema, dependency, permission or AI/provider request changed.

The current-turn audit reviewed the six existing source/test files against captured pre-turn copies, plus this record and the checklist update. React review covered unconditional hooks, existing effect cleanup, render-only derived state, accessible disabled controls, event-owned commands and unchanged native timing. Unrelated dirty work was preserved. The final audit was invoked once and its findings were corrected within that loop.

## Regression and build evidence

Before correction, six new cases failed: two runtime Hit-only admission cases, both real-provider UI surfaces for Hit pause, and both surfaces' outgoing-countdown label. The additional unmeasured-Seek regression also failed before correction. Installed testing then exposed the misleading Hit-resume song label; both updated UI cases failed before that correction. The raw failures are retained, rather than counted as passing checks.

The final source passes whole-project types, lint, all 752 cases in 57 suites with zero failed/pending, architecture, token consistency and 736-message/native-copy parity in ten languages. Tests include Ready/stopped Hit pause, native-only phase confirmation, resume without advancement, idle silence, retained counts after interruption, Touch Guard, eight-voice UI admission, measurement loss, paused countdown GO and safety access. The required checks cover the changed shared runtime and UI; they are not physical playback proof.

Strict Android audio-module release lint and application release assembly passed in 1m25s: 1,050 tasks, 45 executed. The internal artifact is `Show-Control-Live-Controls-2026-10-24-v3.apk`, 154,671,685 bytes, SHA-256 `6868F24FED6CDC9F707C6058897FD98BBE9056AA114878EF88E70B1B43DD6511`. Both arm64-v8a and x86_64 payloads and the existing test signature verify. It retains the provisional application identity/version and is not a store release.

The embedded interface bundle is `828B9842E83272C758C971BB11923BCABD19CAAE5D3D244706B862C8386059CB`, equal to the generated bundle and fifteen exact source-map records. The native DEX remains byte-identical to the prior system-control APK (`10CDBAB5F9434EF70695651F8E951000BAECE795E80F84242FD37EDB3E805921`), retaining eleven settlement admission guards and eleven conversion rollback sites. Pulled installed base.apk matches the exact final APK hash. Pre-package source freezes stay immutable; documentation-only results are promoted separately after packaging.

## Installed observations and preservation

The final APK updated the task-owned API 35 emulator without wiping data and cold-launched silently in 1,517 ms, process 5699. The original show and synthetic QA fixture survived. Earlier candidates are investigative evidence: the first still named the selected main song during Hit-only resume; the second retained the landscape three-plus-one footer. Neither is the delivered candidate.

On the final APK, a single independent looping Hit enabled touch Pause while main selection stayed Ready. Touch Pause produced native PAUSED; touch Resume returned to PLAYING; Stop returned to native PAUSED at zero and the same selected main song. The final resume label was Resume · Hits bank, and main Seek remained disabled. No main GO was used in that Hit-only cycle.

A separate explicit GO started the synthetic short outgoing song at 2× with a five-second incoming delay. Pause displayed Resume · Countdown paused · 5s remaining, with panic still available. Stop cancelled it; after the original deadline, Ready, zero voices and the same selection remained. Real-provider software cases additionally verify that the countdown Resume button dispatches one native GO without relabelling it as a new song start. This installed case did not independently measure audible overlap or countdown-resume timing.

English, Hebrew and Arabic layouts were inspected. Hebrew Hit controls were exercised on the preceding candidate with identical handlers; final Arabic portrait/landscape and final English 2× system text screenshots confirm readable headers and explicit footer rows. These observations do not certify every string, screen reader or device. GO matched the preceding portrait bounds `[32,2033][1049,2306]`. Panic retained the same lower-right slot and stayed fixed across final Ready, paused countdown, Hit pause and 2× text at `[551,1875][1049,2001]`; the earlier package rendered it one pixel lower. Both safety controls remained outside scrolling content. Landscape now has paired equal-width rows instead of three-plus-one wrapping.

The synthetic Readout QA show was restored only for testing, then returned to recoverable trash through its named management sheet and confirmation. Original OMS_smoke_test remained intact and selected, with its one original thirty-second synthetic cue. English, Dark Blue, font scale 1.0, rotation 0, automatic rotation 1, DND 0 and the original denied notification permission were retained/restored. Exit released the audio service before final force-stop. No listed fatal/foreground/settlement signal appeared in the captured final-process log; the historical rendering/focus ANR remains unresolved.

One attempted batch of unobserved navigation taps was rejected by automatic approval review because a later tap could reach a destructive library action. No action from that rejected command ran. Subsequent steps inspected each current screen and the named synthetic-show confirmation; cleanup completed through that safer route. No approval remains pending.

Further native-state work is needed for touch Pause during an independent Hit's pre-play delay with zero voices, and for definitive Hit-only labelling when a legacy playlist retains its ended main pointer. The current bridge does not expose pending Hit work or a definitive active-main identity; this pass does not infer those states from a plausible clock. Stop/panic remain available. These cases remain part of the complete readiness goal.

Raw checks, frozen/promoted hashes, package/source/DEX bindings, hierarchies, screenshots, native session dumps, restored settings and the final scoped audit are retained under `.native-check/live-controls-*`. The emulator has no audio output. Physical Android/iOS, audible quality, OEM restrictions, exact controllers, HDMI/microphones, two-hour runs and the full parity/release requirements remain unaccepted. The complete customer-readiness goal remains active.
