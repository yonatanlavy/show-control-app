# Notices

Show Control is an independent project for performer-operated show audio.

Copyright © 2026 Show Control contributors.

Except where a file or bundled asset states otherwise, source files in this repository are made available under the MIT License (`MIT`). See `LICENSE`. Copies and distributed builds must include the copyright and permission notice from `LICENSE`, plus the notices required by the third-party components listed below.

## Project boundaries

MIT is a permissive license and does not require modifications to be published. Separate optional modules or content may use other terms when kept in separate files/packages across documented interfaces. Keeping the safety core, interoperability, and fixes in the public repository is project policy, not a license obligation; it is governed by `AGENTS.md` and `later-stages/08-commercial-ecosystem.md`. Third-party copyleft components keep their own source obligations for any build that includes them. This notice is project guidance, not legal advice.

The project name, icon, and future brand assets are not automatically licensed as trademarks merely because source code is open. No trademark grant or endorsement is implied beyond the license's requirements. A future trademark policy should be added before broad redistribution under modified branding.

## Third-party software and services

Dependencies listed in `package.json` and `pnpm-lock.yaml` retain their own copyrights and licenses. Redistributors must reproduce all notices/licenses required by those packages and by native platform SDKs. Generated store builds should include an accessible third-party notices view produced from the actual resolved build, not from this summary.

Offline speech uses [whisper.cpp](https://github.com/ggml-org/whisper.cpp), pinned at v1.9.5 / `d1be6fde11ac6e0407606b4e42fe72d34add8037`, under its MIT license. The preparation script verifies the commit and license; preserve the upstream `LICENSE` in redistributed native builds. The downloaded multilingual base model is verified against its pinned SHA-256 and remains separate from application source. This project does not redistribute the proprietary Flic iOS SDK; obtaining its licensed SDK is a build/validation prerequisite.

Optional cloud preparation calls OpenAI, Anthropic and ElevenLabs directly with the user's keys. Provider account terms and generation charges remain the user's provider relationship; core playback does not depend on these services. OMS references describe functional requirements and imply no endorsement or affiliation.

Expo, React, React Native, Apple, iOS, iPad, iPhone, App Store, Android, Google Play, Flic, MediaStar, Audio Ape, QLab, Go Button, MIDI, OSC, DMX, Art-Net, sACN, NDI, and other names are trademarks or identifiers of their respective owners. References describe platforms, protocols, research, or intended compatibility; they do not imply affiliation, sponsorship, certification, or endorsement. Verify exact trademark/SDK compatibility terms before publication.

## Content and media

The app must not ship commercial music or other media without redistribution rights. User-imported show files remain the user's responsibility and are not relicensed by the app. Demo tones, fonts, icons, images, translations, content packs, and templates require per-asset provenance and license records before release. The current font packages and any source-owned assets remain subject to their packaged license files.

The owner-supplied market map under `docs/research/` is research provenance, not application code, a product endorsement, or permission to copy third-party material beyond the excerpt/source rules already embodied there. Its linked pages and product claims belong to their respective owners and require fresh verification before public reuse.

## Commercial additions

The v1 `remove_promotions` product and future optional one-time add-ons do not change the MIT license of project source files. Store terms, content-pack licenses, creator agreements, and separately licensed modules must be disclosed at purchase/import and preserved in export where relevant. Prices are storefront-provided and are never asserted in this notice.

# Android downloader dependency record

The Android preparation module resolves io.github.junkfood02.youtubedl-android library/common/ffmpeg **0.18.1** from Maven Central. The upstream Android adapter is **GPL-3.0**. Preserve its full license and matching source from [upstream](https://github.com/yausername/youtubedl-android) and Maven sources artifacts. The iOS module does not link it.

The pinned yt-dlp **2026.08.19** executable and checksums are recorded in modules/show-downloads/runtime-lock.json. Preserve [matching yt-dlp source](https://github.com/yt-dlp/yt-dlp/tree/2026.08.19) and executable-bundled dependency notices as their licenses require. Python, QuickJS and FFmpeg retain upstream licenses. FFmpeg's actual linked configuration and matching source belong in the release inventory.

Project source is MIT-licensed, which is compatible with GPL-3.0. An Android build that includes this GPL-3.0 adapter is a combined work: distributing that build requires GPL-3.0 compliance for the build as a whole, including corresponding source, while the project's own files remain available under MIT. Preserve both sets of notices. iOS builds do not include the adapter. Store publication remains separate and requires a complete resolved-binary license/source package. Internal development builds are the current validation scope.

