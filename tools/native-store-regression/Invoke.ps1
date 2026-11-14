#requires -Version 7.0
param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9-]{36}$')][string]$RunId)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskOutput=Join-Path $taskRoot ".native-check/native-store-$RunId"
if(Test-Path -LiteralPath $taskOutput){throw 'Preserve prior evidence; use a fresh RunId'}
New-Item -ItemType Directory -Path $taskOutput | Out-Null
$taskCache='C:/Users/Administrator/.gradle/caches/modules-2/files-2.1'
$taskClasspath=@()
foreach($taskFolder in @('org.jetbrains.kotlin/kotlin-compiler-embeddable/2.1.20','org.jetbrains.kotlin/kotlin-stdlib/2.1.20','org.jetbrains.kotlin/kotlin-script-runtime/2.1.20','org.jetbrains.kotlin/kotlin-reflect/2.1.20','org.jetbrains.intellij.deps/trove4j','org.jetbrains/annotations','org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm/1.9.0')){
  $taskFile=Get-ChildItem -LiteralPath (Join-Path $taskCache $taskFolder) -Filter '*.jar' -Recurse | Select-Object -First 1
  if(!$taskFile){throw 'Required cached compiler unavailable; no download attempted'}
  $taskClasspath+=$taskFile.FullName
}
$taskSources=@('modules/show-audio/android/src/main/java/app/showcontrol/audio/NativeRemoteCoordinator.kt','modules/show-commerce/android/src/main/java/app/showcontrol/commerce/ShowCommerceModule.kt')
$taskSources+=@('Android.kt','Activity.kt','Context.kt','Promise.kt','Queues.kt','Module.kt','Billing.kt','StoreLifecycleRegression.kt') | ForEach-Object {"tests/native/store-lifecycle/$_"}
$taskLedger=@($taskSources | ForEach-Object {[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $taskRoot $_)).Hash}})
$taskLedger | ConvertTo-Json | Set-Content (Join-Path $taskOutput 'sources.json')
$taskJava='C:/Program Files/Android/Android Studio/jbr/bin/java.exe'
$taskCompile=1;$taskRun=$null
try{
  & $taskJava -cp ($taskClasspath -join ';') org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -jvm-target 17 -classpath ($taskClasspath -join ';') -d (Join-Path $taskOutput 'classes') @($taskSources | ForEach-Object {Join-Path $taskRoot $_}) *> (Join-Path $taskOutput 'compiler.log')
  $taskCompile=$LASTEXITCODE
  if($taskCompile -eq 0){
    & $taskJava -cp ((Join-Path $taskOutput 'classes')+';'+($taskClasspath -join ';')) app.showcontrol.commerce.StoreLifecycleRegressionKt *> (Join-Path $taskOutput 'regression.log')
    $taskRun=$LASTEXITCODE
    Get-Content -LiteralPath (Join-Path $taskOutput 'regression.log') -Tail 18
  }else{Get-Content -LiteralPath (Join-Path $taskOutput 'compiler.log') -Tail 18}
}finally{
  [ordered]@{runId=$RunId;compilerExit=$taskCompile;regressionExit=$taskRun;actualModuleAndAudioCoordinator=$true;syntheticAndroidExpoAndBilling=$true;monetaryTransactions=0;providers=0;finishedUtc=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content (Join-Path $taskOutput 'terminal.json')
}
if($taskCompile -ne 0 -or $taskRun -ne 0){exit 1}
