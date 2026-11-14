# Rehearsal workspace · 24 October 2026

## Plan

The preceding pass made verified progress on library recovery and an Android backup round trip (E-58). The full readiness goal remains active. This pass addresses Rehearsal's unbounded native row mounting and buried controls; it does not attribute the historical renderer/ART freeze to them.

1. Establish a before/after baseline with an owned synthetic 1,200-song/200-Hit show on the separate test device. Preserve its other fixture shows and the original emulator library. Record real mounted native views separately from UIAutomator's pruned tree.
2. Reuse the source-owned collection/search system for a windowed, searchable preparation list. Keep the complete playlist/order, native silent Prepare and immutable prepared revision. Prepared Playback, Choose a song and Hits tabs bring their controls directly into the readout; prepared selection remains silent and Hits remain independent. Prepared tabs use no soft keyboard or modal over safety controls.
3. Compact artwork, native clocks, seeking and next-song hierarchy; keep detailed tuning available through disclosure. Preserve the exact footer/control styles and native command/timing ownership. Disable ordinary actions in fault/interrupted/exit states while retaining both emergency controls. Reset only local pane/query state when its show/set/native generation changes.
4. Apply the React component review and repository design/token checks. Add meaningful large-list/search, native-state, tab/selection/Hit, recovery and stale-state regressions; run full software and Android build checks. Inspect the exact APK in all three themes, English/Hebrew/Arabic, large text and both orientations, with fixed GO/panic geometry. No decorative animation, provider requests or changes to user media/defaults.

## Delivered behavior

Preparation reuses shared name/notes search with Unicode normalization, original song ordinals and separate song/Hit sections. Search does not filter the native snapshot: preparing from a last-song-only result still captures all 1,200 songs and 200 Hits and selects the first song silently. Prepared Playback, Choose a song and Hits bank tabs have windowed rows, distinguish duplicate names by spoken ordinal/duration, retain live native phase/voice feedback and contain no text field or modal. Song selection stays silent; Hits never move the main pointer. Scope/generation changes reset local navigation without issuing commands.

The readout has compact artwork, native elapsed/remaining clocks, seeking, replay, next-song identity and saved-behavior disclosure. Fault/interruption/exit disable ordinary actions while Stop all and Fade all remain available. The original safety footer remains fixed; Previous additionally respects that safety gate. Hebrew/Arabic active-sound ratios use directional isolation with an unchanged plain spoken label.

An early installed candidate exposed a real keyboard failure: Prepare was covered, and tapping its reported XML bounds entered text into the focused search instead. The shared preparation shell now owns keyboard avoidance for content, feedback and action bar. Ordinary navigation hides while typing, feedback uses the measured available height, and nested collections avoid double shrinking. Critical layouts disable shell avoidance and dismiss the keyboard. Final installed search keeps the entire Prepare target above the keyboard, and an explicit press prepares silently and dismisses it.

## Automated and measured evidence

The first baseline run retained 32 passes and four failures. The final rehearsal software candidate passed **1,031 tests in 66 suites**, type, lint, architecture, **779-message/native-copy parity in all ten languages**, tokens and strict Android native lint/release assembly. The cumulative [localized protection candidate](show-protection-language-2026-10-24.md) adds language-capture/packaging coverage and passes **1,049 tests in 68 suites**. Logs retain React `act` warnings and are not warning-free. Expo Doctor's separate 20/21 result and framework patch advisory are recorded there; dependencies, song schemas, defaults and user media were unchanged. Initial ambiguous test queries, native-layout fake events and a 5-second large real-provider test timeout were corrected explicitly; the 200-cue integration test has a local 10-second budget, which is not an audio-performance claim.

Read-only, separate same-test-signer instrumentation counted actual mounted Android views on the same isolated API-35 synthetic 1,200-song/200-Hit fixture. It opened the ordinary Rehearsal route, used SQLite read-only, verified original show/trash/revision rows before and after, preserved selection and closed its activity. Nothing from the helper is shipped.

| Exact measurement | Mounted song/Hit rows | Total Android views |
| --- | ---: | ---: |
| Previous background-warning APK | 1,200 | 3,669 |
| Rehearsal v2, final windowing/keyboard implementation | 45 | 302 |
| Final cumulative protection APK | 45 | 302 |

These are bounded-view observations on an emulator, not device-speed or audio benchmarks. The v2 measurement targets APK SHA-256 `92557071BF510E52D8287E37BB536E74720C989C7CCA53C046E739EDD63620CF`. All 72 native/DEX/manifest/resource payloads were unchanged from E-59. The subsequent cumulative APK's identity and any repeated measurement are recorded in the linked protection-language report.

## Installed workflow observations

Isolated `ShowControl_LibraryLoad_QA`, API 35, host audio disabled, existing synthetic shows only. No AI/provider requests or real user media changes.

| Scenario | Observation |
| --- | --- |
| Search with keyboard visible | Song 1199 matches as ordinal 1200 / one of 1,400; Prepare remains a full target above the keyboard. Preparation captures the complete order and remains at source zero. |
| Silent song choice | Selecting song 0001 updates the native pointer, current title and GO label without starting a voice. |
| Independent Hit | Trigger then native Media Pause retains one of eight voices and “Resume · Hits bank”; main selection stays 0001. Stop clears the Hit without advancing selection. |
| Main playback / pause | Explicit GO and native Pause hold a measured 718-ms position. Back/Forward clamp UI source seeking to zero / 7,999 ms on the eight-second fixture and remain paused. One immediate OS media-cursor observation lagged the UI; instant OS cursor publication was not established. |
| Panic / Exit | Panic from paused clears voices and seeking; normal Exit removes service, notice and media ownership. |
| Themes / RTL / large text | English/Purple Night, Hebrew/Dark Blue at 150% and Arabic/Cobra inspected on device. Reading areas scroll, seek controls and Exit remain reachable, and landscape retains the full safety footer. No screen-reader or physical-ergonomics pass is implied. |
| Fixed portrait controls | GO `[32,2033][1049,2306]`, Fade all `[551,1875][1049,2001]`, Stop all `[32,1875][530,2001]` match across ordinary, Hebrew large-text and Arabic states. Main Run's screen/layout and shared Button/styles remain unchanged. |

Receipts remain under `.native-check/rehearsal-workspace-*`, `library-load-ui-rw-*` and the guarded `collection-probe-*` runs. The final source ledger, source-map/native-payload proof and exact artifact record distinguish the rehearsal v2 measurement from the cumulative protection build. The single current-turn `crit` audit and React component review cover the scoped list, keyboard, recovery, RTL and native notification changes; unrelated dirty work is preserved.

iOS/Xcode, physical audio/accessibility/OEM devices, named remotes, HDMI, genuine decoder/storage faults, cross-platform restore, two-hour runs, the historical renderer/focus ANR and pilot/customer/store gates remain open. List windowing is not claimed to fix that unresolved historical ANR.
