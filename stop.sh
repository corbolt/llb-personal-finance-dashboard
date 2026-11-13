#!/usr/bin/env bash
# Stops the server started with ./start.sh.
set -euo pipefail
cd "$(dirname "$0")"

PID_FILE=server.pid

if [[ ! -f $PID_FILE ]]; then
  echo "Not running (no $PID_FILE)."
  exit 0
fi

PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
  # the whole process group: pnpm and the Next.js server below it
  kill -- "-$PID" 2>/dev/null || kill "$PID"
  for _ in $(seq 1 20); do
    kill -0 "$PID" 2>/dev/null || break
    sleep 0.25
  done
  echo "Stopped (PID $PID)."
else
  echo "Not running (stale PID $PID)."
fi
rm -f "$PID_FILE"
