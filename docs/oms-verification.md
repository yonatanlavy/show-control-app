# OMS parity verification record

Recorded 13 October 2026 for the implementation in `C:\dev\personal\show-control-app`. Scope is the owner-approved [OMS contract](oms-parity.md); each capability is mapped in the [parity checklist](oms-parity-checklist.md).

**Acceptance remains open.** Android implementation has compiled and run in an emulator. iOS source is implemented but has not compiled on this Windows host. Automated fixtures, source assertions and an emulator do not replace paired physical-device evidence. No store publication occurred. The owner's latest test scope excluded AI: no live assistant, artwork/music provider request or speech inference was performed. Provider fixtures use mocks.

The subsequent [protection refresh](show-protection-refresh-2026-10-24.md) and [feedback layout](feedback-layout-2026-10-24.md) share an exact installed internal candidate: 824 tests / 61 suites, required type/lint/architecture/translation/token/native-policy checks and Android lint/release build. Active preparation warnings refresh quietly; native ongoing protection and silent recovery remain intact. Reserved feedback space clears Arm and keeps recovery controls reachable in settled large-text landscape and Hebrew layouts. The reports record the source/APK identity, observed emulator cases, existing test warnings and open physical/iOS/ANR/pilot gates. Earlier counts below retain their historical scope.

The [installed readiness-timeout follow-up](native-readiness-timeout-2026-10-24.md) keeps that APK unchanged. A separate same-test-signer instrument withholds only synthetic incoming READY callbacks, proving single/partial-group refusal, retained outgoing identity, deliberate child-specific retry, pause, panic/Stop cleanup and stale-callback rejection in bounded API-35 cases. All three instruments finished cleanly and were removed. Fresh software checks retain 824 passing tests; genuine decoder hangs, staging route/process loss, physical/iOS and the broader release gates remain open.

Latest 24 October follow-up: [root transport and admission](oms-root-transport-2026-10-24.md), 805 tests / 60 suites, all required software checks and Android native lint/release build. The exact installed final APK closes the original Android group-restart case, fixes recoverable Rehearsal feedback, retains show protection and fixed GO/panic geometry. Its report separates emulator observations, deterministic policy coverage and open decoder/iOS/physical/ANR gates. Earlier counts below remain historical evidence for their respective passes.

## Source and environment

The subsequent [24 October robustness pass](native-robustness-2026-10-24.md) records 807 passing tests, real incoming decoder failures under a separate test instrument, bounded primary navigation and exact final-candidate checks. Its 20 installed bottom-tab switches, child Back, Hebrew navigation and fixed safety geometry passed. The earlier renderer ANR was not reproduced and remains open. Earlier test counts retain their historical scope.

- Existing project preserved; authored changes were prepared in an isolated local checkout and promoted with per-file SHA-256 checks. The original had no Git repository. Unrelated original edits were not overwritten; replaced source versions were preserved outside the app.
- Windows host; Android SDK with API 36 emulator, Android Studio's bundled JDK and Android NDK 27.1.12297006. App package remains `app.showcontrol.working`.
- Expo 57.0.28, React Native 0.86.3 and the 22 SDK-recommended package patches aligned; pnpm 11.16.0, frozen lockfile. Lock SHA-256: `828ED4F19D58F29F531F06117882E874A4747113E6B846BAB35D5DFAF983BC8B`.
- `pnpm-workspace.yaml` selects hoisted dependencies, disables dependency lifecycle scripts and keeps dependency installation explicit instead of mutating Metro's tree during a check/start command. pnpm 11 does not read linker settings from `.npmrc`; its automatic pre-script install and the previous incomplete generated workspace file caused a verification invocation to replace the layout. Restored frozen hoisted dependencies and corrected the source-owned configuration. See [pnpm 11 configuration migration](https://github.com/pnpm/pnpm.io/blob/main/blog/releases/11.0.md).
- Speech preparation explicitly checks out whisper.cpp v1.9.5, commit `d1be6fde11ac6e0407606b4e42fe72d34add8037`. Native vendor/build directories are generated and excluded from authored source promotion.
- Setup downloads multilingual `ggml-base.bin`, 147,951,465 bytes, SHA-256 `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`; interruption and checksum failure cannot activate an incomplete model. Actual recognition and corpus benchmarks remain pending.

## Automated checks

Checks run against the implemented source, not only the original scaffold:

