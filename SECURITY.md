# Security policy

## Supported versions

The project is pre-release and has no store-supported production version yet. Security fixes target the current main development line. When public versions exist, this file will list their support windows. Do not infer production readiness from the existence of this policy.

## Report privately

Do not open a public issue for a vulnerability. Use the repository host's private security-advisory/reporting feature when available. If the transferred repository has no private reporting channel, contact the maintainer through the private address published in that repository's security settings. This scaffold intentionally does not invent an email address. If no private channel is visible, open a public issue containing only “Please publish a private security contact” and no exploit details.

Include, when safe:

- affected commit/build/platform/OS and exact hardware/firmware;
- vulnerability category, impact, preconditions, and minimal reproducible steps;
- whether it can cause unintended audio, block panic/recovery, corrupt/lose shows, bypass bundle validation/entitlements, disclose private show/media data, or accept unauthorized remote control;
- redacted logs or proof of concept with synthetic shows/media only;
- suggested remediation or temporary mitigation.

Never send real show media, cue/show/file names, notes, store receipts, signing keys, controller identifiers, audience data, credentials, or participant audio/images unless a maintainer explicitly requests the minimum item through an agreed encrypted channel and you have rights/consent.

## Priority cases

Treat these as urgent:

- remote or imported input can fire a cue outside an armed/authorized context;
- panic/stop can be blocked, delayed materially, or paywalled;
- route/interruption/relaunch can produce unintended or speaker-fallback audio;
- archive/file parsing allows traversal, symlink escape, archive bomb, memory/resource exhaustion, code execution, or checksum/schema bypass;
- database/migration/import/purchase state can corrupt or erase a show/backup;
- LAN/browser/watch/Flic/controller channels allow unauthorized/replayed commands or leaked show data;
- promotion/manifest/store/update signing can be forged/downgraded or enter Armed/Run/Recovery/system surfaces;
- secrets, receipts, private keys, imported media, show metadata, diagnostics, mic/camera data, or audience submissions leave the device unexpectedly;
- optional commercial/network code can block or alter free core playback.

## Response process

Maintainers should acknowledge a usable report promptly, reproduce on synthetic data, assign severity, coordinate a fix and disclosure date, add regression/adversarial tests, rerun the affected physical/hardware/store matrix, prepare rollback/mitigation, and credit the reporter if desired. Exact timelines depend on maintainer capacity and risk; no guaranteed bounty or response SLA exists unless a future program says otherwise.

Do not publish exploit details until a safe version/mitigation is available to affected users. For a live-safety issue, pause release and advise users to use a known-good build/manual backup. Never silently force an update during a show.

## Operational security

Signing keys, store credentials, certificates, promotion/pack private keys, receipts, and production environment secrets never belong in Git or client code. Use least privilege, protected CI environments, dual review, rotation/revocation drills, signed immutable artifacts, dependency/lockfile review, and a documented source/notice delivery path. Core operation remains offline, limiting but not eliminating risk.

