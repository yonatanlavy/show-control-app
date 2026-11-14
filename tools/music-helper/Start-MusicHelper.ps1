param([string]$ListenAddress = '127.0.0.1', [int]$Port = 8765, [string]$FfmpegPath, [string]$PythonPath = 'python')
$ErrorActionPreference = 'Stop'
if (!$FfmpegPath) {
  $taskFfmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if ($taskFfmpeg) { $FfmpegPath = $taskFfmpeg.Source }
  else { throw 'Supply -FfmpegPath with the path to your installed FFmpeg executable.' }
}
if (!(Test-Path -LiteralPath $FfmpegPath -PathType Leaf)) { throw 'FFmpeg path is unavailable.' }
& $PythonPath (Join-Path $PSScriptRoot 'server.py') --listen $ListenAddress --port $Port --ffmpeg $FfmpegPath
exit $LASTEXITCODE
