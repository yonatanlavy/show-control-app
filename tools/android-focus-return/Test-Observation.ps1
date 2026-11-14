#requires -Version 7.0
# Offline checks execute the actual capture/page functions with terminal ADB
# receipts at their boundary. No emulator, app, SDK or provider is contacted.
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskOutput = Join-Path $taskRoot ('.native-check/focus-observation-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $taskOutput | Out-Null
$RunId = [guid]::NewGuid().ToString()
$taskPackage = 'app.showcontrol.working'
$taskTokens = $null; $taskErrors = $null
$taskAst = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Invoke-FocusReturn.ps1'),[ref]$taskTokens,[ref]$taskErrors)
if ($taskErrors.Count) { throw 'Production harness does not parse' }
foreach ($taskName in @('Capture-Ui','Require-AppPage')) {
  $taskFunction = @($taskAst.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $taskName},$true))
  if ($taskFunction.Count -ne 1) { throw 'Actual function not unique' }
  . ([scriptblock]::Create($taskFunction[0].Extent.Text))
}
function Reset-Fixture([string[]]$Responses, [string]$ThrowOnDump = '', [switch]$ChangedProcess, [string]$Page = 'Settings') {
  $script:taskResponses = $Responses; $script:taskDumpFailure = $ThrowOnDump
  $script:taskChangedProcess = [bool]$ChangedProcess; $script:taskFixturePage = $Page
  $script:taskDumpCount = 0; $script:taskPullCount = 0; $script:taskProcessCount = 0
}
function Require-Process([string]$Name) {
  $script:taskProcessCount++
  if ($script:taskChangedProcess) { throw 'PROCESS_CHANGED: fixture' }
}
function Invoke-Adb([string]$Name, [string[]]$Arguments) {
  if ($Arguments[0] -eq 'pull') {
    $script:taskPullCount++
    '<hierarchy><node package="app.showcontrol.working" text="' + $script:taskFixturePage + '" clickable="false" /></hierarchy>' | Set-Content -LiteralPath $Arguments[2]
    return 'pulled'
  }
  if (($Arguments[0..2] -join '|') -ne 'shell|uiautomator|dump') { throw 'Unexpected operation; offline fixtures cannot navigate/restart' }
  $script:taskDumpCount++
  if ($script:taskDumpFailure) { throw $script:taskDumpFailure }
  $taskResponse = $script:taskResponses[[Math]::Min($script:taskDumpCount - 1, $script:taskResponses.Count - 1)]
  return $taskResponse.Replace('{remote}', $Arguments[3])
}
function Expect-Failure([scriptblock]$Action, [string]$Code) {
  try { & $Action; throw 'Expected refusal was missing' }
  catch { if ($_.Exception.Message -notlike "$Code*") { throw } }
}
function Assert-Counts([int]$Dumps, [int]$Pulls, [int]$Processes) {
  if ($script:taskDumpCount -ne $Dumps -or $script:taskPullCount -ne $Pulls -or $script:taskProcessCount -ne $Processes) { throw 'Unexpected retry/observation counts' }
}
$taskResults = [Collections.Generic.List[string]]::new()
Reset-Fixture @('', 'UI hierarchy dumped to: {remote}')
Require-AppPage (Capture-Ui 'terminal-unavailable-then-success') 'Settings'
Assert-Counts 2 1 2; $taskResults.Add('terminal null-root observation recovers without navigation')
Reset-Fixture @('')
Expect-Failure { Capture-Ui 'three-terminal-unavailable' } 'UI_OBSERVATION_UNAVAILABLE:'
Assert-Counts 3 0 3; $taskResults.Add('three unavailable observations refuse without pulling stale XML')
Reset-Fixture @('') -ThrowOnDump 'OBSERVATION_PENDING: fixture-live-handle'
Expect-Failure { Capture-Ui 'pending-observer' } 'OBSERVATION_PENDING:'
Assert-Counts 1 0 1; $taskResults.Add('pending observer is propagated without retry')
Reset-Fixture @('UI hierarchy dumped to: {remote}') -ChangedProcess
Expect-Failure { Capture-Ui 'changed-process' } 'PROCESS_CHANGED:'
Assert-Counts 0 0 1; $taskResults.Add('process change refuses before another dump')
Reset-Fixture @('UI hierarchy dumped to: {remote}') -Page 'Wrong page'
Expect-Failure { Require-AppPage (Capture-Ui 'wrong-page') 'Settings' } 'PAGE_MISMATCH:'
Assert-Counts 1 1 1; $taskResults.Add('wrong page fails without waiting it away')
Reset-Fixture @('UI hierarchy dumped to: /sdcard/a-different-old-file.xml')
Expect-Failure { Capture-Ui 'wrong-path' } 'UI_OBSERVATION_UNAVAILABLE:'
Assert-Counts 3 0 3; $taskResults.Add('a different dump path cannot authorize a stale pull')
[ordered]@{passed=$taskResults.Count;cases=@($taskResults);productionCaptureExecuted=$true;adbCalls=0;appRestarts=0;providers=0;sourceSha256=(Get-FileHash (Join-Path $PSScriptRoot 'Invoke-FocusReturn.ps1')).Hash;finishedUtc=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $taskOutput 'result.json')
Get-Content -LiteralPath (Join-Path $taskOutput 'result.json')
