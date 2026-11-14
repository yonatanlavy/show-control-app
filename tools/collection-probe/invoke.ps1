#requires -Version 7.0
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9-]{36}$')][string]$RunId,
  [Parameter(Mandatory=$true)][ValidateSet('seed','measure','clean','inspect-import','measure-rehearsal')][string]$Operation,
  [Parameter(Mandatory=$true)][string]$ExpectedApk,
  [Parameter(Mandatory=$true)][string]$ProbeMetadata,
  [string]$Adb = "$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskOutput=Join-Path $taskRoot ".native-check/collection-probe-$RunId"
if(Test-Path -LiteralPath $taskOutput){throw 'Preserve previous evidence; choose a fresh UUID'}
$taskSerial=if($Operation -eq 'measure-rehearsal'){'emulator-5564'}else{'emulator-5562'}
$taskExpectedAvd=if($Operation -eq 'measure-rehearsal'){'ShowControl_LibraryLoad_QA|OK'}else{'ShowControl_QA_API35|OK'}
$taskAvd=(@(& $Adb -s $taskSerial emu avd name | ForEach-Object{$_.Trim()} | Where-Object{$_}) -join '|')
if($LASTEXITCODE -ne 0 -or $taskAvd -ne $taskExpectedAvd){throw 'Wrong device; preserve it'}
$taskMetadata=Get-Content -LiteralPath $ProbeMetadata -Raw | ConvertFrom-Json
$taskExpectedHash=(Get-FileHash -LiteralPath $ExpectedApk).Hash
if($taskMetadata.sameSigner -ne $true -or $taskMetadata.targetApkSha256 -ne $taskExpectedHash -or $taskMetadata.sha256 -notmatch '^[A-F0-9]{64}$' -or $taskMetadata.fixtureSha256 -notmatch '^[A-F0-9]{64}$'){throw 'Probe metadata targets a different build'}
$taskPath=(@(& $Adb -s $taskSerial shell pm path app.showcontrol.working) -join '').Trim()
if($taskPath -notmatch '^package:(/data/app/[^\r\n]+/base\.apk)$'){throw 'Unexpected installed package path'}
$taskInstalledHash=(@(& $Adb -s $taskSerial shell sha256sum $Matches[1]) -join '').Split(' ')[0].Trim().ToUpperInvariant()
if($LASTEXITCODE -ne 0 -or $taskInstalledHash -ne $taskExpectedHash){throw 'Installed target differs'}
$taskProbePath=(@(& $Adb -s $taskSerial shell pm path app.showcontrol.collectionprobe) -join '').Trim()
if($taskProbePath -notmatch '^package:(/data/app/[^\r\n]+/base\.apk)$'){throw 'Unexpected installed probe path'}
$taskProbeHash=(@(& $Adb -s $taskSerial shell sha256sum $Matches[1]) -join '').Split(' ')[0].Trim().ToUpperInvariant()
if($LASTEXITCODE -ne 0 -or $taskProbeHash -ne $taskMetadata.sha256){throw 'Installed probe differs'}
$taskInstrumentation=(& $Adb -s $taskSerial shell dumpsys activity processes | Out-String)
if($LASTEXITCODE -ne 0 -or $taskInstrumentation -notmatch 'ACTIVITY MANAGER RUNNING PROCESSES' -or $taskInstrumentation -match '(?i)instrumentation|mInstr='){throw 'Cannot confirm an uninstrumented process state; preserve it'}
$taskServices=(& $Adb -s $taskSerial shell dumpsys activity services app.showcontrol.working | Out-String)
if($LASTEXITCODE -ne 0 -or $taskServices -match 'ServiceRecord'){throw 'Idle target required; preserve active services'}
New-Item -ItemType Directory -Path $taskOutput | Out-Null
$taskArgs=@('-s',$taskSerial,'shell','am','instrument','-w','-r','-e','token',$taskMetadata.fixtureToken,'-e','operation',$Operation,'-e','expectedApkSha256',$taskExpectedHash,'-e','fixtureSha256',$taskMetadata.fixtureSha256,'app.showcontrol.collectionprobe/app.showcontrol.collectionprobe.CollectionProbe')
$taskStart=(Get-Date).ToUniversalTime()
$taskProcess=Start-Process -FilePath $Adb -ArgumentList $taskArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput "$taskOutput/instrument.out.txt" -RedirectStandardError "$taskOutput/instrument.err.txt"
$taskRunning=[ordered]@{runId=$RunId;pid=$taskProcess.Id;operation=$Operation;fixtureToken=$taskMetadata.fixtureToken;targetSha256=$taskExpectedHash;probeSha256=$taskMetadata.sha256;startedUtc=$taskStart.ToString('o');stdout="$taskOutput/instrument.out.txt";stderr="$taskOutput/instrument.err.txt"}
$taskRunning | ConvertTo-Json | Set-Content "$taskOutput/handle.json"
if(!$taskProcess.WaitForExit(45000)) {
  $taskRunning | ConvertTo-Json | Set-Content "$taskOutput/pending-handle.json"
  throw "OBSERVATION_PENDING: Reconcile PID $($taskProcess.Id); do not restart the target or probe."
}
$taskProcess.WaitForExit()
$taskText=Get-Content -LiteralPath "$taskOutput/instrument.out.txt" -Raw
$taskPassed=$taskProcess.ExitCode -eq 0 -and $taskText -match 'INSTRUMENTATION_RESULT: passed=true' -and $taskText -match 'INSTRUMENTATION_CODE: -1' -and $taskText -notmatch 'INSTRUMENTATION_RESULT: failure='
if($Operation -eq 'seed'){$taskPassed=$taskPassed -and $taskText -match 'INSTRUMENTATION_RESULT: ownedShows=601' -and $taskText -match 'INSTRUMENTATION_RESULT: songs=1200' -and $taskText -match 'INSTRUMENTATION_RESULT: hits=200'}
if($Operation -eq 'clean'){$taskPassed=$taskPassed -and $taskText -match 'INSTRUMENTATION_RESULT: ownedRowsRemoved=true' -and $taskText -match 'INSTRUMENTATION_RESULT: ownedFilesRemoved=true' -and $taskText -match 'INSTRUMENTATION_RESULT: selectionRestored=true'}
if($Operation -eq 'inspect-import'){$taskPassed=$taskPassed -and $taskText -match 'INSTRUMENTATION_RESULT: songs=1201' -and $taskText -match 'INSTRUMENTATION_RESULT: defaultsRetained=true' -and $taskText -match 'INSTRUMENTATION_RESULT: stagingFiles=0' -and $taskText -match 'INSTRUMENTATION_RESULT: invalidVisualNotSaved=true' -and $taskText -match 'INSTRUMENTATION_RESULT: sharedMediaRetained=true'}
if($Operation -eq 'measure-rehearsal'){$taskPassed=$taskPassed -and $taskText -match 'INSTRUMENTATION_RESULT: rehearsalRows=\d+' -and $taskText -match 'INSTRUMENTATION_RESULT: readOnlyMeasurement=true'}
$taskPassed=$taskPassed -and $taskText -match 'INSTRUMENTATION_RESULT: originalsUnchanged=true'
[ordered]@{runId=$RunId;pid=$taskProcess.Id;adbExitCode=$taskProcess.ExitCode;passed=$taskPassed;operation=$Operation;fixtureToken=$taskMetadata.fixtureToken;startedUtc=$taskStart.ToString('o');finishedUtc=(Get-Date).ToUniversalTime().ToString('o');targetSha256=$taskExpectedHash;isolatedSyntheticFixtureOnly=$true;productionFaultEndpoint=$false} | ConvertTo-Json | Set-Content "$taskOutput/terminal.json"
$taskText
if(!$taskPassed){throw 'Collection probe failed; inspect the same handle and retained marker before any retry'}
