# Architecture

## Purpose and current truth

This architecture separates a deterministic show domain, time-critical native playback, controller inputs, transactional local data, and state-complete React Native UI. It is designed so future video, lighting, remote, trigger, and commercial modules can attach without entering the free audio safety path.

The [approved OMS parity contract](oms-parity.md) extends this baseline. Production SQLite repositories, managed audio/visual ingestion, streaming ZIP backup/restore, editor, native OMS transport, BYOK preparation and local voice/external-display modules now have source implementations. The four playback/controller/voice/visual Android modules and whisper JNI have compiled. iOS compilation is unavailable on this Windows host; both platforms' physical gates remain open. [The checklist](oms-parity-checklist.md) distinguishes source, automated, compilation and hardware evidence. Successful checks do not prove show reliability.

## System boundaries

```text
Builder -> Repository -> Show revision -> Compiler/preflight -> immutable RunSnapshot
                                                                  |
Touch/controller -> semantic command -> priority router ----------+-> native AudioEngine
                                                                  |
UI state <- run reducer <- acknowledged EngineEvents <------------+

Media picker -> staging -> inspect/hash/copy -> app media store -> Repository
Bundle file -> bounded staging/validation -> transaction -> Repository + media

Promotions/entitlements/network ----X----> command/router/engine/recovery
```

Dependency direction points inward toward dependency-free domain contracts. Platform adapters implement ports; screens do not import native modules directly.

## Domain and compiler

`Show` is an immutable revision containing sets, cues, media, controller profile reference, and panic duration. Sets contain the main `cueOrder` and `hitCueIds`. Cue schema v1 is the discriminated union `audio | group | fade | stop | wait`. `MediaAsset` records content identity and playable metadata.

The compiler accepts a show revision and set ID and either returns a deeply immutable `RunSnapshot` or structured validation errors. It must:

- resolve set, cue, group-child, hit, media, selector, and controller references;
- reject duplicate IDs/order entries, missing assets, unsupported cue values, negative/overflowing timing, invalid trims, cyclic groups, unsafe depth, and impossible capacity;
- normalize defaults and freeze/copy data so later builder edits cannot affect an armed run;
- identify a stable revision ID and schema version;
- preserve a maximum of eight simultaneous voices in schema v1.

Compiler output contains no picker URIs, database handles, mutable maps, screen state, entitlement state, or network references.

## Run state and command path

The run reducer represents explicit states such as idle, preparing, armed/ready, playing, paused, fading, interrupted, faulted, recovering, and stopped. Transitions occur from deliberate UI/controller intents and acknowledged engine events, never from optimistic component-local toggles.

All touch and controller actions become `ControllerCommand` semantics before routing. The command router:

- assigns a strictly increasing in-process monotonic command ID;
- translates commands into `EngineCommand` only after snapshot/run validation;
- serializes dispatch to preserve order;
- suppresses configured duplicate, repeat, bounce, and stale inputs;
- allows `PANIC_FADE` and `STOP_ALL` to preempt/clear lower-priority queued work;
- records dispatch/ack/fault metadata without sensitive cue/show/file names;
- never retries a potentially audible command automatically after an uncertain result.

A native `ACK` confirms that the engine semantically accepted the command ID after validation and admission; rejected commands never acknowledge. It is not proof the sound became audible, the venue route worked, or the physical remote got round-trip feedback. `VOICE_START`, `VOICE_END`, `STATE`, `PROGRESS`, `INTERRUPTION`, `ROUTE_CHANGE`, `CAPACITY_REFUSAL`, and `FAULT` update application state only when relevant to the current engine generation and snapshot.

## Native audio engine

The production engine is a local Expo native module with platform implementations using the appropriate iOS audio session and Android audio-focus/media APIs. The JS-facing port is `prepare`, ordinary `dispatch`, safety-only `dispatchUrgent`, `subscribe`, and `shutdown`.

