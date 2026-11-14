# Native admission QA probe

This separate internal/test instrumentation uses the installed app's real commerce class and real audio admission coordinator. It waits for deliberate silent preparation, checks that native admission rejects without creating a BillingClient, waits for deliberate session exit, then checks idle admission using a no-op work callback. It reads no media, receipts, keys or user identifiers and dispatches no transport or store operation.

Run only against the owned synthetic emulator and a checksum-verified candidate, signed with the same public repository test certificate. Start instrumentation before preparing the synthetic rehearsal; Android may stop the target process when instrumentation starts. The unique lowercase UUID `token` names three result files under the target app's external-files directory: `native-commerce-admission-<token>-ready.json`, `-critical.json`, and `-idle.json`. A failure uses `-failure.json`.

Wait for `ready`, prepare silently through the actual interface, inspect `critical`, exit the session deliberately, then inspect `idle` and instrumentation completion. Each phase has a six-minute deadline. An observation timeout does not mean the instrumentation died: inspect its existing process/result rather than restarting it. Finish only after native session exit. Uninstall this probe afterward and restore emulator settings.

Local packaging automation is retained in the authoring checkout's `.native-check/commerce-admission-build.ps1`. A passing probe proves native admission integration only. It does not prove billing presentation, actual purchases, refund handling, audio output, physical hardware, iOS compilation or customer readiness.
