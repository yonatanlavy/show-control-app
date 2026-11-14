#requires -Version 7.0
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9-]{36}$')][string]$RunId,
  [Parameter(Mandatory=$true)][string]$ExpectedApk,
  [string]$Adb = "$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe",
  [ValidateSet('emulator-5562','emulator-5564')][string]$Serial = 'emulator-5562',
  [ValidateRange(1,5)][int]$Cycles = 1,
  [switch]$ValidateOnly
)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskOutput = Join-Path $taskRoot ".native-check/focus-return-$RunId"
$taskPackage = 'app.showcontrol.working'
$taskExpectedAvd = if ($Serial -eq 'emulator-5564') { 'ShowControl_LibraryLoad_QA' } else { 'ShowControl_QA_API35' }
$taskSchedule = @(foreach ($taskCycle in 1..$Cycles) {
  foreach ($taskVariant in @('return','lock','home')) {
    foreach ($taskDelay in @(0,50,150,300,600)) { [pscustomobject]@{cycle=$taskCycle;variant=$taskVariant;delayMs=$taskDelay} }
  }
})
if ($ValidateOnly) { $taskSchedule | ConvertTo-Json; return }
if (!(Test-Path -LiteralPath $Adb -PathType Leaf)) { throw 'ADB is unavailable' }
if (!(Test-Path -LiteralPath $ExpectedApk -PathType Leaf)) { throw 'Expected APK is unavailable' }
if (Test-Path -LiteralPath $taskOutput) { throw 'Preserve the previous run; use a fresh RunId' }
New-Item -ItemType Directory -Path $taskOutput | Out-Null
$script:taskCommandIndex = 0
$script:taskPending = [Collections.Generic.List[object]]::new()
$script:taskAppPid = $null
$taskResults = [Collections.Generic.List[object]]::new()
$taskStarted = (Get-Date).ToUniversalTime().ToString('o')
$taskFailure = $null
$taskExit = 1

