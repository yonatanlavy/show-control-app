# Routine music and device downloads

Owner authorization: the October 14 request adds song categories, routine-text recommendations, local downloads and attachment to a specific show section. Android runs yt-dlp locally; iOS uses the owner's computer helper. This expands the preparation scope in `oms-parity.md`; playback stays offline and independent of these tools.

Implement 26 portable category tags and explicit role presets. New imports start quietly at −18 dB, 1×, smooth 800 ms in / 1,800 ms out, no wait, manual advancement, no autoplay/loop/crossfade. Existing saved tuning stays intact. Categories and routine text survive duplicate, history and ZIP transfer.

Use a bounded, read-only structured BYOK recommendation request. Only real library IDs may be suggested as library songs. Outside suggestions contain search terms; yt-dlp resolves actual sources before the user chooses a download. Cloud responses cannot invoke transport or downloads. Retain a manual library browser and URL input without AI.

Downloads run outside the audio engine, use fixed app-owned job paths, one active job, limits/timeouts and real progress. A completed file passes the existing staging, native probe and checksum pipeline. Capture the show/section/category at initiation; navigation cannot retarget it. Idempotent download tags prevent duplicate attachment after a crash. A deleted section leaves the completed file available for explicit attachment elsewhere. Stop/cancel prevents subsequent attachment; native state survives JavaScript suspension. Never resume playback.

iOS helper uses a device-only pairing secret, bounded local HTTP API and subprocess argument arrays. No general file access, shell commands, arbitrary output paths or executable provider output are exposed. Downloads transfer to phone storage before attachment. Keys/pairing and unfinished job credentials are excluded from portable backups.

Verify defaults/categories, migrations/backup bounds, local search and shared-media copying, forged recommendations, malicious URL/helper inputs, rapid duplicate requests, cancellation at each boundary, deletion/navigation/relaunch, low storage, provider errors and actual Android downloads. Run type/lint/unit/architecture/ten-language checks and native Android builds. Windows cannot satisfy physical iOS/macOS or venue gates; record those as unverified.
