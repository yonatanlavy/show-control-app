#requires -Version 7.0
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$')][string]$RunId,
  [Parameter(Mandatory=$true)][string]$ExpectedApk,
  [Parameter(Mandatory=$true)][string]$ProbeMetadata,
  [ValidateSet('app.showcontrol.working')][string]$ExpectedPackage='app.showcontrol.working',
  [string]$Adb="$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskOutput=Join-Path $taskRoot ".native-check/rehearsal-seek-run-$RunId"
if(Test-Path -LiteralPath $taskOutput){throw 'Preserve prior evidence; use a fresh UUID'}
New-Item -ItemType Directory -Path $taskOutput | Out-Null
$script:taskCommandIndex=0
function Invoke-TaskAdb([string[]]$Arguments){
  $script:taskCommandIndex++
  $taskName='command-'+$script:taskCommandIndex
  $taskProcess=Start-Process -FilePath $Adb -ArgumentList (@('-s','emulator-5564')+$Arguments) -WindowStyle Hidden -PassThru -RedirectStandardOutput "$taskOutput/$taskName.out.txt" -RedirectStandardError "$taskOutput/$taskName.err.txt"
  if(!$taskProcess.WaitForExit(10000)){
    [ordered]@{pid=$taskProcess.Id;arguments=$Arguments;stdout="$taskOutput/$taskName.out.txt";stderr="$taskOutput/$taskName.err.txt"} | ConvertTo-Json | Set-Content "$taskOutput/pending-handle.json"
    throw "OBSERVATION_PENDING: Reconcile PID $($taskProcess.Id); do not restart"
  }
  $taskProcess.WaitForExit()
  if($taskProcess.ExitCode -ne 0){throw "ADB observation failed: $taskName"}
  return (Get-Content -LiteralPath "$taskOutput/$taskName.out.txt" -Raw)
}
$taskAvd=@((Invoke-TaskAdb @('emu','avd','name')).Split("`n") | ForEach-Object {$_.Trim()} | Where-Object {$_})
if($taskAvd.Count -ne 2 -or $taskAvd[0] -ne 'ShowControl_SingleButton_QA' -or $taskAvd[1] -ne 'OK'){throw 'Wrong owned AVD; preserve it'}
$taskHash=(Get-FileHash -LiteralPath $ExpectedApk).Hash
$taskMetadata=Get-Content -LiteralPath $ProbeMetadata -Raw | ConvertFrom-Json
if($taskMetadata.sameSigner -ne $true -or $taskMetadata.targetPackage -ne $ExpectedPackage -or $taskMetadata.targetApkSha256 -ne $taskHash -or $taskMetadata.sha256 -notmatch '^[A-F0-9]{64}$'){throw 'Probe metadata differs'}
if($taskMetadata.sourceSha256 -ne (Get-FileHash "$PSScriptRoot/RehearsalSeekProbe.java").Hash -or $taskMetadata.manifestSha256 -ne (Get-FileHash "$PSScriptRoot/AndroidManifest.xml").Hash){throw 'Probe source changed after build'}
foreach($taskPackage in @($ExpectedPackage,'app.showcontrol.rehearsalseekprobe')){
  $taskPath=(Invoke-TaskAdb @('shell','pm','path',$taskPackage)).Trim()
  if($taskPath -notmatch '^package:(/data/app/[^\r\n]+/base\.apk)$'){throw 'Unexpected package path'}
  $taskInstalled=((Invoke-TaskAdb @('shell','sha256sum',$Matches[1])) -split '\s+')[0].ToUpperInvariant()
  $taskExpected=if($taskPackage -eq $ExpectedPackage){$taskHash}else{$taskMetadata.sha256}
  if($taskInstalled -ne $taskExpected){throw 'Installed APK checksum differs'}
}
$taskInstrumentation=Invoke-TaskAdb @('shell','dumpsys','activity','processes')
if($taskInstrumentation -notmatch 'ACTIVITY MANAGER RUNNING PROCESSES' -or $taskInstrumentation -match '(?i)instrumentation|mInstr='){throw 'Preserve existing instrumentation or unavailable process state'}
$taskServices=Invoke-TaskAdb @('shell','dumpsys','activity','services',$ExpectedPackage)
if($taskServices -notmatch 'ACTIVITY MANAGER SERVICES' -or $taskServices -match 'ServiceRecord'){throw 'Observed idle services required; preserve unavailable or active state'}
$taskArgs=@('-s','emulator-5564','shell','am','instrument','-w','-r','-e','token',$RunId,'-e','expectedPackage',$ExpectedPackage,'-e','expectedApkSha256',$taskHash,'app.showcontrol.rehearsalseekprobe/app.showcontrol.rehearsalseekprobe.RehearsalSeekProbe')
$taskProcess=Start-Process -FilePath $Adb -ArgumentList $taskArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput "$taskOutput/instrument.out.txt" -RedirectStandardError "$taskOutput/instrument.err.txt"
$taskHandle=[ordered]@{runId=$RunId;pid=$taskProcess.Id;targetSha256=$taskHash;probeSha256=$taskMetadata.sha256;serial='emulator-5564';avd='ShowControl_SingleButton_QA';startedUtc=(Get-Date).ToUniversalTime().ToString('o');stdout="$taskOutput/instrument.out.txt";stderr="$taskOutput/instrument.err.txt"}
$taskHandle | ConvertTo-Json | Set-Content "$taskOutput/handle.json"
if(!$taskProcess.WaitForExit(55000)){$taskHandle | ConvertTo-Json | Set-Content "$taskOutput/pending-handle.json";throw "OBSERVATION_PENDING: Reconcile PID $($taskProcess.Id); do not restart"}
$taskProcess.WaitForExit()
$taskText=Get-Content -LiteralPath "$taskOutput/instrument.out.txt" -Raw
$taskAfter=Invoke-TaskAdb @('shell','dumpsys','activity','services',$ExpectedPackage)
$taskPassed=$taskProcess.ExitCode -eq 0 -and $taskText -match 'INSTRUMENTATION_RESULT: casesPassed=11' -and $taskText -match 'INSTRUMENTATION_RESULT: passed=true' -and $taskText -match 'INSTRUMENTATION_RESULT: ownedFilesRemoved=true' -and $taskText -match 'INSTRUMENTATION_RESULT: libraryTablesUnchanged=true' -and $taskText -match 'INSTRUMENTATION_RESULT: nativeOwnerReleased=true' -and $taskText -match 'INSTRUMENTATION_CODE: -1' -and $taskText -notmatch 'INSTRUMENTATION_RESULT: (failure|cleanupFailure)=' -and $taskAfter -match 'ACTIVITY MANAGER SERVICES' -and $taskAfter -notmatch 'ServiceRecord'
[ordered]@{runId=$RunId;pid=$taskProcess.Id;adbExitCode=$taskProcess.ExitCode;passed=$taskPassed;targetSha256=$taskHash;probeSha256=$taskMetadata.sha256;casesExpected=11;finishedUtc=(Get-Date).ToUniversalTime().ToString('o');productionEndpoint=$false;libraryWrites=$false;providerRequests=0;physicalOrAcousticEvidence=$false} | ConvertTo-Json | Set-Content "$taskOutput/terminal.json"
$taskText
if(!$taskPassed){throw 'Probe failed; inspect retained evidence and reconcile the same handle before further action'}