Native responsibilities include decoding/preparing local assets, sample/clock-based fades and scheduling, voice ownership, trim/seek, gain, loop/end behavior, audio focus/session, output route changes, interruptions, healthy lock/background continuation, monotonic event timestamps, capacity enforcement, and safe shutdown. iOS integrates `AVAudioSession`, audio background mode, and `MPRemoteCommandCenter`; Android integrates a media-playback `MediaSessionService` and its minimal notification. Route removal must mute/stop before speaker fallback. Calls/Siri/alarms/focus loss enter Interrupted; crash/relaunch never auto-resumes. The engine may preload bounded upcoming media but must not play without a command/defined follow.

[Show protection](show-protection-2026-10-24.md) exposes public background/battery/notification observations in Library and the shared preparation panel. Unknown observations remain distinct from successful checks. Android refreshes its quiet ongoing prepared-show warning on native power/idle/unlock signals, with a bounded polling fallback; channel-group blocking is included. Observations never trigger transport, settings changes or idle service startup. Repair actions remain deliberate and preparation-locked. These checks reduce avoidable restrictions but cannot prevent OS/user termination.

[Device-pressure warnings](show-protection-pressure-2026-10-24.md) add locally observed battery percentage, charging and thermal state. Android uses battery broadcasts and an API-29+ thermal listener with polling fallback; iOS reads battery observations on the main queue and restores the prior monitoring setting. Missing observations remain unknown. The compact panel retains all detected issues; explicit background restrictions lead to app information. Heat and low battery can update the existing Android notification while locked, with recovery taking priority. These advisories never dispatch playback or imply protection against termination.

[Closure guidance](closing-protection-2026-10-25.md) distinguishes prepared-show foreground loss from idle/diagnostic service ownership. Android 11+ caches at most eight own-package exit records once per process and exposes only the latest valid previous main-process reason/time, without traces or automatic transport. Historical exits do not change current readiness. Older/iOS/failed observations remain unavailable. The preparation checklist and deliberate repair actions retain the ongoing show notice and silent recovery policy; they cannot prevent OS/user termination.

[Current memory advisory](memory-protection-2026-10-25.md) reads Android's public `MemoryInfo.lowMemory` boolean through the existing bounded background checks. A true flag adds a preparation warning and joins the same quiet ongoing notification, below recovery/urgent heat/charge and alongside battery restrictions. Missing/failed/older/iOS observations remain unavailable; historical exits and UI-hiding callbacks cannot create this warning. No process inventory, guessed RAM threshold, new observer, automatic app closing or playback command is introduced.

[Native store lifecycle](native-store-lifecycle-2026-10-25.md) adds optional-commerce ownership and idle admission through a one-way dependency on the existing native audio coordinator. Pending preparation leases and idle generations are separate from transport epochs; no audio lock spans a store await. Owned results carry an ephemeral delivery handle, local ownership commits first, and fresh idle confirmation acknowledges/finishes afterwards. Handles and transaction material never enter persisted library/backup data. Native teardown, focused refresh and bounded callbacks cannot start new store work during a prepared show. Actual-module synthetic SDK and installed no-op admission evidence do not replace configured store, iOS or privacy validation.

[Critical UI observation](critical-ui-lifecycle-2026-10-25.md) makes retained preparation placements/panels observe the existing safety boolean through a narrow UI hook. The dependency-free gate publishes only changed boolean values after writing admission state and contains observer failures; React/store/network code stays outside it. Cache-only routes remain cache-only. Imperative and native checks still own action admission; display observation neither subscribes to audio progress nor dispatches transport. Preparing hides retained optional panels and deliberate Exit permits a fresh focused load.

[Focused protection checks](focused-protection-2026-10-25.md) admit advisory reads only on a focused, known-active, idle preparation panel with no pending OS-settings interaction. Blur/critical/settings transitions invalidate display observations and remove polling; eligible return checks once without replacing the current layout. The initiating settings lease survives route blur until genuine app return or deliberate windowed Recheck. Unknown AppState, stale callbacks and another settings owner cannot start reads/repairs. This changes no native locked/background warning or playback ownership and is not attributed as a fix for the historical renderer ANR.

