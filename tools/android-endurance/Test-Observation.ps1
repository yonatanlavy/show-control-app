#requires -Version 7.0
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Observation.ps1')
$taskServices="    * ServiceRecord{a1 u0 app.showcontrol.working/app.showcontrol.audio.ShowAudioService c:app.showcontrol.working}`n      isForeground=true foregroundId=1001 types=0x00000002"
$taskMedia="    androidx.media3.session.id. app.showcontrol.working/app.showcontrol.audio.ShowAudioService`n      package=app.showcontrol.working`n      active=true`n      state=PlaybackState {state=PLAYING(3), position=3500, buffered position=3500, speed=1.25, updated=100000, actions=693, custom actions=[], active item id=0, error=null}"
$taskPage='<hierarchy><node package="app.showcontrol.working" text="Continuous main loop" clickable="false" /><node package="app.showcontrol.working" content-desc="Active sounds: 8 / 8" clickable="false" /></hierarchy>'
$taskCases=[Collections.Generic.List[string]]::new()
function Expect-Refusal([string]$Name,[scriptblock]$Action,[string]$Code){try{& $Action;throw 'Expected refusal was missing'}catch{if($_.Exception.Message -ne $Code){throw}};$taskCases.Add($Name)}
$taskValid=Read-EnduranceState $taskServices $taskMedia
if($taskValid.owner -ne 'a1' -or $taskValid.rate -ne 1.25 -or $taskValid.positionMs -ne 3500 -or $taskValid.nativeUpdatedMs -ne 100000){throw 'Valid native record parsed incorrectly'}
$taskCases.Add('valid native foreground/playing source state')
Assert-EndurancePage ([xml]$taskPage);$taskCases.Add('one visible full-capacity main readout')
Expect-Refusal 'paused is not continuous playing' {Read-EnduranceState $taskServices ($taskMedia.Replace('PLAYING(3)','PAUSED(2)'))} 'ENDURANCE_NOT_PLAYING_MAIN'
Expect-Refusal 'wrong main pointer is not accepted' {Read-EnduranceState $taskServices ($taskMedia.Replace('active item id=0','active item id=1'))} 'ENDURANCE_NOT_PLAYING_MAIN'
Expect-Refusal 'native errors refuse' {Read-EnduranceState $taskServices ($taskMedia.Replace('error=null','error=unavailable'))} 'ENDURANCE_NOT_PLAYING_MAIN'
Expect-Refusal 'wrong source rate refuses' {Read-EnduranceState $taskServices ($taskMedia.Replace('speed=1.25','speed=0.0'))} 'ENDURANCE_UNEXPECTED_SOURCE_CLOCK'
Expect-Refusal 'out-of-source position refuses' {Read-EnduranceState $taskServices ($taskMedia.Replace('position=3500','position=9000'))} 'ENDURANCE_UNEXPECTED_SOURCE_CLOCK'
Expect-Refusal 'another package cannot supply media state' {Read-EnduranceState $taskServices ($taskMedia.Replace('app.showcontrol.working/','another.package/'))} 'ENDURANCE_MEDIA_OWNER_UNAVAILABLE'
Expect-Refusal 'another foreground service cannot mask idle audio' {Read-EnduranceState ($taskServices.Replace('isForeground=true','isForeground=false')+"`n    * ServiceRecord{b2 u0 app.showcontrol.working/app.showcontrol.downloads.ShowDownloadService}`n      isForeground=true foregroundId=1001") $taskMedia} 'ENDURANCE_FOREGROUND_UNAVAILABLE'
Expect-Refusal 'duplicate media owners refuse' {Read-EnduranceState $taskServices ($taskMedia+"`n"+$taskMedia)} 'ENDURANCE_MEDIA_OWNER_UNAVAILABLE'
Expect-Refusal 'fewer voices refuse' {Assert-EndurancePage ([xml]$taskPage.Replace('8 / 8','3 / 8'))} 'ENDURANCE_UI_NOT_EIGHT_MAIN_VOICES'
Expect-Refusal 'another foreground song refuses' {Assert-EndurancePage ([xml]$taskPage.Replace('Continuous main loop','Incoming'))} 'ENDURANCE_UI_NOT_EIGHT_MAIN_VOICES'
Expect-Refusal 'another app cannot supply UI proof' {Assert-EndurancePage ([xml]$taskPage.Replace('app.showcontrol.working','another.package'))} 'ENDURANCE_UI_NOT_EIGHT_MAIN_VOICES'
Expect-Refusal 'duplicate capacity readouts refuse' {Assert-EndurancePage ([xml]$taskPage.Replace('</hierarchy>','<node package="app.showcontrol.working" content-desc="Active sounds: 8 / 8" /></hierarchy>'))} 'ENDURANCE_UI_NOT_EIGHT_MAIN_VOICES'
$taskResult=[ordered]@{passed=$taskCases.Count;cases=@($taskCases);actualObservationFunctions=$true;adbCalls=0;providers=0;finishedUtc=(Get-Date).ToUniversalTime().ToString('o')}
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'));$taskOutput=Join-Path $taskRoot ('.native-check/endurance-observation-'+[guid]::NewGuid()+'.json')
$taskResult | ConvertTo-Json -Depth 4 | Set-Content $taskOutput
Get-Content -LiteralPath $taskOutput
