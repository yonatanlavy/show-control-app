# Dependency patches

## expo-modules-core 57.0.24: Android Promise settlement

`expo-modules-core@57.0.24.patch` backports [Expo PR #51052](https://github.com/expo/expo/pull/51052), merged as [`3d8a4f0b04701493d71fe78bb28cac8a1290a502`](https://github.com/expo/expo/commit/3d8a4f0b04701493d71fe78bb28cac8a1290a502). The patched `PromiseImpl.kt` matches that merged source exactly. It supports **57.0.24 only** and is registered in `pnpm-workspace.yaml` and `pnpm-lock.yaml`. The older `.22` patch is retained for rollback history and is not registered in the current dependency graph.

Concurrent resolution/rejection could dispatch the same native callback twice and fatally throw `JavaCallback was already settled`. This narrow backport claims settlement atomically before dispatch and releases the claim if value conversion throws. The reviewed `.24` package still contains the race: its unpatched source fails 11 of the 14 regressions; carrying the backport forward passes all 14. Do not remove it based on version number alone. The observed startup crash matches this framework defect; the earlier preflight ANR remains a separate unresolved issue.

Expo's original MIT license remains in the dependency's `LICENSE` file. The patch changes no license, permissions, app data schema, or SDK version.

From the repository root, use the **pnpm 11.16.0** version pinned by `package.json`. Verify `pnpm --version` prints `11.16.0`, then install the committed patch and frozen dependency graph:

```powershell
pnpm install --frozen-lockfile --offline --ignore-scripts --reporter append-only
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-expo-promise.ps1
```

If the system wrapper reports another version, use `npm exec --yes --package=pnpm@11.16.0 -- pnpm` in place of `pnpm`. Installation remains explicit, with lifecycle scripts disabled; no global package-manager replacement is needed.

The regression requires **PowerShell 7** (`pwsh`), JDK 17 or newer (`JAVA_HOME`, or Android Studio's bundled JDK), and the Kotlin 2.1.20 test dependencies already present in the local Gradle cache. It compiles the actual installed `PromiseImpl.kt` with small JNI/type boundary stubs. It forces overlapping settlements, covers every resolution overload, and checks conversion-failure recovery. It performs no dependency downloads or app/provider requests. The original source fails 11 race cases; the patched source passes all 14 cases. A native rebuild is required to include the fix in an APK.

Remove the patch and its registration only after a verified SDK migration includes the upstream fix. Regenerate the lockfile, run the regression against the newly installed upstream source, and pass the Android release build and cold-start checks before considering removal complete. Retain the regression to protect against recurrence.