| Check | Result / evidence |
| --- | --- |
| TypeScript `tsc --noEmit` | Passed |
| ESLint `eslint . --max-warnings=0` | Passed |
| Jest complete suite | Passed: 176 tests in 22 suites |
| Architecture suite | Passed: 12 tests; also included in the complete suite |
| Translation checker | Passed: 319 messages plus native OS permission/notification copy in English, Hebrew, Spanish, French, German, Italian, Portuguese, Russian, Japanese and Arabic |
| Generated token comparison | Passed |
| JVM native helper regression | Passed with production `SourcePositions.kt` and `TransportIdentity.kt`; absolute source position vs cue-relative progress, exact main-voice identity and stale captured selection |
| Expo Doctor | Passed: 21/21. One intervening React Native Directory metadata request failed at the remote server; the final complete verification retry succeeded. |
| Complete `pnpm run verify` | Passed: type, lint, complete unit suite, architecture, translations, generated tokens and Doctor. This still does not prove physical-device support. |

Tests cover canonical schema/defaults and legacy migration, atomic finite assistant operations, provider request formats and redacted failures, secure-key boundaries, aborted downloads, delayed temporary-disk media copy/repair, real SQLite transactions and atomic selection rollback, hostile/corrupt ZIP fixtures, portable controller roles, native-owner loss and stale preparation/read protection, UI/editor controls, asynchronous audition error/retry isolation and critical-session guards. Provider responses are mocked; source/contract tests do not measure audible timing. Read the source links in the checklist and [edge ledger](refinement-edge-cases.md) for each assertion's scope.

## Native Android build

Passed Gradle compilation for audio, controller, voice and audience-display modules. whisper JNI built successfully for `arm64-v8a`, `armeabi-v7a`, `x86` and `x86_64`.

The SDK-aligned integrated debug build passed `:app:assembleDebug` targeting the x86_64 emulator in 6m52s, 584 tasks executed. The final safety/preview revision also passed: 584 tasks, 35 executed, 1m13s. Artifact:

`C:\dev\personal\show-control-app\android\app\build\outputs\apk\debug\app-debug.apk`

- Bytes: 102,400,394.
- SHA-256: `5528C1474358B3742050F2C48563A71EEFF5B4275FB2D14F61C37FE3064E9A51`.
- Installed successfully on API 36 `emulator-5560` with test data preserved.
- This is an **x86_64 emulator development APK**, not an ARM phone or store release. The development client uses Metro; this does not establish an offline packaged-release launch.

Windows build accommodations: short project path, hoisted dependencies, short Gradle temporary path and two workers. Rooted Metro exclusions omit generated native/Whisper build trees while retaining actual source; this fixed a development file-map stall. The resulting cold bundle completed in 17.05s. No unrelated process was terminated.

## Android emulator observations

Confirmed native media ingestion of a valid 30-second WAV: system picker, awaited staging copy, native probe/hash, immutable media copy and SQLite cue commit. The imported song/library and onboarding completion survived a cold app restart. This exposed and fixed an Expo FileSystem API timing bug: SDK 57 `File.copy`/`move` are asynchronous and must be awaited before probing/materializing. A temporary-disk regression now exercises delayed copies and rollback.

Waveform peak views rendered and isolated preview entered native MediaSession PLAYING without a decoder error. The headless emulator was launched with audio disabled, so this records state/decoding only, not acoustic output.

The OS-share backup round trip passed: exported a 2,648,377-byte ZIP containing the real imported WAV, observed the file in the native share sheet, reimported it through DocumentsUI, and saved a restored one-cue show beside the original. This is Android-to-Android emulator evidence; cross-platform physical transfer remains pending.

Strict native smoke tests use the public compiled modules, actual app-owned WAV and actual native state/start/end events:

