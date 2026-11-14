# Pure checks for the owned API-35 endurance fixture's public dumps/UI.
# These are allocation/state observations, never acoustic-output evidence.
function Read-EnduranceState([string]$Services, [string]$Media) {
  $taskService = [regex]::Matches($Services,'(?ms)^\s*\* ServiceRecord\{[^\r\n]*\bapp\.showcontrol\.working/app\.showcontrol\.audio\.ShowAudioService\b.*?(?=^\s*\* ServiceRecord|\z)')
  if ($taskService.Count -ne 1 -or $taskService[0].Value -notmatch 'isForeground=true foregroundId=1001\b') { throw 'ENDURANCE_FOREGROUND_UNAVAILABLE' }
  $taskOwner = [regex]::Match($taskService[0].Value,'ServiceRecord\{([a-f0-9]+)\b').Groups[1].Value
  $taskSessions = [regex]::Matches($Media,'(?ms)^    androidx\.media3\.session\.id\. app\.showcontrol\.working/.*?(?=^    \S|\z)')
  if ($taskSessions.Count -ne 1) { throw 'ENDURANCE_MEDIA_OWNER_UNAVAILABLE' }
  $taskFrame = [regex]::Match($taskSessions[0].Value,'state=PlaybackState \{state=PLAYING\(3\), position=(\d+), buffered position=\d+, speed=([0-9.]+), updated=(\d+),[^\r\n]*active item id=0, error=null\}')
  if (!$taskFrame.Success) { throw 'ENDURANCE_NOT_PLAYING_MAIN' }
  $taskPosition = [long]$taskFrame.Groups[1].Value
  $taskRate = [double]::Parse($taskFrame.Groups[2].Value,[Globalization.CultureInfo]::InvariantCulture)
  if ($taskPosition -gt 8000 -or $taskRate -ne 1.25) { throw 'ENDURANCE_UNEXPECTED_SOURCE_CLOCK' }
  return [pscustomobject]@{owner=$taskOwner;positionMs=$taskPosition;rate=$taskRate;nativeUpdatedMs=[long]$taskFrame.Groups[3].Value}
}
function Assert-EndurancePage([xml]$Ui) {
  $taskCount = @($Ui.SelectNodes('//node') | Where-Object {$_.package -eq 'app.showcontrol.working' -and $_.'content-desc' -eq 'Active sounds: 8 / 8'})
  $taskTitle = @($Ui.SelectNodes('//node') | Where-Object {$_.package -eq 'app.showcontrol.working' -and $_.text -eq 'Continuous main loop' -and $_.clickable -eq 'false'})
  if ($taskCount.Count -ne 1 -or $taskTitle.Count -ne 1) { throw 'ENDURANCE_UI_NOT_EIGHT_MAIN_VOICES' }
}
