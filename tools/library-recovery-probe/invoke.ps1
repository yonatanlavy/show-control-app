#requires -Version 7.0
param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9-]{36}$')][string]$RunId,[Parameter(Mandatory=$true)][ValidateSet('audit','copy-export')][string]$Operation,[Parameter(Mandatory=$true)][ValidateSet(1,2,4)][int]$Shows,[Parameter(Mandatory=$true)][string]$ExpectedApk,[Parameter(Mandatory=$true)][string]$ProbeMetadata,[string]$Adb="$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe")
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..')); $taskOutput=Join-Path $taskRoot ".native-check/library-recovery-probe-$RunId"
if(Test-Path -LiteralPath $taskOutput){throw 'Preserve previous evidence'}
$taskAvd=(@(& $Adb -s emulator-5564 emu avd name | ForEach-Object {$_.Trim()} | Where-Object {$_}) -join '|')
if($LASTEXITCODE -ne 0 -or $taskAvd -ne 'ShowControl_LibraryLoad_QA|OK'){throw 'Wrong isolated device; preserve it'}
$taskDevice=Get-Content -LiteralPath (Join-Path $taskRoot '.native-check/library-load-device.json') -Raw | ConvertFrom-Json
if($taskDevice.root -ne [IO.Path]::GetFullPath((Join-Path $taskRoot '.native-check/library-load-device')) -or $taskDevice.originalWritableOverlayCopied -ne $false){throw 'Fresh-data ownership not established'}
$taskMetadata=Get-Content -LiteralPath $ProbeMetadata -Raw | ConvertFrom-Json; $taskHash=(Get-FileHash -LiteralPath $ExpectedApk).Hash
if($taskMetadata.sameSigner -ne $true -or $taskMetadata.targetApkSha256 -ne $taskHash -or $taskMetadata.token -notmatch '^[a-f0-9-]{36}$' -or $taskMetadata.sourceSha256 -ne (Get-FileHash -LiteralPath "$PSScriptRoot/LibraryRecoveryProbe.java").Hash){throw 'Probe targets a different artifact/source'}
foreach($taskPackage in @('app.showcontrol.working','app.showcontrol.libraryrecoveryprobe')){
  $taskPath=(@(& $Adb -s emulator-5564 shell pm path $taskPackage) -join '').Trim()
  if($LASTEXITCODE -ne 0 -or $taskPath -notmatch '^package:(/data/app/[^\r\n]+/base\.apk)$'){throw 'Missing/unexpected installed package'}
  $taskInstalled=(@(& $Adb -s emulator-5564 shell sha256sum $Matches[1]) -join '').Split(' ')[0].ToUpperInvariant()
  $taskExpected=if($taskPackage -eq 'app.showcontrol.working'){$taskHash}else{$taskMetadata.sha256}
  if($LASTEXITCODE -ne 0 -or $taskInstalled -ne $taskExpected){throw 'Installed artifact differs'}
}
$taskProcesses=(& $Adb -s emulator-5564 shell dumpsys activity processes | Out-String)
if($LASTEXITCODE -ne 0 -or $taskProcesses -notmatch 'ACTIVITY MANAGER RUNNING PROCESSES' -or $taskProcesses -match '(?i)instrumentation|mInstr='){throw 'Cannot confirm idle instrumentation'}
$taskServices=(& $Adb -s emulator-5564 shell dumpsys activity services app.showcontrol.working | Out-String)
if($LASTEXITCODE -ne 0 -or $taskServices -match 'ServiceRecord'){throw 'Preserve active playback/service'}
New-Item -ItemType Directory -Path $taskOutput | Out-Null
$taskArguments=@('-s','emulator-5564','shell','am','instrument','-w','-r','-e','token',$taskMetadata.token,'-e','audioSha256',$taskMetadata.audioSha256,'-e','imageSha256',$taskMetadata.imageSha256,'-e','expectedApkSha256',$taskHash,'-e','operation',$Operation,'-e','shows',"$Shows",'app.showcontrol.libraryrecoveryprobe/app.showcontrol.libraryrecoveryprobe.LibraryRecoveryProbe')
$taskStart=(Get-Date).ToUniversalTime(); $taskProcess=Start-Process -FilePath $Adb -ArgumentList $taskArguments -WindowStyle Hidden -PassThru -RedirectStandardOutput "$taskOutput/instrument.out.txt" -RedirectStandardError "$taskOutput/instrument.err.txt"
$taskHandle=[ordered]@{runId=$RunId;pid=$taskProcess.Id;operation=$Operation;shows=$Shows;targetSha256=$taskHash;probeSha256=$taskMetadata.sha256;startedUtc=$taskStart.ToString('o');stdout="$taskOutput/instrument.out.txt";stderr="$taskOutput/instrument.err.txt"}
$taskHandle | ConvertTo-Json | Set-Content "$taskOutput/handle.json"
if(!$taskProcess.WaitForExit(45000)){$taskHandle | ConvertTo-Json | Set-Content "$taskOutput/pending-handle.json"; throw "OBSERVATION_PENDING: Reconcile PID $($taskProcess.Id); do not restart the target or probe."}
$taskProcess.WaitForExit(); $taskText=Get-Content -LiteralPath "$taskOutput/instrument.out.txt" -Raw
$taskPassed=$taskProcess.ExitCode -eq 0 -and $taskText -match 'INSTRUMENTATION_RESULT: passed=true' -and $taskText -match 'INSTRUMENTATION_CODE: -1' -and $taskText -notmatch 'INSTRUMENTATION_RESULT: failure=' -and $taskText -match "INSTRUMENTATION_RESULT: shows=$Shows" -and $taskText -match 'INSTRUMENTATION_RESULT: readOnlyDatabase=true' -and $taskText -match 'INSTRUMENTATION_RESULT: stagingEmpty=true'
if($Operation -eq 'copy-export'){$taskPassed=$taskPassed -and $taskText -match 'INSTRUMENTATION_RESULT: exportSha256=[A-F0-9]{64}'}
[ordered]@{runId=$RunId;pid=$taskProcess.Id;exitCode=$taskProcess.ExitCode;passed=$taskPassed;operation=$Operation;shows=$Shows;targetSha256=$taskHash;startedUtc=$taskStart.ToString('o');finishedUtc=(Get-Date).ToUniversalTime().ToString('o');isolatedFreshData=$true;productionFaultEndpoint=$false} | ConvertTo-Json | Set-Content "$taskOutput/terminal.json"
$taskText
if(!$taskPassed){throw 'Audit failed; retain this handle and evidence before any retry'}