[Recovery workspace](recovery-workspace-2026-10-25.md) windows the complete immutable cue order through the shared CollectionViewport. Search is normalized, selection stays silent, and Start remains separate. UI workspace identity survives ordinary native selection; command admission separately captures transport generation and snapshot identity. Exit reservations and late-result guards retain deliberate recovery. Recovery alone opts AppShell into keyboard avoidance so its non-scrolling Stop/Fade footer docks above the IME. Other critical keyboard defaults, native transport, Run controls and prepared Rehearsal's footer are unchanged. CueTitle retains full assistive names within the existing native readout geometry.

Recovery's editable search is outside its virtualized list so native focus survives window resizing. Compact typing preserves the same input; landscape temporarily hides the result workspace until submission/dismissal. Keyboard-only padding and Field's semantic 48-dp compact option retain space for manual safety controls. Shared collection search disables Android full-screen input extraction and submission only dismisses the keyboard. Other Field callers retain their sizing/full-screen defaults.

React responsibilities are intent, display, and recovery choice. React renders progress events; it does not calculate authoritative playback position or run a fade timer. JavaScript orchestration must tolerate bridge delay and app lifecycle suspension without changing native cue semantics.

Android's ongoing notice retains [independent protection warnings together](background-warning-combinations-2026-10-24.md), with recovery and urgent device pressure first. Its full localized copy participates in native update identity, so a secondary risk can change without being concealed by an unchanged headline. This changes neither foreground lifetime nor command admission; Android owns notification expansion and visibility.

[Notification presentation language](show-protection-language-2026-10-24.md) is captured from the current library settings immediately before explicit preparation. The runtime-only envelope supplies a supported language to Android's service-local resource context for warning text, channel naming, media metadata and actions. Unknown/older values retain system-language fallback. This does not change system locale, recreate an Activity, persist a new song field or dispatch transport; a reconciled native owner retains its captured language.

The source-owned offline-locales Expo plugin disables Android App Bundle language splitting, keeping native warning resources available when the app language differs from the phone's language. It also retains the legacy `iw` qualifier alongside Expo's `b+he` filter, which otherwise drops the native Hebrew resources. It modifies only the generated Groovy app build, is idempotent, upgrades its exact earlier owned block and rejects unsupported/incomplete configuration. The standalone audio library's locale-change lint has a narrow, documented suppression because it cannot inspect the host's bundle DSL; candidate host builds separately assert language splitting is disabled and `iw` survives. Packaged-language inspection complements source translation parity. No Play language-download dependency enters the offline path.

Platform behaviors that cannot be guaranteed—OS process termination, incoming calls, arbitrary Bluetooth routing, manufacturer battery policies—must transition to a safe, visible state and require deliberate recovery rather than being hidden by a promise.

## Persistence and media

SQLite stores versioned structured records for shows/revisions, sets, cues, controller profiles, settings, migration ledger, and trash/recovery metadata. Repositories expose domain objects and transaction units; screens never compose SQL.

Editable documents are validated independently of controller readiness. The pure document validator checks canonical content/graphs/media without yielding a runnable snapshot; it preserves the original show-to-profile association and all saved assignments. A new or duplicated playlist, removed/moved Hit, or unfinished controller profile can therefore be saved and backed up while its controller remains visibly unavailable for that playlist. Archive validation separately checks every profile's structure and compound-input uniqueness and rejects a missing referenced profile. Runtime compilation still validates the original selected show/profile, including separate GO/panic and target membership, before preparation. Only the existing deliberate touch-only fallback may omit the runtime profile; authoring never makes that choice. See [draft-controller portability](portable-controller-workflow-2026-11-04.md).

Revision history returns pages of at most 20 lightweight summaries using a timestamp/ID cursor. Opening a page never selects or parses full historical show documents. Restoring one version reads that exact revision scoped to its show, validates it and persists a new revision through the existing transaction path. Old versions remain available; no history is deleted or capped. This uses the existing schema and index, with no database migration. [Verification and limits](revision-history-refinement-2026-10-24.md) distinguish the SQLite fixtures from installed/physical evidence.

After a backup commits, snapshot reconciliation retries only bounded transient reads. If it still fails, the library becomes unavailable and deliberate Reopen library reloads committed state without replaying the import. Stale edits/previews/arming remain blocked, and completed restore counts remain true. Failed reopening retains that committed recovery context. [Recovery evidence](backup-commit-recovery-2026-10-24.md) separates real SQLite fixtures from installed ordinary backup checks.

