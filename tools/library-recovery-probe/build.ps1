param([Parameter(Mandatory=$true)][string]$Sdk,[Parameter(Mandatory=$true)][string]$Jdk,[Parameter(Mandatory=$true)][string]$DebugKeystore,[Parameter(Mandatory=$true)][string]$FixtureMetadata,[Parameter(Mandatory=$true)][string]$TargetApk,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath $Output){throw 'Preserve existing probe build'}
$taskFixture=Get-Content -LiteralPath $FixtureMetadata -Raw | ConvertFrom-Json
if($taskFixture.token -notmatch '^[a-f0-9-]{36}$' -or $taskFixture.audioSha256 -notmatch '^[a-f0-9]{64}$' -or $taskFixture.imageSha256 -notmatch '^[a-f0-9]{64}$'){throw 'Invalid synthetic fixture identity'}
New-Item -ItemType Directory -Path $Output | Out-Null; $taskOutput=(Resolve-Path -LiteralPath $Output).Path
New-Item -ItemType Directory -Path "$taskOutput/classes","$taskOutput/dex" | Out-Null
$taskTools=Join-Path $Sdk 'build-tools/36.0.0'; $taskPlatform=Join-Path $Sdk 'platforms/android-36/android.jar'
& "$Jdk/bin/javac.exe" --release 8 -classpath $taskPlatform -d "$taskOutput/classes" "$PSScriptRoot/LibraryRecoveryProbe.java" *> "$taskOutput/javac.log"
if($LASTEXITCODE -ne 0){throw 'Probe Java compilation failed'}
$env:JAVA_HOME=$Jdk
$taskClasses=@(Get-ChildItem -LiteralPath "$taskOutput/classes" -Recurse -Filter '*.class' -File | ForEach-Object {$_.FullName})
& "$taskTools/d8.bat" --min-api 35 --lib $taskPlatform --output "$taskOutput/dex" $taskClasses *> "$taskOutput/d8.log"
if($LASTEXITCODE -ne 0){throw 'Probe DEX failed'}
& "$taskTools/aapt.exe" package -f -M "$PSScriptRoot/AndroidManifest.xml" -I $taskPlatform -F "$taskOutput/unsigned.apk" *> "$taskOutput/aapt.log"
if($LASTEXITCODE -ne 0){throw 'Probe package failed'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip=[IO.Compression.ZipFile]::Open("$taskOutput/unsigned.apk",[IO.Compression.ZipArchiveMode]::Update)
try{[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip,"$taskOutput/dex/classes.dex",'classes.dex',[IO.Compression.CompressionLevel]::Optimal) | Out-Null}finally{$taskZip.Dispose()}
& "$taskTools/zipalign.exe" -f 4 "$taskOutput/unsigned.apk" "$taskOutput/aligned.apk" *> "$taskOutput/zipalign.log"
if($LASTEXITCODE -ne 0){throw 'Probe alignment failed'}
# Repository public test-key credentials, never production credentials.
& "$taskTools/apksigner.bat" sign --ks $DebugKeystore --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out "$taskOutput/probe.apk" "$taskOutput/aligned.apk" *> "$taskOutput/sign.log"
if($LASTEXITCODE -ne 0){throw 'Probe signing failed'}
& "$taskTools/apksigner.bat" verify --verbose --print-certs "$taskOutput/probe.apk" *> "$taskOutput/verify.log"
if($LASTEXITCODE -ne 0){throw 'Probe signature failed'}
& "$taskTools/apksigner.bat" verify --verbose --print-certs $TargetApk *> "$taskOutput/target-verify.log"
if($LASTEXITCODE -ne 0){throw 'Target signature failed'}
$taskProbeSigner=@(Get-Content "$taskOutput/verify.log" | Select-String 'Signer #1 certificate SHA-256 digest:' | ForEach-Object {$_.Line})
$taskTargetSigner=@(Get-Content "$taskOutput/target-verify.log" | Select-String 'Signer #1 certificate SHA-256 digest:' | ForEach-Object {$_.Line})
if($taskProbeSigner.Count -ne 1 -or ($taskProbeSigner -join '') -ne ($taskTargetSigner -join '')){throw 'Probe and target signers differ'}
[ordered]@{path="$taskOutput/probe.apk";sha256=(Get-FileHash "$taskOutput/probe.apk").Hash;targetApkSha256=(Get-FileHash -LiteralPath $TargetApk).Hash;sameSigner=$true;token=$taskFixture.token;audioSha256=$taskFixture.audioSha256;imageSha256=$taskFixture.imageSha256;sourceSha256=(Get-FileHash "$PSScriptRoot/LibraryRecoveryProbe.java").Hash;createdUtc=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content "$taskOutput/metadata.json"
Get-Content "$taskOutput/metadata.json"
