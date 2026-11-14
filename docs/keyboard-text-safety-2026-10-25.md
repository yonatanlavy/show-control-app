# Keyboard text-entry safety

## Plan and acceptance

E-70 made verified progress on closure protection. This pass addresses a higher-risk native input gap: generic keyboard keys can currently dispatch mapped show commands while a native text editor is focused. Reproduce the actual Android Window callback with SDK stubs before changing it; distinguish this from physical-HID evidence.

1. Add mirrored bounded native text-input gates. Ordinary typing retains editor handling without raw bridge/history events. A key pressed while editing stays blocked from controller dispatch after blur until release; Android's Window callback also consumes that held key outside the editor. Assigned stop/panic, media, Flic and silent diagnostics retain their appropriate paths. iOS GameController is an observer and does not swallow UIKit events.
2. Detect native focus on Android's event/UI queue and iOS's main keyboard queue. Cache only a boolean for the synchronous bridge entry point; no text, view inventory or asynchronous transport is retained. Unknown/detached focus is conservative. Clear held state without logging suppressed keys.
3. Add ten-language remote guidance, regressions for focus changes/repeats/multiple devices/safety/diagnostics/disconnect/overflow, Android module build/lint and exact installed observations as available. No schema/profile migration, library/media edit, AI request, safety-layout change or automatic playback.
4. Run one project crit loop and scoped promotion. Preserve E-70's notice/protection and all unrelated edits. Keep full customer acceptance open until actual hardware, iOS, physical audio, historical ANR, long-run and release gates pass.

## Implementation and safety review

Android's actual Window callback previously consumed a mapped Space while an editor was focused. Its production source, compiled with minimal SDK/runtime boundary stubs, failed the new regression before the change. It now observes `currentFocus.onCheckIsTextEditor()` and main-queue global focus changes. The synchronous Expo forwarding entry uses that native boolean, so it neither queries Views off-thread nor queues a later command. Failed/detached observations are conservative.

The controller runtime serializes binding lookup and the typing gate before emission. Suppressed inputs clear only their native held/bounce state and never reach command creation, raw bridge events, sequence counters or controller history. Latches are per device/key. A typed key remains blocked after blur until release; a subsequent fresh press is eligible. Assigned `PANIC_FADE`/`STOP_ALL` still use existing repeat/bounce/epoch admission. Media/Flic paths remain outside the gate. Explicit idle diagnostics can learn/test fresh keys. More than 256 simultaneously held typing identities fails closed for ordinary shortcuts until capture/disconnect reset; safety and touch remain available. This is bounded transient input state, not a library/profile limit.

iOS has the corresponding pure gate under its existing input lock. Its main keyboard queue probes only the first responder's `UITextInput` conformance through public [UIApplication action routing](https://developer.apple.com/documentation/uikit/uiapplication/sendaction(_:to:from:for:)); it reads no text or view inventory. Native text begin/end notifications refresh a locked boolean for bridge threads, with a post-resignation observation. That queued work contains no key or transport command. Background/stop invalidate focus and remove observations. The GameController callback is an observer: UIKit/Full Keyboard Access activation remains a distinct device/accessibility gate.

Android's [editor check](https://developer.android.com/reference/android/widget/TextView#onCheckIsTextEditor()) is inherited by this build's ReactEditText; its source has no contrary override. No persisted schema/profile, song/media, audio timing, dependency, permission, notification or GO/panic layout changes are made. Keys are not read from secure fields, assembled into text, persisted or exported.

## Automated and native build evidence

- The original callback regression failed with `Typing Space was consumed ... instead of reaching the editor`; the corrected actual callback passes. SDK stubs establish callback wiring, not real HID delivery.
- The callback harness also covers native focus-cache updates, held repeats/up after blur, fresh release, separate devices, assigned panic/stop, OS volume/media/internal-device delegation, unsupported/null-device input, failed focus reads, disconnect reset, repeated attach, listener removal, suspend/reattach, detached bridge calls and explicit silent diagnostics.
- **128** fresh/held/safety policy scenarios pass, plus overflow/release/reset checks. Existing native ownership, transport failure, system-media, command-epoch and background tests remain passing.
- **1,249 shared tests / 73 suites**, type, zero-warning ESLint, architecture, **801 ten-language messages/native copy**, and tokens pass. Ten added UI cases cover the new setup guidance. Earlier full-suite React act/VirtualizedList diagnostics remain; there is no warning-free-renderer claim.
- Android offline release build plus strict audio/controller/commerce lint passes in **3m 33s**. DEX contains the new native gate/disposition/editor-check symbols. **66 shared-library/manifest/resource payloads** match E-70; DEX changes are expected. Both changed production JS/TSX source-map hashes match source. Run, primitives and prepared Rehearsal source hashes remain unchanged.
- The Swift policy regression source is prepared but **not executed**. iOS/UIKit compilation is unavailable on this Windows host.

