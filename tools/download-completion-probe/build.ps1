param(
  [Parameter(Mandatory=$true)][string]$Sdk,
  [Parameter(Mandatory=$true)][string]$Jdk,
  [Parameter(Mandatory=$true)][string]$DebugKeystore,
  [Parameter(Mandatory=$true)][string]$TargetApk,
  [Parameter(Mandatory=$true)][string]$Output
)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath $Output){throw 'Preserve existing probe; choose a fresh output'}
New-Item -ItemType Directory -Path $Output | Out-Null
$taskOutput=(Resolve-Path -LiteralPath $Output).Path
$taskBuildTools=Join-Path $Sdk 'build-tools/36.0.0'
$taskPlatform=Join-Path $Sdk 'platforms/android-36/android.jar'
New-Item -ItemType Directory -Path "$taskOutput/classes","$taskOutput/dex" | Out-Null
& "$Jdk/bin/javac.exe" --release 8 -classpath $taskPlatform -d "$taskOutput/classes" "$PSScriptRoot/DownloadCompletionProbe.java" *> "$taskOutput/javac.log"
if($LASTEXITCODE -ne 0){throw 'Probe Java compile failed'}
$env:JAVA_HOME=$Jdk
$taskClasses=@(Get-ChildItem -LiteralPath "$taskOutput/classes" -Filter '*.class' -Recurse | ForEach-Object{$_.FullName})
& "$taskBuildTools/d8.bat" --min-api 24 --lib $taskPlatform --output "$taskOutput/dex" $taskClasses *> "$taskOutput/d8.log"
if($LASTEXITCODE -ne 0){throw 'Probe DEX compile failed'}
& "$taskBuildTools/aapt.exe" package -f -M "$PSScriptRoot/AndroidManifest.xml" -I $taskPlatform -F "$taskOutput/unsigned.apk" *> "$taskOutput/aapt.log"
if($LASTEXITCODE -ne 0){throw 'Probe manifest packaging failed'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip=[IO.Compression.ZipFile]::Open("$taskOutput/unsigned.apk",[IO.Compression.ZipArchiveMode]::Update)
try{[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip,"$taskOutput/dex/classes.dex",'classes.dex',[IO.Compression.CompressionLevel]::Optimal) | Out-Null}finally{$taskZip.Dispose()}
& "$taskBuildTools/zipalign.exe" -f 4 "$taskOutput/unsigned.apk" "$taskOutput/aligned.apk" *> "$taskOutput/align.log"
if($LASTEXITCODE -ne 0){throw 'Probe alignment failed'}
# Public repository internal/test key, never production credentials.
& "$taskBuildTools/apksigner.bat" sign --ks $DebugKeystore --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out "$taskOutput/probe.apk" "$taskOutput/aligned.apk" *> "$taskOutput/sign.log"
if($LASTEXITCODE -ne 0){throw 'Probe signing failed'}
& "$taskBuildTools/apksigner.bat" verify --verbose --print-certs "$taskOutput/probe.apk" *> "$taskOutput/verify.log"
if($LASTEXITCODE -ne 0){throw 'Probe signature failed'}
& "$taskBuildTools/apksigner.bat" verify --verbose --print-certs $TargetApk *> "$taskOutput/target-verify.log"
if($LASTEXITCODE -ne 0){throw 'Target signature failed'}
$taskProbe=@(Get-Content "$taskOutput/verify.log" | Select-String 'Signer #1 certificate SHA-256 digest:' | ForEach-Object{$_.Line})
$taskTarget=@(Get-Content "$taskOutput/target-verify.log" | Select-String 'Signer #1 certificate SHA-256 digest:' | ForEach-Object{$_.Line})
if($taskProbe.Count -ne 1 -or ($taskProbe -join '') -ne ($taskTarget -join '')){throw 'Signers differ'}
[ordered]@{path="$taskOutput/probe.apk";sha256=(Get-FileHash "$taskOutput/probe.apk").Hash;targetPackage='app.showcontrol.working';targetApkSha256=(Get-FileHash $TargetApk).Hash;sameSigner=$true;sourceSha256=(Get-FileHash "$PSScriptRoot/DownloadCompletionProbe.java").Hash;manifestSha256=(Get-FileHash "$PSScriptRoot/AndroidManifest.xml").Hash;createdUtc=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content "$taskOutput/metadata.json"
Get-Content "$taskOutput/metadata.json"
