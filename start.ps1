$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-Port($port) {
  try {
    $null = Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue
    return $true
  } catch {
    return $false
  }
}

$python = Join-Path $root 'services\asr\.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
  Write-Host 'Speech service is not installed.' -ForegroundColor Yellow
  Write-Host 'Run these once:'
  Write-Host '  cd services\asr'
  Write-Host '  python -m venv .venv'
  Write-Host '  .\.venv\Scripts\python.exe -m pip install -r requirements.txt'
  exit 1
}

if (-not (Test-Port 8756)) {
  Write-Host 'Starting speech recogniser on 8756...' -ForegroundColor Cyan
  Start-Process -FilePath $python `
    -ArgumentList '-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', '8756' `
    -WorkingDirectory (Join-Path $root 'services\asr') `
    -WindowStyle Minimized
} else {
  Write-Host 'Speech recogniser already running.' -ForegroundColor DarkGray
}

Write-Host 'Starting API + web app (Ctrl+C to stop)...' -ForegroundColor Cyan
Start-Process 'http://localhost:5173'
Push-Location $root
try {
  npm run dev
} finally {
  Pop-Location
}
