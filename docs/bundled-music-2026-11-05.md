# Bundled music and temporary-file cleanup

The owner requested removal of Show Control temporary files, preservation/restoration of its music, and an Android APK containing all audio. This is a bounded packaging task; no AI requests or open-ended improvement goal is authorized.

## Plan

1. Verify the 170-track collection, metadata, credits and existing full-library ZIP. Restore the three verified music ZIPs moved to `E:/codex/offloaded-2026-11-05` to their original C: music-library folder. Do not move unrelated media or projects.
2. Include the full archive and attribution in the APK. Offer a deliberate offline installation from Library using the existing staged, checksum-checked, native-probed, transactional importer. Preserve existing shows, selection, language and theme. Show real preparation/import progress, cancellation and recoverable failures; avoid a second installation when all recording hashes already exist.
3. Run relevant software and native build checks, inspect every packaged audio payload, install on the owned test emulator and verify the 170-song library and a native preview without AI. Keep GO/panic, saved tuning and existing song defaults unchanged.
4. Retain the final APK, source, music, licensing, backup archives and concise evidence. Remove only inventoried Show Control generated caches, build intermediates, superseded installers and stopped synthetic test-device files, with checked absolute boundaries and no traversal through links. Preserve other workspace projects and personal files.

## Status

The final APK is `Show-Control-All-170-Songs-2026-11-05.apk` (1,483,274,788 bytes), SHA-256 `0085AED513FA4F444E2F760F96D32A001FDE4E35E4A72FAC239E124D9F4C716D`. It is an internally signed Android test build, containing all 170 MP3s, 20 covers/playlists, direction notes and credits. Open **Shows → Included music → Install included music** once. Allow several additional GB for archive staging and installed audio.

All nine source/native checks passed: types, lint, 1,635 tests across 89 suites, architecture, ten-language translations, tokens, native audio, native downloads and native initialization. Android release assembly and four module release lints passed. The APK signature and installed APK checksum were verified. Streaming inspection of the actual APK verified all 190 audio/artwork payload CRCs and SHA-256 hashes, every recording's identity, and the attribution assets. All 66 native libraries, the Android manifest and resources remain byte-identical to the preceding R8 APK; GO/panic transport was not changed.

On the owned Android 15 emulator, cancelling during real archive validation left the library unchanged and released temporary space. A subsequent installation completed with all 170 hashes, retaining the original selected three-cue show and 17 other shows. Cipher started and stopped in native isolated preview. Process termination/relaunch retained the collection and original selection with no active audio service or main media session. Existing English/Dark Blue settings were retained. Automatic approval review rejected an optional persisted-theme change; it was not executed or bypassed. Real SQLite regression tests separately cover preserving Hebrew/Purple Night and selection.

The three music ZIPs moved to E: were restored to their original C: source music folder and verified before removing the offloaded copies. The canonical C: music library was already intact. Source recordings, credits, research, originals and edition backups are preserved; unrelated E: media was untouched.

Post-cleanup verification rehashed every MP3 and all three ZIPs in both C: music libraries: 340 recording checks and six archive checks matched, with all credit files present. The final APK SHA-256 also matched again.

Generated-file cleanup completed without failures: **58,582 files removed, 37,651,209,747 logical bytes, and 37,354,819,584 bytes (37.35 GB) of C: free space recovered**. The reviewed allowlist covered app build/cache outputs, generated APK asset copies, stopped synthetic test-device data, music-analysis scratch metadata and two superseded APKs. The owned emulator was stopped normally first. The final APK hash remained unchanged. Both music libraries, source, dependencies, credentials and source-recovery copies were excluded. Concise current evidence is retained under `docs/qa/evidence/bundled-music-2026-11-05/`; older reports' raw `.native-check` paths were temporary and were removed at the owner's request. Shared SDK/global caches and unrelated projects/personal files were not swept.

No AI/provider requests were made. Physical Android/OEM, iOS, exact remotes/Flic, acoustic/HDMI, endurance, accessibility-device and store-release validation remain separate gates. This delivery does not claim customer-release readiness.

## Final scope audit

The project `crit` audit reviewed this task's packaging, native asset preparation, UI installation states, cancellation ownership, preference-preserving transaction, build/verification tools and exact cleanup boundaries. The installer reuses the existing validated archive pipeline; it introduces no persisted schema, provider request or transport timing. Lean builds omit the included-music panel, and the bundled archive is opt-in during Android assembly. No unresolved critical/high finding was identified in this task. The previously documented R8 Finder Retry and device/release gates remain outside this packaging pass. No automatic improvement goal was created or resumed.
