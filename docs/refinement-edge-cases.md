# Refinement edge and combination ledger

13 October 2026. Owner requested at least 20 edge cases and 10 risky combinations. This ledger separates a discovered bug/fix from an existing prevention and from a physical acceptance gate. Update evidence after implementation; do not turn a source assertion into a hardware claim.

## Edge cases

| ID | Case and expected behavior | Investigation / acceptance |
| --- | --- | --- |
| E01 | Three rapid preflight confirmations retain all selections | Fixed functional revision-keyed state; provider integration tests. |
| E02 | Revision/playlist change invalidates old confirmations | Fixed; provider integration tests. |
| E03 | Double-tapping Arm starts only one preparation | Fixed synchronous single-flight; deferred-native provider integration regression. |
| E04 | AI/import/preview during preparation cannot mutate/audition the run | Fixed synchronous preparation gate, including same-frame preview/scrub; runtime/provider/storage regressions. No live AI used. |
| E05 | Voice/system GO immediately after preparation has a prepared visual snapshot | Fixed visual-before-audio handshake; provider integration test. |
| E06 | Ready Pause button must not start audio | Fixed touch, native toggle and media mappings on both platforms; Android native idle pause/resume regression. |
| E07 | Manual GO starts autoplay-off incoming song once | Fixed both engines; actual Android native regression. |
| E08 | Last cue finishes without wrapping; next selection stays silent if autoplay off | Native regression; physical timing still pending. |
| E09 | Repeated GO during delay/transition cannot queue extra advances | Native regression; physical remotes still pending. |
| E10 | Previous preserves active/pending Hits, even same cue content | Fixed voice identity/selective cancellation; native regression. |
| E11 | Stale delayed speech cannot affect a replaced cue/session | Generation/selection admission; native regression. |
| E12 | Panic/Stop clear all voices, waits and pending commands | Native regression; acoustic preemption still physical gate. |
| E13 | Asynchronous media copy/move is complete before probe/commit | Fixed awaited filesystem calls; real WAV/emulator and delayed-copy tests. |
| E14 | Temporary library initialization failure is retryable | Fixed cached rejection/open-handle recovery; real SQLite tests include first-open failure and a succeeding retry. |
| E15 | Low storage/interrupted import does not commit partial documents | Existing staged/transactional guards; temporary-disk/SQLite tests and physical gate. |
| E16 | Hostile/oversized/corrupt archives fail closed | Existing bounded path/checksum/schema guards; archive fixtures. |
| E17 | Loading/failed/empty library does not expose unusable create/import controls | Fixed loading/error/retry/empty UI and state-specific admission; component tests. |
| E18 | Failed autosave does not leave editor pretending unsaved draft was committed | Fixed rollback and visible retry without losing the unsaved name; UI/SQLite regressions. |
| E19 | Rapid edits cannot apply an older cue's draft to a newly selected cue | Cue identity/revision and serialized fresh-patch guards; regression for rapid edits/switch and stale whole-document saves. |
| E20 | NaN/negative/oversized exact time/rate/tempo/length cannot reach save/generation | Fixed numeric bounds and localized decimal normalization; UI/domain regressions. Generation was mocked only. |
| E21 | Secure-key reads finish before Save/Delete; failed reads never imply blank key | Fixed hydration gate, retry and disabled actions; secure-store mocks. No real keys read or changed during manual tests. |
| E22 | Downloaded speech model stays ready after calibration/disarm/events | Fixed facade normalization; four setup/checksum regressions. |
| E23 | Calibration's own route notifications do not disarm it; real loss does | Fixed iOS route identity; external microphone physical gate. |
| E24 | Primary iOS scene remains visible while external output uses a separate scene | Fixed main/external registration and existing React-window association; Xcode/device pending. |
| E25 | Reserved/buffering audio cannot start audience visuals early | Actual VOICE_START latch, snapshot identity and stale-event guards; native compilation/HDMI gate. |
| E26 | Long mixed-script names, RTL numbers and largest text do not hide actions | Shared typography/direction/bounded labels; rendered/device checks. |
| E27 | Selected Ready song reports correct ordinal and actual next action | Fixed selected index/state; component regression and actual Android Ready screen shows1/2. |
| E28 | Cancel/key/quota/offline provider failures prevent subsequent local edits/import | Existing abort/critical/output guards; provider mocks and live-account gate. |
| E29 | Deleted last playlist/selected show produces an actionable empty state | Fixed selection fallback and transactional last-delete; library/UI tests. |
| E30 | Relaunch/route loss never resumes sound or recognition automatically | Existing deliberate recovery; emulator cold restart, physical lifecycle gate. |
| E31 | Localized comma/Arabic decimals and Arabic Indic digits remain valid numeric input | Shared decimal-field normalization; UI keyboard-entry regression, source timing remains milliseconds. |
| E32 | Failure saving the selected show/playlist cannot leave a dangling selection | Creation, duplication, trash restore/delete and backup selection share the document transaction; injected real SQLite selection-write failures roll back everything. |
| E33 | Reimporting a missing/damaged shared asset repairs every referencing song | Verify before checksum reuse; retain original canonical URI, preserve damaged bytes in recovery, await replacement and verify its integrity; temporary-disk regressions. |
| E34 | Repeated/idle media pause or play cannot unexpectedly start/flip a song | Native play resumes only, pause is idempotent, toggle is contextual; Android idle and suspended-JavaScript media tests. Named hardware/iOS remain gates. |
| E35 | Immediate shutdown→prepare→GO cannot reuse a dying native owner | Android completion deferred until after destruction/main-loop bookkeeping; ten immediate native restart/play cycles, monotonic generations and sender guards. |
| E36 | Foreground return with a missing native owner cannot show false Ready | Explicit reconciliation faults and blocks GO; runtime regression. Relaunch is silent in emulator. |
| E37 | Late old preparation failure/state read cannot overwrite a new run | Epoch/snapshot guards in both success/failure and reconciliation; deferred rejection/read regressions. |
| E38 | Controller setup failure must leave prepared touchscreen GO/Panic available | Setup/configure/start failures produce localized fallback feedback; provider integration regression. Physical controller reconnect remains open. |
| E39 | Unknown optional promotion state cannot waste permanent screen space | Collapse unavailable hydrated slot; initial hydration and eligible promotion preserve appropriate geometry; two component regressions and actual screen inspection. |
| E40 | Cancelling an audio, visual or backup picker cannot claim a completed import | Explicit null cancellation propagates through storage and task feedback; clears old success feedback too. Backup cancellation is distinct from a successful zero-show backup. Temporary-disk/SQLite/provider regressions and Android picker checks. |
| E41 | A web shortcut disguised as audio cannot enter the library | Actual57-byte `.wav` fixture fails native extraction with unchanged song count; specific localized unreadable-audio feedback plus Retry/Diagnostics/Dismiss. |
| E42 | Remote file authorities, network/data/FTP/content/malformed/out-of-storage URIs fail before decoding/network |24 rejected native probe/hash/waveform calls leave native state unchanged; local-import boundary fixtures also reject credentials/control characters. Names may contain URL text without being executed. |
| E43 | Spoken progress cannot retain “Not measured” after an actual value arrives | Explicit localized text and0–100 native range on every update, including return to unknown/nonfinite input; accessible progress regression and Android screen check. |
| E44 | Holding Touch Guard to unlock cannot relock on finger release | Keep its long-press handler present across the gesture; separate accessible activation, disabled-action guard; actual Android held-gesture regression. |
| E45 | Panic on a paused voice cannot leave an unrenderable fade and resumable voice behind | Both engines immediately clear paused/silent work; Android paused-voice plus scheduled-resume test. Audible fade remains only for playing voices. |
| E46 | Panic in Ready or a silent/paused countdown cannot leave a phantom transition | Clear voices/reservations/countdowns/transition state; native three-case test requires the next deliberate GO to work once. iOS compilation pending. |
| E47 | Generated Android/Whisper build trees cannot stall the development bundle | Rooted Metro exclusions retain actual source while excluding generated native trees; cold bundle/server and installed app verified. |
| E48 | An asynchronous preview decode failure cannot disappear or fault an armed show | Separate PREVIEW_ERROR feedback, audition-specific retry and ignored stopped/stale errors; Android corrupt managed preview + subsequent playback and provider/runtime regressions. |
| E49 | A rejected preview Promise cannot permanently poison later scrubbing | Invalidate failed preparation signature before retry; provider regression retries the changed source position successfully. |
| E50 | Changing language cannot swap the physical Panic position | Transport panes use a fixed LTR motor map while reading regions retain RTL; actual English/Hebrew inspection, Panic stays on the right. |
| E51 | Large text plus Android autosizing cannot shrink fixed-height names/actions to near-invisible text | Remove fixed line-height spans from fitted text; semantic caps for fixed stage actions, full assistive labels retained. Actual 1.8× Hebrew portrait/landscape inspection. |
| E52 | RTL cue ordinals cannot reverse first/total | Unicode LTR isolation plus a plain accessible ordinal; actual Hebrew Run shows 1 / 2 in the correct order. |
| E53 | Landscape rotation, flex sizing and safe-area insets cannot clip Run controls | Explicit equal pane widths override conflicting flex shorthand; safe-area-aware dimensions and footer wrapping. Actual large-text landscape controls retain 48-dp targets and 96-dp GO. Short/notched physical phones remain a gate. |
| E54 | Large stopwatch labels cannot push their sibling controls outside the panel | Bounded panel/header and equal-width compact action slots; actual large-text landscape render shows all controls above the safety pane. |
| E55 | Hiding a running stopwatch cannot silently reset or pause it | Keep its instance/monotonic clock, stop only invisible render updates and reconcile when reopened; fake-clock regression and actual hide/reopen/pause check. Reset remains deliberate. |
| E56 | Scrolling Recovery cannot hide global Panic/Stop | Fixed footer outside the scroll region, same physical order in RTL; component regression and scrolled Android large-text landscape observation. |
| E57 | One song cannot produce an incorrect plural label | Shared count component and complete singular messages in ten languages; actual English/Hebrew one-cue cards. |
| E58 | Corrupt backup selection cannot modify documents or leave unusable recovery controls | Actual 80-byte invalid ZIP rejected through DocumentsUI; unchanged two-show library, Diagnostics and Retry exercised. Archive/transaction fixtures cover malicious content separately. |
| E59 | An operation error while scrolled cannot disappear above the visible screen or expire like a success toast | Persistent viewport error notice takes priority over success, announces its localized message, keeps Retry/Diagnostics/Dismiss outside its scrollable body and disappears only after dismissal/retry. Component regression and actual corrupt-backup flow. Hidden during critical sessions so it cannot cover stage safety controls. |
| E60 | System text-size/activity reload during asynchronous exit cannot navigate into an unmounted root | Keep the root navigator mounted while fonts load, wait for native navigation readiness before redirects, and ignore late exit/arm/create/select/onboarding navigation from unmounted screens. Four component regressions; the exact 1.8×→1× text change during exit repeated successfully in Android with a silent intact library. |

