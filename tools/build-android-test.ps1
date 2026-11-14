param([Parameter(Mandatory=$true)][string]$OutputApk,[switch]$IncludeMusic)
$ErrorActionPreference='Stop'
$taskProject=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskOutput=[IO.Path]::GetFullPath($OutputApk)
if(Test-Path -LiteralPath $taskOutput){throw 'Preserve the existing installer; choose a new output filename.'}
if(-not (Test-Path -LiteralPath (Join-Path $taskProject 'android/gradlew.bat'))){throw 'Generate the Android development project before building.'}
$env:JAVA_HOME='C:/Program Files/Android/Android Studio/jbr'
$env:ANDROID_HOME='C:/Users/Administrator/AppData/Local/Android/Sdk'
$env:PATH='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin;C:/Program Files/Android/Android Studio/jbr/bin;'+$env:PATH
$env:JAVA_TOOL_OPTIONS='-Djdk.net.unixdomain.tmpdir="C:/Users/Administrator/Documents/ChatGPT/Computer Use/tmp" -Djava.net.preferIPv4Stack=true'
$env:NODE_ENV='production';$env:EXPO_NO_DOTENV='1';$env:EXPO_NO_TELEMETRY='1'
$env:SHOW_CONTROL_INCLUDE_MUSIC=$(if($IncludeMusic){'1'}else{'0'})
& (Join-Path $taskProject 'android/gradlew.bat') -p (Join-Path $taskProject 'android') :show-audio:lintRelease :show-controller:lintRelease :show-commerce:lintRelease :show-downloads:lintRelease :app:assembleRelease '-PreactNativeArchitectures=x86_64,arm64-v8a' '-Pandroid.lint.useK2Uast=false' '-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m' --offline --no-daemon --max-workers=1 --init-script (Join-Path $PSScriptRoot 'android/bundled-music.init.gradle') --console=plain --stacktrace
if($LASTEXITCODE -ne 0){throw 'Android build or lint failed.'}
$taskApk=Join-Path $taskProject 'android/app/build/outputs/apk/release/app-release.apk'
& (Join-Path $env:ANDROID_HOME 'build-tools/36.0.0/apksigner.bat') verify --verbose --print-certs $taskApk
if($LASTEXITCODE -ne 0){throw 'APK signature verification failed.'}
Copy-Item -LiteralPath $taskApk -Destination $taskOutput
[ordered]@{path=$taskOutput;bytes=(Get-Item -LiteralPath $taskOutput).Length;sha256=(Get-FileHash -LiteralPath $taskOutput -Algorithm SHA256).Hash;requestedMusic=[bool]$IncludeMusic;includedMusic=(Test-Path -LiteralPath (Join-Path $taskProject 'modules/show-downloads/android/src/main/assets/showcontrol-music/manifest.json'));signing='internal/test'} | ConvertTo-Json -Compress