Initial/recovery loading and post-restore reconciliation share a complete read batch. All started queries, native statement finalization and bounded busy retries settle before an error can release the connection into cleanup, rollback or Reopen. Missing integrity/schema observations fail closed rather than inferring a healthy/empty database. [Library load evidence](library-load-lifecycle-2026-10-24.md) distinguishes controlled failure ordering from clean-install and full Android export/reimport observations.

Media import uses a two-phase process:

1. copy picker input into a unique staging directory;
2. inspect size/type/decode metadata and hash bytes;
3. check storage budget and duplicate content policy;
4. copy/rename into a content-addressed or ID-addressed app-owned path;
5. commit `MediaAsset` and cue/reference updates in one transaction;
6. clean staging and later garbage-collect only unreferenced assets.

Concurrent metadata/checksum inspection owns its staging lease until every started native reader settles, including synchronous bridge failures. Cancellation and captured access are rechecked after staging, before readers, and before promotion/persistence. Exact UUID staging-name validation prevents cleanup from following arbitrary or traversal paths; best-effort temporary deletion preserves primary copy/promotion errors and leaves recognized leftovers for idle cleanup. [Import lifecycle evidence](import-reader-lifecycle-2026-10-24.md) separates deferred-reader/SQLite/filesystem regressions from installed picker observations.

If any step fails, the previous show revision remains usable. Never delete media based on filename or an uncommitted edit. Database migrations run transactionally, retain a recoverable pre-migration backup, and are tested from every supported version plus corrupt/disk-full/interrupted fixtures.

## `.showbundle` interchange

A bundle is a portable archive, not executable content. Its manifest includes format/schema version, exporter version, show/revision identity, normalized relative media entries, byte sizes, checksums, and the serialized domain data. Import happens in an isolated staging directory with fixed entry/count/per-file/expanded-total limits.

Reject absolute paths, `..` traversal, alternate separators that normalize outside staging, symlinks/hardlinks, duplicate normalized paths, case-collision paths, undeclared files, checksum/size mismatch, invalid IDs/references, unsupported future required features, and insufficient space. Validate all entries before the library transaction. On success create a new local show identity when collisions would overwrite existing work.

The implemented full-library format is documented in [the backup contract](library-backup-format.md). It is a ZIP32 archive with stored entries, a schema-v2 manifest, SHA-256 payload declarations and CRC checks. Read/write is streamed with explicit entry/size bounds. These archive bounds do not impose product count limits on local SQLite saving or playback. Proprietary OMS backup import is outside the approved scope.

## Controller architecture

A `ControllerAdapter` owns connection/platform mechanics and emits `ControllerInput` with adapter/device/input identity, phase, monotonic timestamp, and repeat flag. The normalizer/binding layer converts it to a semantic domain command. Profiles are portable only when their input identities are meaningful on the target device; import must mark unavailable bindings rather than silently remap them.

V1 adapters include OS-exposed HID/media/keyboard input and a native Flic 2 SDK adapter that supports the SDK's verified foreground/background/locked lifecycle. Every adapter reports health and disconnect, and no adapter may remove the touch path. Flic remains a release-blocking physical/access gate until licensed SDK integration and the named matrix pass. Watch, MIDI/OSC, browser, MediaStar/Audio Ape, RFID/NFC, voice, and camera adapters enter through this port only in their authorized stages.

Arming now hands the immutable profile to the native controller coordinator. Compound adapter/device/input bindings take precedence over generic aliases. OS media, native Flic/HID and voice semantic inputs enter native audio command admission without waiting for JavaScript; UI reconciliation reads native selection/countdown state and does not replay commands. Queued reconnect events are rejected. A native receipt means accepted/scheduled by the engine, not audible completion or acknowledgement by a remote. Exact locked/background hardware delivery, licensed Flic iOS integration and route behavior remain physical/build gates.

