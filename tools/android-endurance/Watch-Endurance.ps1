#requires -Version 7.0
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9-]{36}$')][string]$RunId,
  [Parameter(Mandatory=$true)][string]$ExpectedApk,
  [ValidateRange(60,21600)][int]$DurationSeconds=7200,
  [ValidateSet('NativeHierarchy','Screenshot')][string]$UiMode='NativeHierarchy',
  [string]$Adb="$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe",
  [switch]$ValidateOnly
)
$ErrorActionPreference='Stop'
$Serial='emulator-5564';$taskPackage='app.showcontrol.working'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskTargets=@(0..[int][Math]::Ceiling($DurationSeconds/60) | ForEach-Object {[Math]::Min($_*60,$DurationSeconds)} | Sort-Object -Unique)
if($ValidateOnly){[ordered]@{nativeTargetsSeconds=$taskTargets;uiIntervalSeconds=900;uiMode=$UiMode;automatedVoiceCount=($UiMode -eq 'NativeHierarchy');requestedSeconds=$DurationSeconds;transportCommands=0;device='ShowControl_LibraryLoad_QA';leavesPlaying=$true} | ConvertTo-Json -Depth 3;return}
$taskOutput=Join-Path $taskRoot ".native-check/endurance-$RunId"
if(Test-Path $taskOutput){throw 'Preserve existing run; use a fresh RunId'}
if(!(Test-Path -LiteralPath $ExpectedApk -PathType Leaf) -or !(Test-Path -LiteralPath $Adb -PathType Leaf)){throw 'Expected APK/ADB unavailable'}
New-Item -ItemType Directory -Path $taskOutput | Out-Null
. (Join-Path $PSScriptRoot 'Observation.ps1')
# Reuse the actual, regression-covered observation boundary without executing
# its focus-navigation scenario. No arbitrary path/source is accepted here.
$taskTokens=$null;$taskErrors=$null
$taskSource=Join-Path $PSScriptRoot '../android-focus-return/Invoke-FocusReturn.ps1'
$taskAst=[Management.Automation.Language.Parser]::ParseFile($taskSource,[ref]$taskTokens,[ref]$taskErrors)
if($taskErrors.Count){throw 'Observation helper does not parse'}
foreach($taskName in @('Invoke-Adb','Capture-Ui','Require-Process','Collect-Pressure')){
  $taskFunctions=@($taskAst.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $taskName},$true))
  if($taskFunctions.Count -ne 1){throw 'Observation helper not unique'}
  . ([scriptblock]::Create($taskFunctions[0].Extent.Text))
}
$script:taskCommandIndex=0;$script:taskPending=[Collections.Generic.List[object]]::new();$script:taskAppPid=$null
$taskOwner=$null;$taskSamples=[Collections.Generic.List[object]]::new();$taskUiSamples=[Collections.Generic.List[object]]::new()
$taskFailure=$null;$taskExit=1;$taskStarted=(Get-Date).ToUniversalTime().ToString('o');$taskMeasuredStart=$null;$taskClock=$null
function Observe-Native([string]$Name){
  Require-Process $Name
  $taskServices=[string](Invoke-Adb "$Name-services" @('shell','dumpsys','activity','services',$taskPackage))
  $taskMedia=[string](Invoke-Adb "$Name-media" @('shell','dumpsys','media_session'))
  $taskState=Read-EnduranceState $taskServices $taskMedia
  if($null -eq $script:taskOwner){$script:taskOwner=$taskState.owner}elseif($script:taskOwner -ne $taskState.owner){throw 'ENDURANCE_NATIVE_OWNER_CHANGED'}
  $taskAnr=[string](Invoke-Adb "$Name-anr" @('shell','dumpsys','activity','lastanr'))
  if($taskAnr -notmatch '<no ANR has occurred since boot>'){throw 'ENDURANCE_ANR_RECORDED'}
  $taskDeep=[string](Invoke-Adb "$Name-idle" @('shell','cmd','deviceidle','get','deep'))
  return [ordered]@{utc=(Get-Date).ToUniversalTime().ToString('o');appPid=$script:taskAppPid;owner=$taskState.owner;positionMs=$taskState.positionMs;rate=$taskState.rate;nativeUpdatedMs=$taskState.nativeUpdatedMs;deep=$taskDeep.Trim();noAnrRecorded=$true}
}
function Observe-Ui([string]$Name,[switch]$LeaveAwake){
  Require-Process "$Name-before-wake"
  [void](Invoke-Adb "$Name-wake" @('shell','input','keyevent','224'))
  [void](Invoke-Adb "$Name-keyguard" @('shell','wm','dismiss-keyguard'))
  if($UiMode -eq 'NativeHierarchy'){
    $taskUi=Capture-Ui $Name;Assert-EndurancePage $taskUi
    $taskUiSamples.Add([ordered]@{utc=(Get-Date).ToUniversalTime().ToString('o');appPid=$script:taskAppPid;voices=8;mainObserved=$true;requiresImageReview=$false})
  }else{
    # The constantly updating live clock can prevent uiautomator's idle wait.
    # Preserve pixels for explicit review; never infer eight voices from the
    # main MediaSession or silently downgrade a failed hierarchy observation.
    $taskRemote="/sdcard/sc-endurance-$RunId-$Name.png"
    $taskLocal=Join-Path $taskOutput "$Name.png"
    # A wake command can return before the first app frame is composited.
    # One bounded settling interval is observation only, never app recovery.
    Start-Sleep -Milliseconds 1000
    [void](Invoke-Adb "$Name-screenshot" @('shell','screencap','-p',$taskRemote))
    [void](Invoke-Adb "$Name-screenshot-pull" @('pull',$taskRemote,$taskLocal))
    if(!(Test-Path -LiteralPath $taskLocal -PathType Leaf) -or (Get-Item -LiteralPath $taskLocal).Length -eq 0){throw 'ENDURANCE_SCREENSHOT_UNAVAILABLE'}
    $taskUiSamples.Add([ordered]@{utc=(Get-Date).ToUniversalTime().ToString('o');appPid=$script:taskAppPid;voices=$null;mainObserved=$null;requiresImageReview=$true;screenshot=$taskLocal})
  }
  Require-Process "$Name-after-ui"
  $taskUiSamples | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $taskOutput 'ui-observations.json')
  if(!$LeaveAwake){
    [void](Invoke-Adb "$Name-sleep" @('shell','input','keyevent','223'))
    [void](Invoke-Adb "$Name-force-idle" @('shell','cmd','deviceidle','force-idle'))
  }
}
try{
  $taskAvd=(([string](Invoke-Adb 'avd' @('emu','avd','name'))) -split '\r?\n' | ForEach-Object {$_.Trim()} | Where-Object {$_}) -join '|'
  if($taskAvd -ne 'ShowControl_LibraryLoad_QA|OK'){throw 'Wrong owned device; preserve it'}
  $taskPath=([string](Invoke-Adb 'installed-path' @('shell','pm','path',$taskPackage))).Trim()
  if($taskPath -notmatch '^package:(/data/app/[^\r\n]+/base\.apk)$'){throw 'Unexpected installed path'}
  $taskInstalled=([string](Invoke-Adb 'installed-hash' @('shell','sha256sum',$Matches[1]))).Split(' ')[0].Trim().ToUpperInvariant()
  if($taskInstalled -ne (Get-FileHash -LiteralPath $ExpectedApk).Hash){throw 'Installed APK differs'}
  $taskWhitelist=[string](Invoke-Adb 'exemptions' @('shell','cmd','deviceidle','whitelist'))
  if($taskWhitelist -match [regex]::Escape($taskPackage)){throw 'Unexpected battery exemption; preserve baseline'}
  [void](Observe-Native 'baseline')
  Observe-Ui 'baseline-ui' -LeaveAwake
  Collect-Pressure 'baseline'
  [void](Invoke-Adb 'simulate-unplugged' @('shell','dumpsys','battery','unplug'))
  [void](Invoke-Adb 'simulate-discharging' @('shell','dumpsys','battery','set','status','3'))
  Observe-Ui 'start-locked'
  $taskMeasuredStart=(Get-Date).ToUniversalTime().ToString('o');$taskClock=[Diagnostics.Stopwatch]::StartNew()
  foreach($taskTarget in $taskTargets){
    while($taskClock.Elapsed.TotalSeconds -lt $taskTarget){Start-Sleep -Milliseconds ([int][Math]::Min(5000,[Math]::Max(1,($taskTarget-$taskClock.Elapsed.TotalSeconds)*1000)))}
    $taskName='sample-{0:D5}' -f $taskTarget
    $taskSample=Observe-Native $taskName
    $taskSample.targetSeconds=$taskTarget;$taskSample.observedSeconds=$taskClock.Elapsed.TotalSeconds
    $taskSamples.Add($taskSample);$taskSamples | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $taskOutput 'samples.json')
    if($taskTarget -gt 0 -and ($taskTarget%900 -eq 0 -or $taskTarget -eq $DurationSeconds)){Observe-Ui "$taskName-ui" -LeaveAwake:($taskTarget -eq $DurationSeconds);[void](Observe-Native "$taskName-after-ui")}
    if($taskTarget -gt 0 -and $taskTarget%300 -eq 0){Collect-Pressure $taskName}
    "Observed $taskName at $([Math]::Round($taskClock.Elapsed.TotalSeconds,1))s; same owner, native Playing, no ANR"
  }
  if($taskClock.Elapsed.TotalSeconds -lt $DurationSeconds){throw 'Requested measured duration was not reached'}
  $taskExit=0
}catch{
  $taskFailure=$_.Exception.Message
  if($script:taskPending.Count -eq 0){foreach($taskDiagnostic in @(@{name='failure-anr';args=@('shell','dumpsys','activity','lastanr')},@{name='failure-traces';args=@('shell','dumpsys','activity','lastanr-traces')},@{name='failure-memory';args=@('shell','dumpsys','meminfo',$taskPackage)})){try{[void](Invoke-Adb $taskDiagnostic.name $taskDiagnostic.args)}catch{}}}
}finally{
  [ordered]@{runId=$RunId;pid=$PID;appPid=$script:taskAppPid;nativeOwner=$script:taskOwner;startedUtc=$taskStarted;measuredStartUtc=$taskMeasuredStart;finishedUtc=(Get-Date).ToUniversalTime().ToString('o');requestedSeconds=$DurationSeconds;measuredSeconds=$(if($taskClock){$taskClock.Elapsed.TotalSeconds}else{0});exitCode=$taskExit;failure=$taskFailure;nativeSamples=$taskSamples.Count;uiSamples=$taskUiSamples.Count;uiMode=$UiMode;automatedVoiceCount=($UiMode -eq 'NativeHierarchy');pendingHandles=$script:taskPending.Count;transportCommands=0;playbackMayRemainActive=$true;systemOverridesRequireCleanup=$true;physicalOrAcousticEvidence=$false} | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $taskOutput 'terminal.json')
}
exit $taskExit
