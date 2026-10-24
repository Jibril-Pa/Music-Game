# Start backend (http://localhost:8000) and frontend (http://localhost:3000) on Windows.
# Ctrl+C stops both.   YouTube links:  $env:ENABLE_YOUTUBE="true"; .\dev.ps1
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$py = Join-Path $Root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) { Write-Error "backend\.venv not found. Run .\setup.ps1 first."; exit 1 }
if (-not (Test-Path (Join-Path $Root "frontend\node_modules"))) { Write-Error "frontend\node_modules not found. Run .\setup.ps1 first."; exit 1 }

$backend = Start-Process -FilePath $py -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000" `
  -WorkingDirectory (Join-Path $Root "backend") -NoNewWindow -PassThru
$frontend = Start-Process -FilePath "npx.cmd" -ArgumentList "next", "dev", "--hostname", "localhost", "--port", "3000" `
  -WorkingDirectory (Join-Path $Root "frontend") -NoNewWindow -PassThru

Write-Host "Backend:  http://localhost:8000   (API docs: http://localhost:8000/docs)"
Write-Host "Frontend: http://localhost:3000/preview"
Write-Host "Press Ctrl+C to stop."
try {
  while (-not $backend.HasExited -and -not $frontend.HasExited) { Start-Sleep -Milliseconds 500 }
}
finally {
  foreach ($p in @($backend, $frontend)) {
    if ($p -and -not $p.HasExited) { & taskkill /PID $p.Id /T /F *> $null }
  }
  Write-Host "Stopped."
}