[Keyboard text safety](keyboard-text-safety-2026-10-25.md) gates generic/HID input before native dispatch or bridge history when a native editor is focused. Android observes the current View/editor and focus changes on its UI queue; iOS observes the first responder on its main keyboard queue. The synchronous bridge reads only a conservative native boolean and queues no transport. A typed key remains blocked through blur until release; suppressed releases clear held/bounce state silently. Assigned panic/stop retain ordinary native admission, and independent media/Flic paths remain outside the typing gate. The bounded latch resets on capture lifecycle/disconnect and introduces no persisted profile/schema change. iOS source/build and exact physical hardware evidence remain separate gates.

[Capture lifecycle](controller-capture-lifecycle-2026-10-25.md) gives each native keyboard capture instance a bounded generation. Setup, cleanup and key callbacks retain their original generation; obsolete work cannot detach or dispatch through a newer capture. Requested capture is distinct from actually attached health. Reattaching the same active window/keyboard preserves held and typing state; real stop, suspension and reconnect deliberately reset it. State locks contain no UI, platform or runtime calls. This is per-instance ownership, not proof of process-wide module teardown or physical controller behavior.

## OMS native extensions

Schema-v2 sets choose `oms` or `legacyCueStack`; migrated v1 sets retain legacy semantics. Audio defaults are rate 1, incoming autoplay off, outgoing crossfade off and 2,000-ms crossfade duration. Native engines own selection, countdown/transition phases, contextual GO, silent previous, immediate stop, delayed actions and native-state reconciliation. Source trim/seek positions are separate from real-time fade/delay clocks. Pitch preservation uses Media3's Sonic path on Android and AVAudioUnitTimePitch on iOS. Preview is a separate native playback session and is refused during an armed show.

`show-voice` wraps pinned whisper.cpp CPU inference off the rendering/capture callbacks. Setup streams and verifies the multilingual base model. Native capture requires calibration and explicit arming; matching uses selected-track precedence, ambiguity rejection and a two-second utterance cooldown. Semantic commands carry captured native generation and are rejected/cancelled when stale. Route/session/safety stop disarms recognition. Voice is an optional input; manual safety controls remain available.

`show-visual` consumes native state via package-scoped Android broadcasts / iOS notifications, and renders separate Presentation / external-screen scene output. Videos are muted; visual failures are isolated from audio. Stop/panic black out output. External connectors, pause/rate/seek/loop synchronization and final-frame behavior require physical display evidence.

Audience still-image decoding/downsampling uses a native worker on each platform, with one in-flight decode/result and only the latest waiting request. Publication stays on the UI queue; blackout/replacement/close invalidate stale results/errors, and teardown rejects late setup work. iOS requests immediate image caching and marshals seek completion to the main queue before checking renderer state. [Image responsiveness evidence](audience-image-responsiveness-2026-10-24.md) distinguishes Android virtual-renderer checks from physical output, iOS compilation and the unresolved historical ANR.

The assistant resides outside the run graph. Responses/Messages return strict finite operations or read-only answers/clarifications. Local validation and one library transaction apply edits; durable prompt history captures a pre-edit revision for Restore. Artwork/music results enter the normal media importer. SecureStore holds provider keys and backups never include them. Armed sessions block cloud work and prevent late results committing. Cancellation stops local processing and cannot promise provider billing cancellation.

An app haptic/visual confirmation reflects input/engine receipt. “Bidirectional acknowledgement” is reserved for hardware/protocols that actually return a verified response to the handheld remote.

## Application and UI

Expo Router owns Library, Builder, Rehearsal, Preflight, Run, Recovery, Controllers, and Settings. Feature controllers call domain/repository/engine ports; route components remain presentation/orchestration boundaries. Armed Run is an explicit mode with fixed motor layout and restricted navigation.

Source-owned primitives consume generated semantic tokens. Translation lookup owns all visible/assistive strings. App-level providers should remain narrow: locale/direction, accessibility preferences, repository/session, run coordinator, and platform status as needed. Do not add a global server cache for local data.

