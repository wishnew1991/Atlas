#!/usr/bin/env bash
# Stop every Atlas dev server owned by this repo.
#
# WHY THIS EXISTS:
#   `predev` wipes `.next`, and wiping `.next` underneath a LIVE dev server
#   corrupts it (CSS 404 / missing vendor chunks). Leaving orphan `next dev` /
#   `next-server` processes around while running `npm run dev` again is exactly
#   how that happens. This script kills ALL of them first so the wipe is safe.
set -euo pipefail

PIDS=$(pgrep -f "image-feed/(node_modules/.bin/next|node_modules/next/dist)" || true)
if [ -n "$PIDS" ]; then
  # shellcheck disable=SC2086
  kill -9 $PIDS 2>/dev/null || true
fi

PORT_PIDS=$(lsof -ti tcp:3000 2>/dev/null || true)
for pid in $PORT_PIDS; do
  CMD=$(ps -p "$pid" -o command= 2>/dev/null || true)
  case "$CMD" in
    *image-feed*|*next-server*)
      kill -9 "$pid" 2>/dev/null || true
      ;;
  esac
done

sleep 1