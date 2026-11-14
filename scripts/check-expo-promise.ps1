param(
  [string]$PromiseSource,
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
if (-not $PromiseSource) {
  $PromiseSource = Join-Path $taskRoot 'node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/jni/PromiseImpl.kt'
}
$taskSource = (Resolve-Path -LiteralPath $PromiseSource).Path
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $taskRoot ('.native-check/expo-promise-regression/' + [guid]::NewGuid().ToString('N'))
}
$taskOutput = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
$taskHashBefore = (Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash
$taskCache = Join-Path $env:USERPROFILE '.gradle/caches/modules-2/files-2.1'
$taskClasspath = @()
foreach ($taskFolder in @('org.jetbrains.kotlin/kotlin-compiler-embeddable/2.1.20', 'org.jetbrains.kotlin/kotlin-stdlib/2.1.20', 'org.jetbrains.kotlin/kotlin-script-runtime/2.1.20', 'org.jetbrains.kotlin/kotlin-reflect/2.1.20', 'org.jetbrains.intellij.deps/trove4j', 'org.jetbrains/annotations', 'org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm/1.9.0')) {
  $taskJar = Get-ChildItem -LiteralPath (Join-Path $taskCache $taskFolder) -Filter '*.jar' -Recurse | Sort-Object FullName | Select-Object -First 1
  if (-not $taskJar) { throw "Required cached Kotlin test dependency is missing: $taskFolder. No downloads were attempted." }
  $taskClasspath += $taskJar.FullName
}
$taskJava = if ($env:JAVA_HOME -and (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe'))) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { 'C:/Program Files/Android/Android Studio/jbr/bin/java.exe' }
if (-not (Test-Path -LiteralPath $taskJava)) { throw 'Set JAVA_HOME to a JDK before running the Expo Promise regression.' }
$taskStubs = Get-ChildItem -LiteralPath (Join-Path $taskRoot 'tests/native/expo-promise/stubs') -Filter '*.kt' | Sort-Object FullName | ForEach-Object { $_.FullName }
$taskSources = @($taskSource, (Join-Path $taskRoot 'tests/native/expo-promise/PromiseImplRegression.kt')) + $taskStubs
$taskClasses = Join-Path $taskOutput 'classes'
New-Item -ItemType Directory -Force -Path $taskClasses | Out-Null
Write-Output "Compiling actual Expo Promise source: $taskSource"
Write-Output "Source SHA256: $taskHashBefore"
& $taskJava -cp ($taskClasspath -join ';') org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -jvm-target 17 -classpath ($taskClasspath -join ';') -d $taskClasses @taskSources
$taskExit = $LASTEXITCODE
if ($taskExit -eq 0) {
  & $taskJava -cp ($taskClasses + ';' + ($taskClasspath -join ';')) expo.modules.kotlin.jni.PromiseImplRegressionKt
  $taskExit = $LASTEXITCODE
}
$taskHashAfter = (Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash
if ($taskHashBefore -ne $taskHashAfter) { throw 'The source changed during the regression; this result is invalid.' }
Write-Output "Source unchanged: $taskHashAfter"
exit $taskExit
