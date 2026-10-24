#!/usr/bin/env bash
# Start backend (http://localhost:8000) and frontend (http://localhost:3000).
# Ctrl+C stops both.   Options: ENABLE_YOUTUBE=true ./dev.sh   RELOAD=1 ./dev.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PY="$ROOT/backend/.venv/bin/python"

if [ ! -x "$PY" ]; then
  echo "backend/.venv not found. Run ./setup.sh first." >&2
  exit 1
fi
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "frontend/node_modules not found. Run ./setup.sh first." >&2
  exit 1
fi

pids=()
cleanup() {
  trap - INT TERM EXIT
  echo
  echo "Stopping..."
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

reload_flag=()
if [ "${RELOAD:-0}" = "1" ]; then reload_flag=(--reload --reload-dir pipeline --reload-dir app); fi

(cd "$ROOT/backend" && exec "$PY" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 "${reload_flag[@]+"${reload_flag[@]}"}") &
pids+=($!)
(cd "$ROOT/frontend" && exec npx next dev --hostname localhost --port 3000) &
pids+=($!)

echo "Backend:  http://localhost:8000   (API docs: http://localhost:8000/docs)"
echo "Frontend: http://localhost:3000/preview"
wait -n "${pids[@]}" 2>/dev/null || wait