[Rehearsal's workspace](rehearsal-workspace-2026-10-24.md) reuses the windowed collection/search primitives before preparation and for native song/Hit choices afterward. Search never narrows the immutable prepared order. A shared preparation shell owns keyboard avoidance for its content, feedback and action bar, keeping silent Prepare above the keyboard; nested collections opt out of duplicate avoidance. Critical layouts disable shell avoidance and dismiss the keyboard. Prepared tabs have no text entry or modal, and local search/pane state resets on identity/generation change without issuing transport commands.

Its [current/next clarity refinement](rehearsal-glance-2026-10-25.md) mounts the waveform reader only inside deliberately opened seek tools. Primitive URI/retry dependencies prevent native progress from causing new reads; cleanup rejects replies after close or source replacement. The read-only summary continues to derive clocks and next identity from the current native session. Seek/replay still enter the existing semantic runtime, with the same source-time bounds and paused/countdown admission. No native interface or persisted-schema change is introduced.

## Commercial isolation

Owner decision, 26 October 2026: application routes no longer import or mount promotion slots or the promotion-removal purchase panel. Consequently those route entries perform no promotion entitlement hydration/store refresh and reserve no footer placeholder. Existing isolated components, native adapters and entitlement storage remain dormant for compatibility; no ownership data is changed. The earlier commercial contract below is historical and does not require restoring the removed UI.

V1 authorizes a bounded commercial adapter outside the live path. A bundled manifest and an atomically cached, signature-verified HTTPS manifest may supply at most one fixed-size, clearly labelled first-party placement on Library, Builder, Rehearsal, Preflight, Controllers, and Settings. Refresh occurs only while idle/noncritical; Rehearsal/Preflight do no network work. Armed/Run, Recovery, lock screen, and Android media notification cannot import or render the subsystem.

`remove_promotions` is a restorable one-time non-consumable represented by a locally cached verified entitlement; storefront price is read from localized store metadata, never source/config. Failure or absence preserves the complete free product. Architecture tests forbid playback/domain/audio/router/repository/preflight safety/recovery imports from promotion, billing, analytics, remote-config, or network modules. Invalid/unavailable/expired manifests fall back to bundled content or no placement; entitlement uncertainty never blocks use.

The [store-result reliability record](entitlement-reliability-2026-10-25.md) covers ordered SQLite-KV saves, preserved ownership/durable state through uncertain reads, compatible v1 cache validation, subscriber isolation and truthful offline-save failure feedback. Interactive purchase/restore requests have a synchronous shared UI owner and invalidate older idle observations; stale completions cannot replace newer results or clear another pending read. Entry checks use the current critical state, and late idle results do not update a prepared show's cache. Completed paid results are retained after the panel leaves, without a lease on free preparation. These shared-code guards do not certify native SDK presentation/teardown races or store transactions; those remain separate native/device release gates.

Safety, core creation/playback, import/export, backup, recovery, and diagnostics remain free. See stage 08 and `NOTICE.md` for open-core boundaries.

## Security and privacy architecture

Trust boundaries are picker files, archives, platform events, controllers, optional future LAN peers, commercial manifests, and crash reports. Validate at each adapter and convert into bounded canonical types. Keep media and metadata private to app storage, use OS share sheets only on deliberate export, and never upload by default.

No imported cue contains executable JavaScript, shell, expression, template, URL action, or active PDF behavior. Future network commands must authenticate the peer, bind to an armed session, use nonces/sequence numbers, expire, rate-limit, and remain subordinate to local panic.

## Observability

Local diagnostic events use monotonic and wall-clock timestamps, build/schema versions, command/event IDs, state transitions, route/interruption categories, adapter health, and redacted fault codes. Do not log show names, cue names, notes, filenames/paths, media bytes, or stable device/controller identifiers. Logs are bounded and user-exported deliberately. Remote crash reporting is opt-in and separately consented.

## Testing and architecture enforcement

Unit/property tests cover compiler invariants, graph/reference errors, reducer transitions, command ordering/preemption, capacity, and bundle validation. Repository contract tests run against in-memory/reference and SQLite adapters. Native integration tests verify engine commands/events. Architecture tests enforce dependency direction and commercial/network isolation.

Physical-device and named-hardware evidence is mandatory for release claims. See `reliability-protocol.md` and `release.md`. A passing Jest suite cannot prove decode latency, audio focus, output routing, Bluetooth behavior, haptics, process lifecycle, or venue reliability.
# Routine music preparation extension

The music library index deduplicates immutable content, derives legacy roles and stores explicit roles as portable music-category tags. Copies have independent cue settings; conflicting media/visual identities are remapped. Track-scoped self-target and semantic voice rules are copied; cross-song PLAY targets need deliberate reassignment. Optional section routineText is bounded to 8,192 characters in local and ZIP validators.

Recommendations accept one strict, read-only BYOK result and validate every library identity. External suggestions are search terms. Provider output cannot supply executable code, launch downloads or issue transport commands. The chosen provider/model and device-only key are used; media files and device paths are not sent.

ShowDownloads supervises Android Python/yt-dlp/FFmpeg in a data-sync foreground service. Its pinned executable is checksum verified at build and initialization. iOS uses an authenticated computer API and native background URLSession delegate. Native records retain captured section IDs and survive React teardown. Preparation uses fixed UUID paths, one job, time/storage limits and public-only HTTPS tunnels.

Completed audio passes MediaImportTransaction before metadata is committed. Download tags make crash recovery attachment idempotent. Deleted targets retain local files for explicit reassignment. Interrupted jobs do not restart or play audio automatically. Preparation polling is separate from the native audio scheduler. Pending preparation and foreground reconciliation block arming.

## Controller setup admission

`NativeRemoteCoordinator` is a process-local rendezvous shared by the audio owner and controller adapter. An armed snapshot blocks profile changes and silent diagnostics. Diagnostic media sessions render silence and receive system media buttons before arming; background/navigation/teardown ends setup. Incoming diagnostic events carry a setup-session identity and never dispatch transport. Native command epochs invalidate old controller work at panic/stop and at a new preparation. Android priority dispatch and the iOS urgent-mute watchdog remain native; bridge receipts never claim remote-side acknowledgement.

The Controllers hub captures exact adapter/device/input bindings, requires explicit overwrite/save and bounds profiles to 256 entries before persistence. Per-session input history is bounded to 128 events; ordinary history retains 32. Releases, repeats, 80 ms bounce, queued reconnects and duplicate delivery are excluded. Queued events do not alter live held-state; disconnect clears the affected held button. System media identities and iOS coalesced keyboards cannot identify an individual physical remote. Volume keys remain owned by the OS. [Compatibility](remote-compatibility.md) and [verification](remote-control-verification.md) distinguish source, emulator and physical evidence.

## Non-AI refinement, 14 October

The [approved plan](non-ai-refinement-plan.md) adds runtime-only session purpose (`performance` or `rehearsal`) without changing persisted cue/schema data. Rehearsal compiles the same immutable native snapshot, prepares silently, uses the native command owner and critical gate, and exits through native shutdown. Reconciliation rejects a different purpose and never replays commands. Seek controls require actual playback and no countdown.

Isolated audition accepts `initialPaused` at native preparation, so changing tuning then silently seeking a paused audition cannot produce a play-before-pause burst. Loop source position resets independently of continuous fade timing; live fades and emergency mute survive boundaries. An OMS transition stays owned until the outgoing voice ends, including paused overlap. Failed incoming admission retains the outgoing voice/selection and releases the transition for deliberate retry.

[Audition lifecycle](preview-lifecycle-2026-10-24.md) closes Android Stop admission and initiates full teardown on the same native command turn, resolving only after owner destruction/detachment. Duplicate stops join cleanup; a main preparation that won admission remains protected. Preview-only startup cancellation blocks replacement admission until destruction, and failed audition/show preparation permits deliberate Retry only after teardown. iOS failed auditions release session/remote ownership through its existing synchronous shutdown; its build/device gate remains open.

Audience hardware detection is independent of renderer readiness. Native visual generation and monotonic event barriers prevent stale starts after stop/panic/disable; silent patterns require the shared idle gate. Audio PROGRESS positions are already trim-relative source time. Backup observers report measured work, support pre-commit cancellation and preserve completed ZIPs for share retry. Temporary cleanup requires idle, recognized old staging paths and no active lease. Session stopwatch state is owned above Run/Recovery and reset only explicitly or when a new session begins. [Verification](non-ai-verification.md) separates automated/emulator evidence from physical gates.
