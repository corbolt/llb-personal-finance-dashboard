#!/usr/bin/env bash
# Starts the production server in the background; output goes to server.log.
# Stop it with ./stop.sh.
set -euo pipefail
cd "$(dirname "$0")"

PID_FILE=server.pid

if [[ -f $PID_FILE ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Already running (PID $(cat "$PID_FILE"))."
  exit 0
fi

# the app needs the Node version from .nvmrc
if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm use >/dev/null
fi

# `next start` serves the last build; build once if there is none
if [[ ! -f .next/BUILD_ID ]]; then
  echo "No build found, building first …"
  pnpm build >> server.log 2>&1
fi

# its own process group, so stop.sh can end pnpm and the Next.js server together
nohup setsid pnpm start >> server.log 2>&1 &
echo $! > "$PID_FILE"
echo "Started (PID $!), log in server.log — http://127.0.0.1:${PORT:-3000}"