## Exact installed Android evidence

Internal/test APK: `Show-Control-Keyboard-Safety-2026-10-25.apk`, **154,870,681 bytes**, signature verified, provisional app identity/version. SHA-256: `20AB443F20A0540EBCB8517B5345DAB715F5C7701140D83312AD7BB1AD24299E`. Bundle: `F5282958357B9E43F86AD83FF69CEDFC8E3539DCAAD062FDC517E2B9735649E0`. Installed base APK matches on owned API-35 `ShowControl_LibraryLoad_QA` / `emulator-5564`.

The separate same-test-signer [native focus probe](../tools/keyboard-text-probe/README.md) passes with `INSTRUMENTATION_CODE: 0`. It uses a real native text field, production HardwareKeyCapture bridge entry, controller runtime and command coordinator, a synthetic profile/fake armed flag and an isolated receiver. Focused typing/held repeats produce zero raw events or semantic broadcasts; release and a fresh GO, panic and stop produce exactly **three** broadcasts and **six** raw down/up events. Its profile is restored. No actual audio preparation, provider, persistent profile or library edit occurs. This proves synthetic native admission/focus, not external-HID or acoustic delivery. Final helper source hash: `8B0BC0476114918E5BCF45B523211CAA7DA18DEEAD04DD213FD2DCC3EA3F3D8C`.

Normal UI testing runs separately after instrumentation finishes:

| Flow | Observed result |
| --- | --- |
| Open existing synthetic Rehearsal | Original 1,200 songs/200 Hits remain; setup has no audio service. Explicit Prepare enters Ready at zero sounds. |
| Native media Next / Pause / Resume | Next starts the synthetic cue. Resume then Pause retains **1.277 seconds**, one active sound, and native Paused state. No acoustic claim. |
| Touch panic / Exit | Fade returns to Ready/zero sounds; Exit releases the audio service. |
| Fixed safety geometry | GO `[32,2033][1049,2306]`, Stop `[32,1875][530,2001]`, Fade `[551,1875][1049,2001]`, unchanged across observed states. |
| Remotes / custom keyboard | New guidance renders fully in the existing Purple Night card with reachable system-settings action. No setup audio service or new permission prompt. |
| Return and cleanup | Library retains the original synthetic show. No audio service and no ANR since this owned boot. Original notification flags, font 1.0, Saver 0 and DND 0 remain. Eleven exact owned remote files and only the helper removed; local evidence/data retained; owned AVD shut down. |

The first installed probe ended with result code 1 before input testing because it assumed Library had configured controller capture. Idle Library intentionally does not. The corrected probe explicitly supplies ephemeral native setup, without starting Flic or audio; only `installed-probe-v2` is accepted. An initial ignored build-helper quoting/parser error was corrected before the successful native build. Neither is counted as product validation or a product crash.

## Audit and remaining customer gates

The single current-turn crit loop reviews native ownership/lock order, focus observation, held-key privacy, lifecycle cleanup, media/safety isolation, exact packaging, helper setup/teardown and scoped promotion. No known critical/high finding remains in this delta. All unrelated/user edits, music and E-70 protection remain intact. No AI requests were made.

Customer acceptance is still **open**. The historical Android focus ANR is unresolved; non-reproduction is not a fix. iOS/Xcode, UIKit/Full Keyboard Access, physical keyboards/remotes/Flic and licensed SDK, wired/Bluetooth/audio/HDMI/microphone, cross-platform restore, two-hour runs, privacy/store/pilot and broader parity gates remain required. Neither SDK stubs nor the synthetic native receiver establish named hardware support or suitability for 1,000 customers.
