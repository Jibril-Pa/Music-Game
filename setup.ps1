# One-time setup for Windows (PowerShell):  .\setup.ps1
# Checks tools, creates backend\.venv, installs deps (CUDA PyTorch if an NVIDIA
# GPU is present), downloads all models so the demo works offline.
# It never installs system packages; it prints the winget command instead.
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$missing = @()

Write-Host "`n==> Checking prerequisites"
$py311 = $null
try { & py -3.11 --version *> $null; if ($LASTEXITCODE -eq 0) { $py311 = "py311" } } catch {}
if ($py311) { Write-Host "  Python 3.11: $(& py -3.11 --version)" } else { $missing += "Python 3.11:  winget install Python.Python.3.11" }

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node -and [int]((& node -p "process.versions.node.split('.')[0]")) -ge 20) { Write-Host "  Node: $(& node --version)" }
else { $missing += "Node 20+:     winget install OpenJS.NodeJS.LTS" }

if ((Get-Command ffmpeg -ErrorAction SilentlyContinue) -and (Get-Command ffprobe -ErrorAction SilentlyContinue)) { Write-Host "  ffmpeg: found" }
else { $missing += "ffmpeg:       winget install Gyan.FFmpeg   (then open a new terminal)" }

if ($missing.Count -gt 0) {
  Write-Host "`nMissing tools. Install them, then re-run .\setup.ps1:"
  $missing | ForEach-Object { Write-Host "  - $_" }
  exit 1
}

Write-Host "`n==> Python venv (backend\.venv)"
Set-Location (Join-Path $Root "backend")
$vpy = Join-Path $Root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $vpy)) { & py -3.11 -m venv .venv }
& $vpy -m pip install --quiet --upgrade pip wheel
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
  Write-Host "  NVIDIA GPU found: installing CUDA build of PyTorch"
  & $vpy -m pip install torch --index-url https://download.pytorch.org/whl/cu126
}
& $vpy -m pip install -r requirements.txt
& $vpy -m pip install --no-deps basic-pitch==0.4.0

# The lute's coach (optional): Gemini key + Tiger Data URL go in backend\.env (git-ignored).
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env" }

Write-Host "`n==> Downloading models (Demucs htdemucs_6s, Basic Pitch check)"
& $vpy setup_models.py

Write-Host "`n==> Frontend packages"
Set-Location (Join-Path $Root "frontend")
npm install
Set-Location $Root

Write-Host "`n==> Done. Start everything with .\dev.ps1, then open http://localhost:3000/preview"
Write-Host "Optional: add GEMINI_API_KEY and TIGER_DATABASE_URL to backend\.env for the lute's coach (see README)."