## Risky combinations

| ID | Combination | Required result / evidence |
| --- | --- | --- |
| C01 | 2× rate + nonzero trim + two-second fade/delay | Source positions stay source-time; delay/fade stay real-time. Native helpers/engines; physical envelope/pitch measurement pending. |
| C02 | Incoming delay + outgoing crossfade + incoming autoplay + short remainder | Outgoing survives wait where possible, overlap begins at actual incoming start, shorter overlap/gap allowed. Native regression; audible matrix pending. |
| C03 | Paused countdown + rapid GO + resume | Countdown freezes, one GO resumes remaining wait, extras do not advance. Strict native polling regression uses GO twice after pause. |
| C04 | Same-cue Hit + Previous + pending Hit delay + stale voice action | Hits survive independently; main/old captured semantic work cancels. Native regression. |
| C05 | Looping song + Hits + manual GO + Panic | Android native2× loop plus7Hits reaches8voices; ninth safely refused; manual GO preserves Hits; Panic clears every voice and delayed pause. Acoustic/iOS physical gate remains. |
| C06 | Voice armed + audio prepare + immediate utterance + external display | Matching snapshot handshake preserved, visual prepared first, actual-start latch only; integration/source tests and physical voice/HDMI gate. |
| C07 | Cloud response/download + Arm + cancellation + atomic save | Critical latch begins before first await; subsequent cloud/import commits are refused. Deferred-prepare/provider/storage regressions. |
| C08 | Rapid editor sliders + save failure + cue switch | Latest valid intent remains associated with its cue; failed save is visible and no later cue is overwritten. UI/transaction regressions. |
| C09 | Hebrew/Arabic + long song names + large text + alternate theme + stopwatch | Proper script/number direction and contrast; GO/Panic fixed and overlays bounded. Component/actual-screen checks; assistive-device gate. |
| C10 | Backup restore + duplicates/shared media + controller roles + voice calibration + keys | Independent tuning, deduplicated payloads, no keys/hardware credentials, rebinding/calibration required, no sound. ZIP/SQLite fixtures, Android OS round trip; Android↔iOS physical gate. |

All confirmed source/UI defects above are in scope for correction. Rows depending on physical equipment or live paid accounts cannot be marked fully accepted on this host. The final evidence record must state exactly what ran.
