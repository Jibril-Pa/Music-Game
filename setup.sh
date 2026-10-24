#!/usr/bin/env bash
# One-time setup for macOS / Linux: checks tools, creates backend/.venv,
# installs Python + Node deps, downloads all models (so the demo works offline).
# It never installs system packages; it prints the command for anything missing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OS="$(uname -s)"

say() { printf "\n==> %s\n" "$*"; }
missing=()

say "Checking prerequisites ($OS $(uname -m))"
PY311=""
for c in python3.11 /opt/homebrew/bin/python3.11 /usr/local/bin/python3.11; do
  if command -v "$c" >/dev/null 2>&1; then PY311="$(command -v "$c")"; break; fi
done
if [ -n "$PY311" ]; then echo "  Python 3.11: $("$PY311" --version) ($PY311)"; else
  if [ "$OS" = "Darwin" ]; then missing+=("Python 3.11:  brew install python@3.11");
  else missing+=("Python 3.11:  sudo apt install python3.11 python3.11-venv  (Ubuntu <24.04: sudo add-apt-repository ppa:deadsnakes/ppa first)"); fi
fi
if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then
  echo "  Node: $(node --version)"
else
  if [ "$OS" = "Darwin" ]; then missing+=("Node 20+:     brew install node");
  else missing+=("Node 20+:     curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs"); fi
fi
if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
  echo "  ffmpeg: $(ffmpeg -version | head -1 | cut -d' ' -f1-3)"
else
  if [ "$OS" = "Darwin" ]; then missing+=("ffmpeg:       brew install ffmpeg");
  else missing+=("ffmpeg:       sudo apt install ffmpeg"); fi
fi
if [ ${#missing[@]} -gt 0 ]; then
  echo
  echo "Missing tools. Install them, then re-run ./setup.sh:"
  for m in "${missing[@]}"; do echo "  - $m"; done
  exit 1
fi

say "Python venv (backend/.venv)"
cd "$ROOT/backend"
[ -x .venv/bin/python ] || "$PY311" -m venv .venv
.venv/bin/python -m pip install --quiet --upgrade pip wheel
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m pip install --no-deps basic-pitch==0.4.0

say "Downloading models (Demucs htdemucs_6s, Basic Pitch check)"
.venv/bin/python setup_models.py

say "Frontend packages"
cd "$ROOT/frontend"
npm install

say "Done. Start everything with ./dev.sh, then open http://localhost:3000/preview"