- Ten immediate shutdown→prepare→GO cycles retain the new owner and monotonically increasing generations. Android shutdown now resolves after destruction and main-loop bookkeeping.
- Manual GO starts an autoplay-off incoming song exactly once; repeated GO during transition is ignored. Previous preserves active and delayed same-cue Hits; stale captured generation/selection and scheduled GO are rejected or cancelled.
- Stop cancels all current/pending audio. Natural completion leaves autoplay-off selection silent; the final song/GO never wraps. A paused countdown freezes; GO resumes it once and another GO does not advance it.
- Automatic crossfade with incoming delay retains outgoing audio where available until actual incoming VOICE_START, then the outgoing voice ends. Rate/trim fixtures use real Media3 playback; audible envelope/pitch measurement remains pending.
- A 2× looping main plus 7 independent Hits retains 8 voices and the main pointer. The ninth voice is refused explicitly without disturbing the 8. Manual advancement preserves Hits; Panic clears all voices and a delayed pause.
- Ready, paused-voice and paused-countdown Panic leave no voices/reservations/waits or phantom transition. The next deliberate GO works once. Paused audio stops immediately because it cannot render a fade; playing audio retains the configured fade.
- 24 probe/hash/waveform calls reject network/data/FTP/content/malformed/out-of-owned-storage URIs and remote file authorities without changing native state. A URL may be a plain name; it is never executed as media. A disposable show named `https://example.com/show` was created through the actual UI as inert text, with zero songs and disabled playback entry actions.
- A corrupt app-owned preview emits isolated PREVIEW_ERROR, then subsequent real playback works. Armed preview is refused. Old player errors are identity-filtered. UI regressions verify a working audition retry and that preview errors cannot alter an armed transport.

The final app also passed native media resume/pause while JavaScript was debugger-suspended and the activity backgrounded. The UI returned Paused with elapsed time advanced and did not replay the commands. Touchscreen GO/Panic/Stop/Exit and deliberate rearming were exercised separately from injected fixtures. This is emulator lifecycle evidence, not a locked physical phone or named remote certification.

Forced-stop/relaunch was exercised after touchscreen GO reached native Playing with one actual voice. Cold relaunch returned to the library with zero voices, no countdown, no selected native cue and a stopped native state. It did not restore an armed run or resume audio. English/Dark Blue and onboarding completion persisted; emulator rotation/text settings were restored after layout testing.

Two raw debugger helpers initially used async arrows with default parameters, bypassing Expo's installed Hermes compatibility transform. Their early-return defect was isolated with four helper variants, corrected in the test harness, and the native checks repeated with strict polling. It was not treated as a failed native preparation or concealed with sleeps.

The source audit also corrected iOS microphone calibration's own route notifications and main/external scene integration. Visuals latch actual main-voice start rather than a reserved/buffering voice. Rapid preflight confirmations reset on revision/playlist change, arming is single-flight and starts its critical gate synchronously, and visuals prepare before audio. Downloaded-model readiness survives calibration/disarm/events; every voice arm verifies the full checksum. Recognition was not exercised. An emulator cannot certify Bluetooth, Flic, microphones, acoustic fade/pitch behavior or HDMI privacy.

## UI refinement and manual error checks

Inspected Dribbble references before the [every-screen refinement plan](ui-refinement-plan.md). Shared native cards, typography, disclosures, fields, sliders, status/error feedback, toasts, theme choices and navigation now follow the same system. No decorative animation was introduced.

Selected [screenshots and native results](qa/README.md) are retained with the source. They contain only synthetic test shows. The development client's floating gear belongs to the test runtime, not the shipped interface.

All ten language selections were actually selected and checked in Android, including Hebrew/Arabic RTL; Dark Blue, Purple Night and Cobra were rendered, and language/theme/onboarding survived restart. Library, Builder/inline editor, More, Settings, Preflight, Run and Recovery were inspected with real data. Readable unknown timing/selected ordinals and the fixed GO/Panic geometry were checked.

The malformed 57-byte URL-shortcut `.wav` was selected through Android DocumentsUI, rejected by extraction and left the two-song playlist unchanged. An 80-byte corrupt ZIP was also selected through DocumentsUI and rejected without changing the two-show library. A new persistent viewport error notice makes Retry/Diagnostics/Dismiss visible even when scrolled; Diagnostics and Retry were exercised in the actual failed-backup flow. Errors do not expire like success toasts, and the overlay is suppressed during critical sessions. API/network URLs are rejected before media inspection; no web content was requested by these tests.

Cancellation uses an explicit null result for audio, visuals and backups. A successful zero-show backup remains distinct. The backup path originally returned zero on cancellation and falsely displayed Complete; corrected through storage, library and feedback, with temporary-disk/SQLite/provider regressions. Starting a task also clears stale success feedback. Both the audio and backup pickers were cancelled in Android with the library unchanged and no success/error toast.

