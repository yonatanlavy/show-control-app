#requires -Version 7.0
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9-]{36}$')][string]$RunId,
  [Parameter(Mandatory=$true)][string]$ExpectedApk,
  [Parameter(Mandatory=$true)][string]$ProbeMetadata,
  [string]$Adb = "$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskOutput=Join-Path $taskRoot ".native-check/audience-image-probe-$RunId"
if(Test-Path -LiteralPath $taskOutput){throw 'Preserve previous evidence; choose a fresh UUID'}
$taskAvd=(@(& $Adb -s emulator-5562 emu avd name | ForEach-Object{$_.Trim()} | Where-Object{$_}) -join '|')
if($LASTEXITCODE -ne 0 -or $taskAvd -ne 'ShowControl_QA_API35|OK'){throw 'Wrong device; preserve it'}
$taskMetadata=Get-Content -LiteralPath $ProbeMetadata -Raw | ConvertFrom-Json
$taskExpectedHash=(Get-FileHash -LiteralPath $ExpectedApk).Hash
if($taskMetadata.sameSigner -ne $true -or $taskMetadata.targetApkSha256 -ne $taskExpectedHash -or $taskMetadata.sha256 -notmatch '^[A-F0-9]{64}$' -or $taskMetadata.fixtureSha256 -notmatch '^[A-F0-9]{64}$'){throw 'Probe metadata targets a different build'}
$taskPath=(@(& $Adb -s emulator-5562 shell pm path app.showcontrol.working) -join '').Trim()
if($taskPath -notmatch '^package:(/data/app/[^\r\n]+/base\.apk)$'){throw 'Unexpected installed package path'}
$taskInstalledHash=(@(& $Adb -s emulator-5562 shell sha256sum $Matches[1]) -join '').Split(' ')[0].Trim().ToUpperInvariant()
if($LASTEXITCODE -ne 0 -or $taskInstalledHash -ne $taskExpectedHash){throw 'Installed target differs'}
$taskProbePath=(@(& $Adb -s emulator-5562 shell pm path app.showcontrol.visualimageprobe) -join '').Trim()
if($taskProbePath -notmatch '^package:(/data/app/[^\r\n]+/base\.apk)$'){throw 'Unexpected installed probe path'}
$taskProbeHash=(@(& $Adb -s emulator-5562 shell sha256sum $Matches[1]) -join '').Split(' ')[0].Trim().ToUpperInvariant()
if($LASTEXITCODE -ne 0 -or $taskProbeHash -ne $taskMetadata.sha256){throw 'Installed probe differs'}
$taskInstrumentation=(& $Adb -s emulator-5562 shell dumpsys activity processes | Out-String)
if($LASTEXITCODE -ne 0 -or $taskInstrumentation -notmatch 'ACTIVITY MANAGER RUNNING PROCESSES' -or $taskInstrumentation -match '(?i)instrumentation|mInstr='){throw 'Cannot confirm an uninstrumented process state; preserve it'}
$taskServices=(& $Adb -s emulator-5562 shell dumpsys activity services app.showcontrol.working | Out-String)
if($LASTEXITCODE -ne 0 -or $taskServices -match 'ServiceRecord'){throw 'Idle target required; preserve active services'}
New-Item -ItemType Directory -Path $taskOutput | Out-Null
$taskArgs=@('-s','emulator-5562','shell','am','instrument','-w','-r','-e','token',$RunId,'-e','expectedApkSha256',$taskExpectedHash,'-e','fixtureSha256',$taskMetadata.fixtureSha256,'app.showcontrol.visualimageprobe/app.showcontrol.visualimageprobe.VisualImageProbe')
$taskStart=(Get-Date).ToUniversalTime()
$taskProcess=Start-Process -FilePath $Adb -ArgumentList $taskArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput "$taskOutput/instrument.out.txt" -RedirectStandardError "$taskOutput/instrument.err.txt"
$taskRunning=[ordered]@{runId=$RunId;pid=$taskProcess.Id;targetSha256=$taskExpectedHash;startedUtc=$taskStart.ToString('o');stdout="$taskOutput/instrument.out.txt";stderr="$taskOutput/instrument.err.txt"}
$taskRunning | ConvertTo-Json | Set-Content "$taskOutput/handle.json"
if(!$taskProcess.WaitForExit(45000)) {
  $taskRunning | ConvertTo-Json | Set-Content "$taskOutput/pending-handle.json"
  throw "OBSERVATION_PENDING: Reconcile PID $($taskProcess.Id); do not restart the target or probe."
}
$taskProcess.WaitForExit()
$taskText=Get-Content -LiteralPath "$taskOutput/instrument.out.txt" -Raw
$taskPassed=$taskProcess.ExitCode -eq 0 -and $taskText -match 'INSTRUMENTATION_RESULT: casesPassed=6' -and $taskText -match 'INSTRUMENTATION_RESULT: ownedFilesRemoved=true' -and $taskText -match 'INSTRUMENTATION_CODE: -1' -and $taskText -notmatch 'INSTRUMENTATION_RESULT: failure='
[ordered]@{runId=$RunId;pid=$taskProcess.Id;adbExitCode=$taskProcess.ExitCode;passed=$taskPassed;casesExpected=6;startedUtc=$taskStart.ToString('o');finishedUtc=(Get-Date).ToUniversalTime().ToString('o');targetSha256=$taskExpectedHash;virtualDisplayOnly=$true;productionFaultEndpoint=$false} | ConvertTo-Json | Set-Content "$taskOutput/terminal.json"
$taskText
if(!$taskPassed){throw 'Image probe failed; inspect retained results without restarting it'}
