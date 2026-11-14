param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskOutput=[IO.Path]::GetFullPath($OutputDirectory)
if(Test-Path -LiteralPath $taskOutput){throw 'Preserve existing native-test evidence; use a fresh directory'}
New-Item -ItemType Directory -Path $taskOutput | Out-Null
$taskModule=Join-Path $taskRoot 'modules/show-audio/android/src/main/java/app/showcontrol/audio/ShowAudioModule.kt'
$taskService=Join-Path $taskRoot 'modules/show-audio/android/src/main/java/app/showcontrol/audio/ShowAudioService.kt'
$taskCoordinator=Join-Path $taskRoot 'modules/show-audio/android/src/main/java/app/showcontrol/audio/NativeRemoteCoordinator.kt'
$taskHashes=@(foreach($taskFile in @($taskModule,$taskService,$taskCoordinator)){[ordered]@{path=$taskFile;sha256=(Get-FileHash -LiteralPath $taskFile).Hash}})
$taskRuntimeText=Get-Content -LiteralPath $taskModule -Raw
$taskRuntimeStart=$taskRuntimeText.IndexOf('object ShowAudioRuntime {')
if($taskRuntimeStart -lt 0){throw 'Actual runtime boundary missing'}
$taskRuntime='package app.showcontrol.audio'+[Environment]::NewLine+'import android.content.Context; import android.content.Intent; import android.app.Activity; import android.os.Handler; import android.os.Looper'+[Environment]::NewLine+$taskRuntimeText.Substring($taskRuntimeStart)
Set-Content -LiteralPath "$taskOutput/Runtime.kt" -Value $taskRuntime -Encoding utf8
$taskServiceText=Get-Content -LiteralPath $taskService -Raw
function Read-ActualMethodRange([string]$start,[string]$end){
  $taskFrom=$taskServiceText.IndexOf($start); $taskTo=$taskServiceText.IndexOf($end,$taskFrom+1)
  if($taskFrom -lt 0 -or $taskTo -le $taskFrom -or $taskServiceText.IndexOf($start,$taskFrom+1) -ge 0){throw 'Actual service boundary changed; review the harness'}
  return $taskServiceText.Substring($taskFrom,$taskTo-$taskFrom)
}
$taskHarness=Get-Content -LiteralPath (Join-Path $taskRoot 'tests/native/preview-lifecycle/ServiceHarness.kt') -Raw
$taskHarness=$taskHarness.Replace('// ACTUAL_CANCEL_STARTUP',(Read-ActualMethodRange '  internal fun cancelStartup(' '  override fun onGetSession('))
$taskHarness=$taskHarness.Replace('// ACTUAL_SHUTDOWN',(Read-ActualMethodRange '  internal fun shutdownEngine(' '  private fun executeCommand('))
$taskHarness=$taskHarness.Replace('// ACTUAL_STOP_PREVIEW',(Read-ActualMethodRange '  internal fun stopPreview(' '  internal fun dispatchSemantic('))
Set-Content -LiteralPath "$taskOutput/Service.kt" -Value $taskHarness -Encoding utf8
$taskCache=Join-Path $env:USERPROFILE '.gradle/caches/modules-2/files-2.1'
$taskClasspath=@(foreach($taskFolder in @('org.jetbrains.kotlin/kotlin-compiler-embeddable/2.1.20','org.jetbrains.kotlin/kotlin-stdlib/2.1.20','org.jetbrains.kotlin/kotlin-script-runtime/2.1.20','org.jetbrains.kotlin/kotlin-reflect/2.1.20','org.jetbrains.intellij.deps/trove4j','org.jetbrains/annotations','org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm/1.9.0')){
  $taskJar=Get-ChildItem -LiteralPath (Join-Path $taskCache $taskFolder) -Filter '*.jar' -Recurse | Sort-Object FullName | Select-Object -First 1
  if(!$taskJar){throw 'Required cached native compiler dependency missing; no download attempted'}
  $taskJar.FullName
})
$taskJava='C:/Program Files/Android/Android Studio/jbr/bin/java.exe'
$taskSources=@("$taskOutput/Runtime.kt","$taskOutput/Service.kt",$taskCoordinator,(Join-Path $taskRoot 'modules/show-audio/android/src/main/java/app/showcontrol/audio/BackgroundSessionPolicy.kt'))
$taskSources+=@(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'tests/native/preview-lifecycle') -Filter '*.kt' | Where-Object{$_.Name -ne 'ServiceHarness.kt'} | ForEach-Object{$_.FullName})
New-Item -ItemType Directory -Path "$taskOutput/classes" | Out-Null
& $taskJava -cp ($taskClasspath -join ';') org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -jvm-target 17 -classpath ($taskClasspath -join ';') -d "$taskOutput/classes" @taskSources *> "$taskOutput/compile.log"
$taskExit=$LASTEXITCODE
if($taskExit -eq 0){& $taskJava -cp ("$taskOutput/classes;"+($taskClasspath -join ';')) app.showcontrol.audio.PreviewLifecycleRegressionKt *> "$taskOutput/test.log"; $taskExit=$LASTEXITCODE}
foreach($taskRow in $taskHashes){if((Get-FileHash -LiteralPath $taskRow.path).Hash -ne $taskRow.sha256){throw 'Actual native source changed during the test; evidence invalid'}}
[ordered]@{exitCode=$taskExit;actualSources=$taskHashes;hardwareDependencies='controlled stubs';finishedUtc=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json -Depth 5 | Set-Content "$taskOutput/result.json"
Get-Content "$taskOutput/result.json" -Raw
if(Test-Path -LiteralPath "$taskOutput/test.log"){Get-Content "$taskOutput/test.log"}
exit $taskExit