Large-text Hebrew Run was inspected at 1.8× in portrait and landscape. Corrected reversed ordinals using bidi isolation; fitted text no longer collapses to near-invisible glyphs under Android line-height autosizing. Panic stays physically on the right across language changes. Equal landscape panes and wrapped footer actions retain visible 48-dp targets and a 96-dp GO. Stopwatch labels/buttons fit, hide/reopen preserves its clock, and the scrolled Recovery screen retains a fixed Stop/Panic footer. Fixed stage-action text caps retain complete assistive labels; reading regions still scale. Short/notched physical-device layouts and full assistive testing remain open.

The disposable URL-named show also exercised Delete confirmation, Cancel retaining the show, confirmed deletion, persistent trash restore and the toast's Restore action. A settled follow-up confirmed restoration. The fixture was removed from active shows afterwards; the real WAV test shows remained intact. Preflight operator confirmations during these silent emulator tests were simulated fixture setup, not acoustic or venue certification.

An immediate system text-size change during asynchronous show exit exposed a navigation error. The root navigator now mounts during font loading, redirects wait for native readiness, and late navigation from an unmounted screen is ignored. Startup's loading cover cannot obscure live safety controls. Four component regressions cover readiness and late exit/create completion; the exact 1.8×→1× change during exit repeated successfully in Android, returning to the intact library without a render error or playback.

Observed defects corrected include a permanent blank optional footer, cancelled-picker false success feedback, guard unlock relocking on release, stale “Not measured” progress descriptions, failed editor save rollback, secure-key hydration, preparing/preview races and silent/paused Panic. Stopwatch start/pause/drag/reset/hide was exercised; drag stayed inside its safe area, above fixed GO/Panic. Blackout preserved native audio state and retained Panic/exit access. Screen-reader value/role/action assertions and Android accessibility trees passed; a full TalkBack/VoiceOver device audit remains open.

## Remaining acceptance gates

1. **iOS build:** macOS/Xcode or a suitable iOS build service; build whisper xcframework with `pnpm run prepare:speech:ios`, resolve/sign pods and compile both development/release apps. The licensed Flic iOS SDK is required for actual Flic integration. Swift source review is not compilation evidence.
2. **Paired physical devices:** every row of the checklist's physical matrix, including locked/background/suspended-JavaScript controls, route loss, calls, process death/relaunch, named remotes/Flic, external microphones with wired/Bluetooth output, HDMI/external-screen private controls, eight voices and two-hour runs.
3. **Measured transport/voice:** complete rate/delay/autoplay/crossfade matrix, real-time fade envelopes, source-time seeks, loop boundaries, rapid presses, panic and stale scheduled actions. Recognition corpus must record latency, missed triggers and false triggers against music/applause/audience/near matches on both platforms.
4. **Native storage transfer:** full Android ↔ iOS system-file/share round trip including visuals/rules/settings/controller rebinding, interrupted saves/imports, real low storage and migration recovery. Fixture round trips alone do not establish native portability.
5. **Live user-owned providers:** all six exact assistant examples and Restore, selectable clarifications, invalid keys/quota/offline behavior, artwork batches, ElevenLabs instrumental and original-lyric vocals, cancellation at every stage and generated-media import. The owner excluded live AI from this test pass. Cancellation stops subsequent local work; provider computation or charges may continue.
6. **Human interface checks:** all ten languages and provider responses, Hebrew/Arabic RTL, large text, screen readers, stopwatch movement, theme states, waveform drag/scrub and stable GO/panic geometry on both platforms.

## Material implementation limits

Local library validation has no product song/show count cap. The current single-file [ZIP32 backup](library-backup-format.md) has explicit bounded streaming limits: 500 payloads, 1 GB per payload, 4 GB total and 8 MB manifest, plus documented metadata bounds. Export above those bounds fails rather than silently omitting content. Multipart/ZIP64 would be needed for larger full-library transfer.

Archives exclude secure keys, pairing credentials, live state, trash and private prompt/revision history. Restore creates independent identities, requires controller rebinding and voice recalibration, disables audience output and cannot start audio. The picker can cancel before import; selected archives import to completion or fail. Staging is cleaned, but an interrupted commit can leave unreferenced canonical payloads and no startup orphan sweep is implemented.

Generic keyboard capture is foreground-only; supported native media and Flic paths are designed for background use and still require named-device evidence. Echo suppression is attempted where available, not promised for every microphone route. Store publication, signing/storefront work and the older optional promotion/billing roadmap are separate from OMS parity acceptance.
