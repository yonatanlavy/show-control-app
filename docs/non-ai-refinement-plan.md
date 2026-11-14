# Owner-approved non-AI refinement · 14 October 2026

Implement the accepted plan in order: finish per-song editor and isolated silent paused audition; correct native loop/crossfade/capacity/route recovery; add full native sequence Rehearsal and playlist summaries; refine audience display, backup, session stopwatch, navigation and help; verify and promote scoped source changes to C:/dev/personal/show-control-app.

Existing voice data and cloud features are preserved but excluded from this pass. No provider calls or secret reads. No decorative animation, dependency addition, user-library replacement, persisted-schema change, or live GO/panic geometry change.

Prepared Rehearsal uses the same immutable native snapshot, semantic commands, timing and safety gate as performance. Runtime sessionPurpose is performance by default or rehearsal; no audible start during preparation. Both modes block editing until explicit stop/shutdown. Preview initialPaused creates an inaudible native voice rather than playing and then pausing.

Verification records at least 25 edge cases and 10 combinations from the accepted plan, full type/lint/unit/architecture/translation/token checks, Android native build and emulator evidence. iOS/Xcode and physical audio/HDMI/controllers/cross-platform restore/two-hour gates remain explicit; compilation and mocks never substitute for them.
