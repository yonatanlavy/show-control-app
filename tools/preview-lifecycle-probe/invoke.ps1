#requires -Version 7.0
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9-]{36}$')][string]$RunId,
  [Parameter(Mandatory=$true)][string]$ExpectedApk,
  [Parameter(Mandatory=$true)][string]$ProbeMetadata,
  [string]$Adb="$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskOutput=Join-Path $taskRoot ".native-check/preview-probe-$RunId"
if(Test-Path -LiteralPath $taskOutput){throw 'Preserve prior evidence; use a fresh UUID'}
$taskAvd=(@(& $Adb -s emulator-5562 emu avd name | ForEach-Object{$_.Trim()} | Where-Object{$_}) -join '|')
if($LASTEXITCODE -ne 0 -or $taskAvd -ne 'ShowControl_QA_API35|OK'){throw 'Wrong device'}
$taskHash=(Get-FileHash -LiteralPath $ExpectedApk).Hash
$taskMetadata=Get-Content -LiteralPath $ProbeMetadata -Raw | ConvertFrom-Json
if($taskMetadata.sameSigner -ne $true -or $taskMetadata.targetApkSha256 -ne $taskHash -or $taskMetadata.sha256 -notmatch '^[A-F0-9]{64}$'){throw 'Probe metadata differs'}
foreach($taskPackage in @('app.showcontrol.working','app.showcontrol.previewprobe')){
  $taskPath=(@(& $Adb -s emulator-5562 shell pm path $taskPackage) -join '').Trim()
  if($taskPath -notmatch '^package:(/data/app/[^\r\n]+/base\.apk)$'){throw 'Unexpected package path'}
  $taskInstalled=(@(& $Adb -s emulator-5562 shell sha256sum $Matches[1]) -join '').Split(' ')[0].Trim().ToUpperInvariant()
  $taskExpected=if($taskPackage -eq 'app.showcontrol.working'){$taskHash}else{$taskMetadata.sha256}
  if($LASTEXITCODE -ne 0 -or $taskInstalled -ne $taskExpected){throw 'Installed checksum differs'}
}
$taskInstrumentation=(& $Adb -s emulator-5562 shell dumpsys activity processes | Out-String)
if($LASTEXITCODE -ne 0 -or $taskInstrumentation -notmatch 'ACTIVITY MANAGER RUNNING PROCESSES' -or $taskInstrumentation -match '(?i)instrumentation|mInstr='){throw 'Cannot confirm an uninstrumented process state; preserve it'}
$taskServices=(& $Adb -s emulator-5562 shell dumpsys activity services app.showcontrol.working | Out-String)
if($LASTEXITCODE -ne 0 -or $taskServices -match 'ServiceRecord'){throw 'Idle target required; preserve active services'}
New-Item -ItemType Directory -Path $taskOutput | Out-Null
$taskArgs=@('-s','emulator-5562','shell','am','instrument','-w','-r','-e','token',$RunId,'-e','expectedApkSha256',$taskHash,'app.showcontrol.previewprobe/app.showcontrol.previewprobe.PreviewLifecycleProbe')
$taskProcess=Start-Process -FilePath $Adb -ArgumentList $taskArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput "$taskOutput/instrument.out.txt" -RedirectStandardError "$taskOutput/instrument.err.txt"
$taskHandle=[ordered]@{runId=$RunId;pid=$taskProcess.Id;targetSha256=$taskHash;startedUtc=(Get-Date).ToUniversalTime().ToString('o');stdout="$taskOutput/instrument.out.txt";stderr="$taskOutput/instrument.err.txt"}
$taskHandle | ConvertTo-Json | Set-Content "$taskOutput/handle.json"
$taskObserved=$false; $taskValid=$false
for($taskAttempt=0;$taskAttempt -lt 10 -and !$taskProcess.HasExited -and !$taskObserved;$taskAttempt++){
  $taskLive=(& $Adb -s emulator-5562 shell dumpsys activity processes | Out-String)
  $taskValid=$LASTEXITCODE -eq 0 -and $taskLive -match 'ACTIVITY MANAGER RUNNING PROCESSES'
  $taskObserved=$taskValid -and $taskLive -match '(?i)instrumentation|mInstr='
}
[ordered]@{command='dumpsys activity processes';valid=$taskValid;instrumentationObserved=$taskObserved} | ConvertTo-Json | Set-Content "$taskOutput/live-observation.json"
if(!$taskProcess.WaitForExit(45000)){$taskHandle | ConvertTo-Json | Set-Content "$taskOutput/pending-handle.json"; throw "OBSERVATION_PENDING: Reconcile PID $($taskProcess.Id), do not restart"}
$taskProcess.WaitForExit()
$taskText=Get-Content -LiteralPath "$taskOutput/instrument.out.txt" -Raw
$taskPassed=$taskProcess.ExitCode -eq 0 -and $taskText -match 'INSTRUMENTATION_RESULT: casesPassed=12' -and $taskText -match 'INSTRUMENTATION_RESULT: passed=true' -and $taskText -match 'INSTRUMENTATION_RESULT: ownedFilesRemoved=true' -and $taskText -match 'INSTRUMENTATION_RESULT: originalsUnchanged=true' -and $taskText -match 'INSTRUMENTATION_CODE: -1' -and $taskText -notmatch 'INSTRUMENTATION_RESULT: (failure|cleanupFailure)='
[ordered]@{runId=$RunId;pid=$taskProcess.Id;adbExitCode=$taskProcess.ExitCode;passed=$taskPassed;targetSha256=$taskHash;casesExpected=12;finishedUtc=(Get-Date).ToUniversalTime().ToString('o');productionEndpoint=$false;libraryWrites=$false} | ConvertTo-Json | Set-Content "$taskOutput/terminal.json"
$taskText
if(!$taskPassed){throw 'Probe failed; inspect same handle and retained evidence before further action'}
