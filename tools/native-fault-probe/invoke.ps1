param(
  [Parameter(Mandatory=$true)][string]$Adb,
  [Parameter(Mandatory=$true)][ValidatePattern('^emulator-[0-9]+$')][string]$Serial,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f-]{36}$')][string]$Token,
  [Parameter(Mandatory=$true)][ValidateRange(1,1000)][int]$Sequence,
  [Parameter(Mandatory=$true)][ValidateSet('locate','corrupt','restore','finish','arm','status','lateReady','disarm')][string]$Action,
  [ValidateSet('fault','readiness')][string]$Probe='fault',
  [Parameter(Mandatory=$true)][string]$EvidenceDirectory
)
$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path -LiteralPath $EvidenceDirectory).Path
$taskCommand=Join-Path $taskRoot "probe-command-$Token-$Sequence.json"
$taskResult=Join-Path $taskRoot "probe-result-$Token-$Sequence.json"
if((Test-Path -LiteralPath $taskCommand) -or (Test-Path -LiteralPath $taskResult)){throw 'Preserve prior probe commands/results'}
[IO.File]::WriteAllText($taskCommand,([ordered]@{token=$Token;sequence=$Sequence;action=$Action} | ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
$taskRemote="/sdcard/Android/data/app.showcontrol.working/files/native-$Probe-probe-$Token"
& $Adb -s $Serial push $taskCommand "$taskRemote/command-$Sequence.tmp" | Out-Null
if($LASTEXITCODE -ne 0){throw 'Probe command upload failed'}
& $Adb -s $Serial shell mv "$taskRemote/command-$Sequence.tmp" "$taskRemote/command.json"
if($LASTEXITCODE -ne 0){throw 'Probe command publication failed'}
for($taskAttempt=0;$taskAttempt -lt 20;$taskAttempt++){
  $taskRaw=(@(& $Adb -s $Serial shell cat "$taskRemote/result.json" 2>$null) -join "`n")
  try{$taskObservation=$taskRaw | ConvertFrom-Json}catch{$taskObservation=$null}
  if($taskObservation -and $taskObservation.token -eq $Token -and $taskObservation.sequence -eq $Sequence){
    [IO.File]::WriteAllText($taskResult,$taskRaw,[Text.UTF8Encoding]::new($false))
    if(!$taskObservation.success){throw "Probe refused: $($taskObservation.error)"}
    $taskObservation | ConvertTo-Json -Compress -Depth 16
    exit 0
  }
  Start-Sleep -Milliseconds 500
}
throw 'Probe observation timed out. Reconcile the same instrumentation process/result; do not send another action or restart automatically.'
