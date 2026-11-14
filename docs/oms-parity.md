# OMS functional parity contract

Approved by the owner on 13 October 2026. This is a functional expansion of Show Control; no OMS source, branding, or proprietary backup format is copied.

## Decisions

- Ship Android and iOS capabilities together, with separate compilation and physical evidence.
- Free unlimited local functionality; cloud editing, covers and music use user-owned provider keys. No app account, subscription, hosted credit service, or live network dependency.
- New sets use OMS contextual transport. Schema v1 sets retain legacy cue-stack semantics during migration.
- New audio cues default to speed 1, autoplay disabled, crossfade disabled, and outgoing crossfade duration 2,000 ms.
- Backup is a documented ZIP-based Show Control format, including full-library transfer. Import of proprietary OMS archives is excluded.
- The supplied HTML and WhatsApp export plus https://omsplayer.com/he/ and https://omsplayer.com/ are the parity references. The chat confirms wired voice output as well as Bluetooth; both require measured microphone/output routing evidence.

## Required behavior

Library, sets and tracks support create, rename, duplicate, remove, reorder and selection. Duplicate tuning independently while retaining immutable shared media. Import DRM-free audio into managed storage, inspect/hash it, and autosave complete revisions transactionally. Trim, gain, fades, pre-wait, loops, autoplay, color, rate, waveform seek/scrub/audition, artwork, visual media and voice rules are editable per track. Editor previews never modify an armed snapshot.

Native contextual GO plays a ready selection, exits a playing track using its fade policy and starts the next track, resumes a paused track, and ignores repeated GO during countdown/transition. Manual advancement starts the incoming track even when its autoplay is disabled; incoming autoplay gates automatic starts and outgoing crossfade eligibility. Previous stops main activity and selects silently. Stop is immediate. The last cue does not wrap. Hits do not advance the main pointer. Honor incoming pre-wait without removing source audio; preserve outgoing playback through the wait and then overlap where enough audio remains. Trim and seek use source time; rate preserves pitch; fade/delay clocks are real time. Panic and stop cancel scheduled activity.

Touch, OS media commands, HID, Flic and speech share native command admission/state. Reconciliation never redispatches an already handled command. Paired hardware works in its explicitly verified lifecycle states; failure always retains touch fallback. Unknown routes/interruption/relaunch fail silent with deliberate recovery.

Voice recognition is local, explicitly armed and calibrated. Provide rules/transcript/terminal, phrase selection/variants, global and selected-track rules, timestamped action feedback, delayed semantic commands, and a two-second utterance cooldown. Track-specific rules take precedence. Microphone permission/routing/model loss disarms recognition. Reconnection cannot replay old recognition or scheduled commands.

Smart editing returns validated finite operations, questions or clarification choices; it cannot execute code or live commands. Edits commit atomically and have history/restore. Covers and instrumental/vocal music import through managed media. Keys remain in platform secure storage and are excluded from backup. Cancellation prevents local commits after cancel; provider compute/charges may continue. Progress is measured rather than fabricated.

External output is a separate audience-only native display. It shows attached video/image, artwork or a chosen fallback at actual track start. Incoming visuals cut when incoming audio starts. Video is muted, starts at zero, follows rate/pause/seek/loops and holds its final frame. Output failure must not stop audio. Panic/stop blackout the audience output. The phone retains private controls.

Three dark semantic-token themes, a floating draggable stopwatch, persistent first-run onboarding and complete English/Hebrew/Spanish/French/German/Italian/Portuguese/Russian/Japanese/Arabic coverage are required. Hebrew and Arabic use logical RTL. GO and panic retain fixed geometry and accessible targets.

Full-library ZIP backup contains shows, sets, media, covers, visuals, voice rules, settings and portable bindings. Restore is staged/checksummed/transactional. Exclude secrets/device credentials; restored voice is disarmed and hardware requires local rebinding/calibration.

## Completion evidence

`oms-parity-checklist.md` records implementation, automated checks, native compilation and physical evidence separately. Android compilation does not prove iOS or hardware behavior. Required gates include source/translation/architecture checks, migration and hostile archive fixtures, both native builds, exact controller and output/mic/display scenarios, two-hour runs, accessibility/RTL, cloud cancellation/failure, and prerecorded positive/negative voice benchmarks. Store publication is separate and requires final identities/signing/privacy approvals.
# Owner extension: routine music and downloads

The October 14 instruction authorizes 26 song categories, category presets, section routine text, read-only BYOK recommendations, device-library reuse and yt-dlp downloads attaching to the captured section. Android runs the downloader; iOS uses the owner's computer helper. These preparation tools cannot issue playback commands and remain independent of the offline run path. See routine-music-plan.md and routine-music-verification.md.

