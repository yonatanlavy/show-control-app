param([string]$LogDirectory='.native-check/bundled-music-checks')
$ErrorActionPreference='Stop'
$taskProject=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location $taskProject
$taskNode='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$taskOutput=[IO.Path]::GetFullPath((Join-Path $taskProject $LogDirectory))
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
$taskChecks=[ordered]@{}
& $taskNode node_modules/typescript/bin/tsc --noEmit *> (Join-Path $taskOutput 'types.log');$taskChecks.types=$LASTEXITCODE
& $taskNode node_modules/eslint/bin/eslint.js . --max-warnings=0 *> (Join-Path $taskOutput 'lint.log');$taskChecks.lint=$LASTEXITCODE
& $taskNode node_modules/jest/bin/jest.js --runInBand --testTimeout=30000 --json ('--outputFile='+ (Join-Path $taskOutput 'tests.json')) ('--cacheDirectory='+ (Join-Path $taskOutput 'jest-cache')) *> (Join-Path $taskOutput 'tests.log');$taskChecks.tests=$LASTEXITCODE
& $taskNode node_modules/jest/bin/jest.js tests/architecture --runInBand --testTimeout=30000 *> (Join-Path $taskOutput 'architecture.log');$taskChecks.architecture=$LASTEXITCODE
& $taskNode scripts/check-translations.mjs *> (Join-Path $taskOutput 'translations.log');$taskChecks.translations=$LASTEXITCODE
& $taskNode scripts/generate-tokens.mjs --check *> (Join-Path $taskOutput 'tokens.log');$taskChecks.tokens=$LASTEXITCODE
& $taskNode tests/native/rehearsal-seek-source-regression.mjs *> (Join-Path $taskOutput 'native-audio.log');$taskChecks.nativeAudio=$LASTEXITCODE
& $taskNode tests/native/download-completion-source-regression.mjs *> (Join-Path $taskOutput 'native-downloads.log');$taskChecks.nativeDownloads=$LASTEXITCODE
& $taskNode tests/native/download-initialization-source-regression.mjs *> (Join-Path $taskOutput 'native-initialization.log');$taskChecks.nativeInitialization=$LASTEXITCODE
$taskTests=Get-Content (Join-Path $taskOutput 'tests.json') -Raw | ConvertFrom-Json
$taskChecks.passed=$taskTests.numPassedTests;$taskChecks.failed=$taskTests.numFailedTests;$taskChecks.suites=$taskTests.numPassedTestSuites;$taskChecks.completedUtc=[DateTimeOffset]::UtcNow.ToString('o')
$taskChecks | ConvertTo-Json | Set-Content (Join-Path $taskOutput 'checks.json') -Encoding utf8
$taskChecks | ConvertTo-Json -Compress
foreach($taskName in @('types','lint','tests','architecture','translations','tokens','nativeAudio','nativeDownloads','nativeInitialization')){if($taskChecks[$taskName] -ne 0){exit 1}}
