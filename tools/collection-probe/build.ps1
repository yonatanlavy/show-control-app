param(
  [Parameter(Mandatory=$true)][string]$Sdk,
  [Parameter(Mandatory=$true)][string]$Jdk,
  [Parameter(Mandatory=$true)][string]$DebugKeystore,
  [Parameter(Mandatory=$true)][string]$Fixture,
  [Parameter(Mandatory=$true)][ValidatePattern('^[A-F0-9]{64}$')][string]$FixtureSha256,
  [Parameter(Mandatory=$true)][string]$TargetApk,
  [Parameter(Mandatory=$true)][string]$Output
)
$ErrorActionPreference='Stop'
if((Get-FileHash -LiteralPath $Fixture).Hash -ne $FixtureSha256 -or (Get-Item -LiteralPath $Fixture).Length -gt 4000000){throw 'Synthetic collection fixture differs'}
if(Test-Path -LiteralPath $Output){throw 'Preserve an existing probe build; choose a new output directory'}
New-Item -ItemType Directory -Path $Output | Out-Null
$taskOutput=(Resolve-Path -LiteralPath $Output).Path
$taskBuildTools=Join-Path $Sdk 'build-tools/36.0.0'
$taskPlatform=Join-Path $Sdk 'platforms/android-36/android.jar'
New-Item -ItemType Directory -Path "$taskOutput/classes","$taskOutput/dex","$taskOutput/assets" | Out-Null
$taskFixtureMetadata=Get-Content -LiteralPath (Join-Path (Split-Path -Parent $Fixture) 'fixture-metadata.json') -Raw | ConvertFrom-Json
if($taskFixtureMetadata.fixtureSha256 -ne $FixtureSha256 -or $taskFixtureMetadata.token -notmatch '^[a-f0-9-]{36}$'){throw 'Fixture metadata differs'}
$taskTone=Join-Path (Split-Path -Parent $Fixture) 'tone.wav'
if((Get-FileHash -LiteralPath $taskTone).Hash -ne $taskFixtureMetadata.mediaSha256){throw 'Synthetic media differs'}
Copy-Item -LiteralPath $Fixture -Destination "$taskOutput/assets/fixture.json"
Copy-Item -LiteralPath $taskTone -Destination "$taskOutput/assets/tone.wav"
& "$Jdk/bin/javac.exe" --release 8 -classpath $taskPlatform -d "$taskOutput/classes" "$PSScriptRoot/CollectionProbe.java" *> "$taskOutput/javac.log"
if($LASTEXITCODE -ne 0){throw 'Probe Java compilation failed'}
$env:JAVA_HOME=$Jdk
$taskClasses=@(Get-ChildItem -LiteralPath "$taskOutput/classes" -Recurse -Filter '*.class' | ForEach-Object {$_.FullName})
& "$taskBuildTools/d8.bat" --min-api 24 --lib $taskPlatform --output "$taskOutput/dex" $taskClasses *> "$taskOutput/d8.log"
if($LASTEXITCODE -ne 0){throw 'Probe DEX compilation failed'}
& "$taskBuildTools/aapt.exe" package -f -M "$PSScriptRoot/AndroidManifest.xml" -I $taskPlatform -A "$taskOutput/assets" -F "$taskOutput/unsigned.apk" *> "$taskOutput/aapt.log"
if($LASTEXITCODE -ne 0){throw 'Probe manifest packaging failed'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip=[IO.Compression.ZipFile]::Open("$taskOutput/unsigned.apk",[IO.Compression.ZipArchiveMode]::Update)
try{[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip,"$taskOutput/dex/classes.dex",'classes.dex',[IO.Compression.CompressionLevel]::Optimal) | Out-Null}finally{$taskZip.Dispose()}
& "$taskBuildTools/zipalign.exe" -f 4 "$taskOutput/unsigned.apk" "$taskOutput/aligned.apk" *> "$taskOutput/zipalign.log"
if($LASTEXITCODE -ne 0){throw 'Probe alignment failed'}
# These are the repository's public test-key credentials, never production credentials.
& "$taskBuildTools/apksigner.bat" sign --ks $DebugKeystore --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out "$taskOutput/probe.apk" "$taskOutput/aligned.apk" *> "$taskOutput/sign.log"
if($LASTEXITCODE -ne 0){throw 'Probe test signing failed'}
& "$taskBuildTools/apksigner.bat" verify --verbose --print-certs "$taskOutput/probe.apk" *> "$taskOutput/verify.log"
if($LASTEXITCODE -ne 0){throw 'Probe signature verification failed'}
& "$taskBuildTools/apksigner.bat" verify --verbose --print-certs $TargetApk *> "$taskOutput/target-verify.log"
if($LASTEXITCODE -ne 0){throw 'Target signature verification failed'}
$taskProbeSigner=@(Get-Content "$taskOutput/verify.log" | Select-String 'Signer #1 certificate SHA-256 digest:' | ForEach-Object {$_.Line})
$taskTargetSigner=@(Get-Content "$taskOutput/target-verify.log" | Select-String 'Signer #1 certificate SHA-256 digest:' | ForEach-Object {$_.Line})
if($taskProbeSigner.Count -ne 1 -or ($taskProbeSigner -join '') -ne ($taskTargetSigner -join '')){throw 'Test and target signatures differ'}
[ordered]@{path="$taskOutput/probe.apk";sha256=(Get-FileHash "$taskOutput/probe.apk").Hash;targetApkSha256=(Get-FileHash -LiteralPath $TargetApk).Hash;sameSigner=$true;fixtureToken=$taskFixtureMetadata.token;mediaSha256=$taskFixtureMetadata.mediaSha256;fixtureSha256=(Get-FileHash -LiteralPath $Fixture).Hash;createdUtc=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content "$taskOutput/metadata.json" -Encoding utf8
Get-Content "$taskOutput/metadata.json"
