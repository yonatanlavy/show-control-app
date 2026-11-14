param([Parameter(Mandatory=$true)][string]$FinalApk,[Parameter(Mandatory=$true)][string]$ReportPath,[switch]$Execute)
$ErrorActionPreference='Stop'
$taskWorkspace='C:\Users\Administrator\Documents\ChatGPT\Computer Use'
$taskAuthoring=Join-Path $taskWorkspace 'show-control-oms'
$taskCanonical='C:\dev\personal\show-control-app'
$taskApk=[IO.Path]::GetFullPath($FinalApk)
if(-not (Test-Path -LiteralPath $taskApk) -or [IO.Path]::GetDirectoryName($taskApk) -ne $taskWorkspace){throw 'Final APK must be an existing workspace delivery.'}
$taskFinalHash=(Get-FileHash -LiteralPath $taskApk -Algorithm SHA256).Hash
$taskRoots=[Collections.Generic.List[string]]::new()
foreach($taskProject in @($taskAuthoring,$taskCanonical)){
  foreach($taskRelative in @('.expo','dist','coverage','android/.gradle','android/.cxx','android/build','android/app/.cxx','android/app/build','modules/show-downloads/android/src/main/assets/showcontrol-music')){$taskRoots.Add([IO.Path]::GetFullPath((Join-Path $taskProject $taskRelative)))}
  foreach($taskModule in @('show-audio','show-controller','show-commerce','show-downloads','show-visual','show-voice')){foreach($taskRelative in @('android/build','android/.cxx','ios/build')){$taskRoots.Add([IO.Path]::GetFullPath((Join-Path $taskProject ('modules/'+$taskModule+'/'+$taskRelative))))}}
}
$taskRoots.Add((Join-Path $taskAuthoring '.native-check'))
$taskRoots.Add('C:\dev\sc-apk-cxx')
# Dependency source remains installed. Only Gradle outputs beside an actual
# Gradle project are generated caches; ordinary JavaScript "build" folders stay.
$taskDependencyRoot=Join-Path $taskCanonical 'node_modules/.pnpm'
if(Test-Path -LiteralPath $taskDependencyRoot){
  $taskStack=[Collections.Generic.Stack[IO.DirectoryInfo]]::new();$taskStack.Push([IO.DirectoryInfo]::new($taskDependencyRoot))
  while($taskStack.Count){
    $taskDirectory=$taskStack.Pop()
    if($taskDirectory.Attributes -band [IO.FileAttributes]::ReparsePoint){continue}
    if([IO.File]::Exists((Join-Path $taskDirectory.FullName 'build.gradle')) -or [IO.File]::Exists((Join-Path $taskDirectory.FullName 'build.gradle.kts'))){
      foreach($taskName in @('build','.gradle','.cxx')){if([IO.Directory]::Exists((Join-Path $taskDirectory.FullName $taskName))){$taskRoots.Add([IO.Path]::GetFullPath((Join-Path $taskDirectory.FullName $taskName)))}}
    }
    foreach($taskChild in $taskDirectory.EnumerateDirectories()){if($taskChild.Name -notin @('build','.gradle','.cxx','.git','.cache') -and -not ($taskChild.Attributes -band [IO.FileAttributes]::ReparsePoint)){$taskStack.Push($taskChild)}}
  }
}
$taskRoots.Add((Join-Path $taskCanonical 'node_modules/.cache'))
$taskMusic=Join-Path $taskWorkspace 'show-control-music-library'
$taskRoots.Add((Join-Path $taskMusic 'work'));$taskRoots.Add((Join-Path $taskMusic '__pycache__'))
$taskAllowed=@($taskRoots | Sort-Object -Unique)
function Assert-PlainAncestors([string]$path){
  $taskCursor=[IO.DirectoryInfo]::new([IO.Path]::GetDirectoryName($path))
  while($taskCursor){if($taskCursor.Exists -and ($taskCursor.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw ('Preserve path through linked ancestor: '+$path)};$taskCursor=$taskCursor.Parent}
}
$taskItems=@(foreach($taskPath in $taskAllowed){if(Test-Path -LiteralPath $taskPath){Assert-PlainAncestors $taskPath; $taskInfo=Get-Item -LiteralPath $taskPath -Force; if(-not $taskInfo.PSIsContainer -or ($taskInfo.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw ('Cleanup root is not a plain directory: '+$taskPath)}; [pscustomobject]@{path=$taskPath;kind='directory';status='planned'}}})
$taskItems+=@(Get-ChildItem -LiteralPath $taskWorkspace -File -Filter 'Show-Control-*.apk' | Where-Object {$_.FullName -ne $taskApk} | ForEach-Object {[pscustomobject]@{path=$_.FullName;kind='installer';status='planned'}})
foreach($taskItem in $taskItems){
  $taskAbsolute=[IO.Path]::GetFullPath($taskItem.path)
  if($taskItem.kind -eq 'directory' -and $taskAbsolute -notin $taskAllowed){throw 'Directory is outside exact cleanup allowlist'}
  if($taskItem.kind -eq 'installer' -and ([IO.Path]::GetDirectoryName($taskAbsolute) -ne $taskWorkspace -or [IO.Path]::GetExtension($taskAbsolute) -ne '.apk' -or $taskAbsolute -eq $taskApk)){throw 'Installer cleanup escaped workspace'}
}
$taskPlan=[ordered]@{finalApk=$taskApk;finalSha256=$taskFinalHash;items=$taskItems;preserved=@((Join-Path $taskCanonical 'music-library'),$taskMusic,(Join-Path $taskAuthoring 'src'),(Join-Path $taskAuthoring 'tests'),(Join-Path $taskAuthoring 'tools'),'Source code, credentials, licenses, music backups and other projects');beforeFreeC=(Get-PSDrive C).Free;createdUtc=[DateTimeOffset]::UtcNow.ToString('o')}
$taskPlan | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding utf8
if(-not $Execute){Write-Output ('Reviewed cleanup plan: '+$taskItems.Count+' exact generated directories/installers.');$taskItems | ConvertTo-Json -Compress;return}
$taskActive=@(Get-CimInstance Win32_Process | Where-Object {($_.Name -match 'emulator|qemu-system' -and $_.CommandLine -match 'ShowControl|show-control-oms') -or ($_.Name -in @('java.exe','node.exe') -and $_.CommandLine -match 'GradleDaemon|GradleWrapperMain|typescript/bin/tsc|eslint/bin|jest/bin|expo.*export')})
if($taskActive.Count){throw 'Preserve active test/build processes; stop them deliberately before cleanup.'}
$taskWork=Join-Path $taskMusic 'work'
if(Test-Path -LiteralPath $taskWork){if(@(Get-ChildItem -LiteralPath $taskWork -File -Recurse | Where-Object {$_.Extension -match '^\.(mp3|wav|aac|m4a|flac|ogg|opus|aiff|mp4|zip)$'}).Count){throw 'Music or archives found in work; preserve them before cleanup'}}
$script:taskBytes=0L;$script:taskFiles=0L;$script:taskLinks=0L
function Remove-ExactTree([string]$path,[string]$boundary){
  $taskAbsolute=[IO.Path]::GetFullPath($path)
  if($taskAbsolute -ne $boundary -and -not $taskAbsolute.StartsWith($boundary+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Recursive cleanup escaped its reviewed boundary'}
  $taskDirectory=[IO.DirectoryInfo]::new($taskAbsolute)
  if($taskDirectory.Attributes -band [IO.FileAttributes]::ReparsePoint){[IO.Directory]::Delete($taskAbsolute,$false);$script:taskLinks++;return}
  foreach($taskChild in $taskDirectory.EnumerateFileSystemInfos()){
    $taskAttributes=$taskChild.Attributes
    if($taskAttributes -band [IO.FileAttributes]::ReparsePoint){if($taskAttributes -band [IO.FileAttributes]::Directory){[IO.Directory]::Delete($taskChild.FullName,$false)}else{[IO.File]::Delete($taskChild.FullName)};$script:taskLinks++}
    elseif($taskAttributes -band [IO.FileAttributes]::Directory){Remove-ExactTree $taskChild.FullName $boundary}
    else{if($taskAttributes -band [IO.FileAttributes]::ReadOnly){[IO.File]::SetAttributes($taskChild.FullName,($taskAttributes -band (-bnot [IO.FileAttributes]::ReadOnly)))};$taskLength=$taskChild.Length;[IO.File]::Delete($taskChild.FullName);$script:taskBytes+=$taskLength;$script:taskFiles++}
  }
  if($taskDirectory.Attributes -band [IO.FileAttributes]::ReadOnly){[IO.File]::SetAttributes($taskAbsolute,($taskDirectory.Attributes -band (-bnot [IO.FileAttributes]::ReadOnly)))}
  [IO.Directory]::Delete($taskAbsolute,$false)
}
$taskFailures=@()
foreach($taskItem in $taskItems){try{Assert-PlainAncestors $taskItem.path; if($taskItem.kind -eq 'directory'){Remove-ExactTree $taskItem.path $taskItem.path}else{$taskInfo=Get-Item -LiteralPath $taskItem.path -Force;if($taskInfo.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Installer became a link'};$script:taskBytes+=$taskInfo.Length;Remove-Item -LiteralPath $taskItem.path -Force;$script:taskFiles++};$taskItem.status='removed'}catch{$taskItem.status='retained_or_partial';$taskFailures+=@{path=$taskItem.path;error=$_.Exception.Message}}}
if((Get-FileHash -LiteralPath $taskApk -Algorithm SHA256).Hash -ne $taskFinalHash){throw 'Final installer changed during cleanup'}
$taskPlan.items=$taskItems;$taskPlan.removedFiles=$script:taskFiles;$taskPlan.removedLinks=$script:taskLinks;$taskPlan.removedLogicalBytes=$script:taskBytes;$taskPlan.afterFreeC=(Get-PSDrive C).Free;$taskPlan.failures=$taskFailures;$taskPlan.completedUtc=[DateTimeOffset]::UtcNow.ToString('o')
$taskPlan | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ReportPath -Encoding utf8
[ordered]@{removedFiles=$script:taskFiles;removedLogicalBytes=$script:taskBytes;freeSpaceIncrease=$taskPlan.afterFreeC-$taskPlan.beforeFreeC;failures=$taskFailures;finalSha256=$taskFinalHash} | ConvertTo-Json -Depth 4 -Compress