function Invoke-Adb([string]$Name, [string[]]$Arguments, [int]$DeadlineMs = 15000, [switch]$AllowNonzeroExit) {
  $script:taskCommandIndex++
  $taskPrefix = Join-Path $taskOutput ('{0:D3}-{1}' -f $script:taskCommandIndex,$Name)
  $taskStart = (Get-Date).ToUniversalTime()
  # Start-Process joins ArgumentList on Windows; quote each controlled argument
  # so an evidence path containing spaces remains one ADB argument.
  $taskNativeArgs = @(@('-s',$Serial) + $Arguments | ForEach-Object {
    if ($_ -match '["\r\n]' -or $_.EndsWith('\')) { throw 'Unexpected ADB argument' }
    '"' + $_ + '"'
  })
  $taskProcess = Start-Process -FilePath $Adb -ArgumentList $taskNativeArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput "$taskPrefix.out.txt" -RedirectStandardError "$taskPrefix.err.txt"
  if (!$taskProcess.WaitForExit($DeadlineMs)) {
    # An observation deadline must not kill/restart the app or its live observer.
    $script:taskPending.Add([ordered]@{name=$Name;pid=$taskProcess.Id;startedUtc=$taskStart.ToString('o');stdout="$taskPrefix.out.txt";stderr="$taskPrefix.err.txt";arguments=$Arguments})
    $script:taskPending | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $taskOutput 'pending-handles.json')
    throw "OBSERVATION_PENDING: $Name; reconcile PID $($taskProcess.Id) before proceeding"
  }
  $taskProcess.WaitForExit()
  [ordered]@{name=$Name;pid=$taskProcess.Id;exitCode=$taskProcess.ExitCode;allowNonzeroExit=[bool]$AllowNonzeroExit;startedUtc=$taskStart.ToString('o');seconds=((Get-Date).ToUniversalTime()-$taskStart).TotalSeconds;arguments=$Arguments} | ConvertTo-Json -Depth 4 | Set-Content "$taskPrefix.receipt.json"
  if ($taskProcess.ExitCode -ne 0 -and !$AllowNonzeroExit) { throw "ADB_FAILED: $Name; inspect its retained receipt" }
  return (Get-Content -LiteralPath "$taskPrefix.out.txt" -Raw)
}
function Capture-Ui([string]$Name) {
  $taskRemote = "/sdcard/sc-focus-return-$RunId-$Name.xml"
  $taskLocal = Join-Path $taskOutput "$Name.xml"
  foreach ($taskAttempt in 1..3) {
    # uiautomator can exit 0 with a null-root error and no file. Observe the
    # same live app again only after that command is terminal. Invoke-Adb
    # throws for pending handles; those are never caught/retried here.
    Require-Process "$Name-observe-$taskAttempt"
    $taskDump = [string](Invoke-Adb "$Name-dump-$taskAttempt" @('shell','uiautomator','dump',$taskRemote))
    if ($taskDump -match ('dumped to:\s*' + [regex]::Escape($taskRemote))) {
      [void](Invoke-Adb "$Name-pull" @('pull',$taskRemote,$taskLocal))
      return [xml](Get-Content -LiteralPath $taskLocal -Raw)
    }
    if ($taskAttempt -lt 3) { Start-Sleep -Milliseconds 250 }
  }
  throw "UI_OBSERVATION_UNAVAILABLE: $Name; three terminal dumps produced no confirmed new file"
}
function Require-AppPage([xml]$Ui, [string]$Title) {
  $taskHeadings = @($Ui.SelectNodes('//node') | Where-Object { $_.package -eq $taskPackage -and $_.text -eq $Title -and $_.clickable -eq 'false' })
  if ($taskHeadings.Count -ne 1) { throw "PAGE_MISMATCH: Expected one $Title heading" }
}
function Require-NotificationPage([xml]$Ui) {
  $taskSystemText = @($Ui.SelectNodes('//node') | Where-Object { $_.package -eq 'com.android.settings' } | ForEach-Object { $_.text })
  if ('Show Control' -notin $taskSystemText -or 'All Show Control notifications' -notin $taskSystemText) { throw 'Expected app-notification settings page was not observed' }
}
function Require-Process([string]$Name) {
  $taskObservedPid = [string](Invoke-Adb "$Name-process" @('shell','pidof',$taskPackage))
  $taskObservedPid = $taskObservedPid.Trim()
  if ($taskObservedPid -notmatch '^\d+$') { throw 'PROCESS_MISMATCH: Expected one live app process' }
  if ($null -eq $script:taskAppPid) { $script:taskAppPid = $taskObservedPid }
  elseif ($script:taskAppPid -ne $taskObservedPid) { throw 'PROCESS_CHANGED: Preserve the unexpected app restart' }
}
function Require-Idle([string]$Name) {
  $taskServices = Invoke-Adb "$Name-services" @('shell','dumpsys','activity','services',$taskPackage)
  if ($taskServices -match 'app\.showcontrol\.(audio\.ShowAudioService|downloads\.ShowDownloadService|voice\.ShowVoiceService)') { throw 'IDLE_REQUIRED: Preserve the active native owner' }
}
function Collect-Pressure([string]$Name) {
  [void](Invoke-Adb "$Name-memory" @('shell','dumpsys','meminfo',$taskPackage))
  # Production-like images may deny shell access to PSI. Preserve the failed
  # receipt and raw denial; unavailable optional telemetry is not an app failure.
  $taskPressure = [string](Invoke-Adb "$Name-pressure" @('shell','cat','/proc/pressure/cpu','/proc/pressure/memory','/proc/pressure/io') -AllowNonzeroExit)
  [ordered]@{available=([regex]::Matches($taskPressure,'(?m)^some avg10=').Count -eq 3);rawReceipt="$Name-pressure"} | ConvertTo-Json | Set-Content (Join-Path $taskOutput "$Name-pressure-status.json")
}
try {
  $taskAvd = ((Invoke-Adb 'avd' @('emu','avd','name')) -split '\r?\n' | ForEach-Object {$_.Trim()} | Where-Object {$_}) -join '|'
  if ($taskAvd -ne "$taskExpectedAvd|OK") { throw 'Wrong device; preserve it' }
  $taskPath = (Invoke-Adb 'installed-path' @('shell','pm','path',$taskPackage)).Trim()
  if ($taskPath -notmatch '^package:(/data/app/[^\r\n]+/base\.apk)$') { throw 'Unexpected installed package path' }
  $taskInstalledHash = (Invoke-Adb 'installed-hash' @('shell','sha256sum',$Matches[1])).Split(' ')[0].Trim().ToUpperInvariant()
  $taskExpectedHash = (Get-FileHash -LiteralPath $ExpectedApk).Hash
  if ($taskInstalledHash -ne $taskExpectedHash) { throw 'Installed APK differs; no experiment performed' }
  Require-Idle 'initial'
  $taskBaselineAnr = Invoke-Adb 'baseline-anr' @('shell','dumpsys','activity','lastanr')
  if ($taskBaselineAnr -notmatch '<no ANR has occurred since boot>') { throw 'Existing ANR needs inspection before this run' }
  [void](Invoke-Adb 'initial-settings' @('shell','am','start','-a','android.intent.action.VIEW','-d','showcontrol://settings','-n',"$taskPackage/.MainActivity"))
  Require-Process 'initial-started'
  Require-AppPage (Capture-Ui 'initial-settings') 'Settings'
  Require-Process 'initial'
  Collect-Pressure 'initial'
  $taskCaseIndex = 0
  foreach ($taskCase in $taskSchedule) {
    $taskCaseIndex++
    $taskName = 'case-{0:D2}-{1}-{2}' -f $taskCaseIndex,$taskCase.variant,$taskCase.delayMs
    Require-Idle $taskName
    Require-Process "$taskName-before"
    [void](Invoke-Adb "$taskName-notifications" @('shell','am','start','-a','android.settings.APP_NOTIFICATION_SETTINGS','--es','android.provider.extra.APP_PACKAGE',$taskPackage))
    $taskSystemUi = Capture-Ui "$taskName-system"
    Require-NotificationPage $taskSystemUi
    $taskCaseStart = (Get-Date).ToUniversalTime()
    $taskObservedScreenState = $null
    if ($taskCase.variant -eq 'home') { [void](Invoke-Adb "$taskName-home" @('shell','input','keyevent','3')) }
    else { [void](Invoke-Adb "$taskName-back" @('shell','input','keyevent','4')) }
    if ($taskCase.variant -eq 'lock') {
      [void](Invoke-Adb "$taskName-sleep" @('shell','input','keyevent','223'))
      Start-Sleep -Milliseconds 350
      $taskSleepState = Invoke-Adb "$taskName-sleep-state" @('shell','dumpsys','power')
      if ($taskSleepState -notmatch 'mWakefulness=(Asleep|Dozing)\b') { throw 'SCREEN_OFF_NOT_OBSERVED: Preserve the actual power state' }
      $taskObservedScreenState = $Matches[1]
      [void](Invoke-Adb "$taskName-wake" @('shell','input','keyevent','224'))
      [void](Invoke-Adb "$taskName-keyguard" @('shell','wm','dismiss-keyguard'))
    }
    Require-Process "$taskName-before-intents"
    [void](Invoke-Adb "$taskName-settings" @('shell','am','start','-a','android.intent.action.VIEW','-d','showcontrol://settings','-n',"$taskPackage/.MainActivity"))
    if ($taskCase.delayMs) { Start-Sleep -Milliseconds $taskCase.delayMs }
    [void](Invoke-Adb "$taskName-preflight" @('shell','am','start','-a','android.intent.action.VIEW','-d','showcontrol://preflight','-n',"$taskPackage/.MainActivity"))
    Require-AppPage (Capture-Ui "$taskName-return") 'Preflight'
    Require-Process "$taskName-after"
    $taskObservedSeconds = ((Get-Date).ToUniversalTime()-$taskCaseStart).TotalSeconds
    $taskAnr = Invoke-Adb "$taskName-anr" @('shell','dumpsys','activity','lastanr')
    if ($taskAnr -notmatch '<no ANR has occurred since boot>') { throw 'NEW_ANR: Preserve the Android report' }
    $taskResults.Add([ordered]@{case=$taskCaseIndex;cycle=$taskCase.cycle;variant=$taskCase.variant;requestedSpacingMs=$taskCase.delayMs;observedScreenState=$taskObservedScreenState;pageObserved=$true;noAnrRecorded=$true;appPid=$script:taskAppPid;observationSeconds=$taskObservedSeconds})
    $taskResults | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $taskOutput 'results.json')
    if ($taskCaseIndex % 3 -eq 0) { Collect-Pressure $taskName }
    "Observed $taskName; correct page, no ANR recorded"
  }
  Require-Idle 'final'
  Require-Process 'final'
  Collect-Pressure 'final'
  $taskFinalAnr = Invoke-Adb 'final-anr' @('shell','dumpsys','activity','lastanr')
  if ($taskFinalAnr -notmatch '<no ANR has occurred since boot>') { throw 'NEW_ANR: Final Android report changed' }
  $taskExit = 0
} catch {
  $taskFailure = $_.Exception.Message
  # A live observation retains its exact process/output handles. Do not stack
  # more ADB work behind it; the operator must reconcile that command first.
  if ($script:taskPending.Count -eq 0) { foreach ($taskDiagnostic in @(
    @{name='failure-anr';args=@('shell','dumpsys','activity','lastanr')},
    @{name='failure-traces';args=@('shell','dumpsys','activity','lastanr-traces')},
    @{name='failure-window';args=@('shell','dumpsys','window','displays')},
    @{name='failure-exit-info';args=@('shell','dumpsys','activity','exit-info',$taskPackage)},
    @{name='failure-memory';args=@('shell','dumpsys','meminfo',$taskPackage)},
    @{name='failure-events';args=@('shell','logcat','-b','events','-d','-t','250')}
  )) { try { [void](Invoke-Adb $taskDiagnostic.name $taskDiagnostic.args) } catch { } } }
} finally {
  [ordered]@{runId=$RunId;pid=$PID;appPid=$script:taskAppPid;serial=$Serial;expectedAvd=$taskExpectedAvd;cycles=$Cycles;startedUtc=$taskStarted;finishedUtc=(Get-Date).ToUniversalTime().ToString('o');exitCode=$taskExit;failure=$taskFailure;casesObserved=$taskResults.Count;pendingHandles=$script:taskPending.Count;productionCodeChanged=$false;audioPreparationRequested=$false} | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $taskOutput 'terminal.json')
}
exit $taskExit
