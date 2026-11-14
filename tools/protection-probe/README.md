# Installed protection observer

Separate Android instrumentation for the owned synthetic QA AVD and provisional `app.showcontrol.working` test identity. It never ships. Verify the exact APK and same public test signer and confirm idle audio/voice services before starting: instrumentation can end a target process. Never attach to a prepared or real-user session.

Supply a fresh UUID `token`. The observer checks the installed native background reader against an independent current `ActivityManager.MemoryInfo.lowMemory` reading. It exercises 384 packaged pure notification-policy combinations with synthetic flags. This neither simulates real memory pressure nor proves a long show survives it. It reads no library, media, text inputs, provider keys, receipts or controller identifiers and dispatches no transport/settings/permission actions.

Successful instrumentation returns `INSTRUMENTATION_CODE: 0` and writes one token-owned `protection-probe-<token>.json` under target external files. Preserve the local receipt, then remove that exact file and only this helper package. Run normal UI/background tests separately after instrumentation completes. A shell exit code alone is insufficient: inspect the instrumentation result code and error text.
