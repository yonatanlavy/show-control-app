# Rehearsal current/next-song clarity

## Plan and evidence boundary

E-72 is concrete progress: a native capture race reproduced and fixed, 1,249 passing shared tests and exact installed Android evidence. Customer acceptance remains open. The historical Android focus trace was re-read: main waits in RenderProxy.setStopped, RenderThread enters JNI from FrameCommitWrapper, managed/async queues are idle and guest system pressure is recorded. These observations still do not establish a production code fix. No speculative renderer flag or freeze-fix claim belongs to this pass.

The exact E-72 installed portrait Rehearsal capture shows a separate, actionable problem: the always-expanded waveform and jump/replay controls push NEXT below the visible reading area. The fixed safety footer remains reachable. Improve that real screen without hiding core status or changing transport.

1. Keep artwork, current identity, native clocks, state/voice count and the next-song summary ahead of secondary controls. Use the existing semantic Surface, CueTitle and accessible Disclosure components. Seek/replay is one deliberate expansion; group/non-audio replay remains available.
2. Load waveform data only while its tools are open. A late waveform result cannot update a closed or replaced view. Preserve exact source-time seek bounds, trim, rate, paused/countdown safety and existing Retry. Opening/closing tools never issues transport or edits the immutable revision.
3. Add mounted real-provider acceptance cases for default collapsed tools/no media read, explicit expansion, collapse/reopen, source changes/stale replies, native progress, failure/Retry, non-audio/final cues, interruption/exit, legacy and ten-language labels. Existing seeking tests must explicitly open the tools.
4. Run the complete shared checks and proportional architecture/translation/token checks. Build a new signed internal Android APK, verify native payloads and unchanged Run/footer geometry, and inspect exact installed EN/HE/AR, large text, landscape, themes, native controls and safe exit. No AI/provider request or real-library change.
5. Run one project crit loop, promote only scoped paths and record exact evidence. Physical accessibility, iOS/Xcode, historical ANR, OEM/audio/remote/HDMI, two-hour and customer/store gates remain open.

## Results

Completed source checks: 62 focused mounted-provider cases and 1,269 full tests / 73 suites; type, lint, architecture, ten-language translation (802 messages plus native OS copy) and token checks pass. Installed current/next, expandable tools, exact paused source-time seeking, EN/HE/AR, three themes and settled 1.5× landscape were inspected. Rehearsal footer remains byte-identical to the baseline; Run's safety controls retain their layout. The finite close-out also corrected misleading call-recovery advice and disabled native-paused Hits before dispatch. See [final Android close-out](android-final-closeout-2026-10-25.md) for exact APK, installed evidence, limitations and stopping rule.
