$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path '.venv')) {
  python -m venv .venv
}

Write-Host 'Installing speech service dependencies...' -ForegroundColor Cyan
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

Write-Host ''
Write-Host 'Done. Warm up the model (downloads ~480 MB once):' -ForegroundColor Green
Write-Host '  .\.venv\Scripts\python.exe -c "from faster_whisper import WhisperModel; WhisperModel(''small.en'', device=''cpu'', compute_type=''int8''); print(''ready'')"'
Write-Host ''
Write-Host 'Then run it with:' -ForegroundColor Green
Write-Host '  .\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8756'
