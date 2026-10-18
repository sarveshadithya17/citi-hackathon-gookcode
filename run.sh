#!/usr/bin/env bash
# One command to run Thiran locally: builds the web app if needed, then starts the server.
set -euo pipefail
cd "$(dirname "$0")"

# Node is installed with nvm; load it if npm isn't already on PATH.
if ! command -v npm >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  . "$NVM_DIR/nvm.sh"
fi

if [ "${1:-}" = "--build" ] || [ ! -f frontend/dist/index.html ]; then
  echo "Building the web app..."
  (cd frontend && npm install && npm run build)
fi

echo "Thiran is starting on http://localhost:${PORT:-8000}  (API docs: http://localhost:${PORT:-8000}/docs)"
exec python -m uvicorn backend.app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
