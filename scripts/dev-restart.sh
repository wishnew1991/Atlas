#!/usr/bin/env bash
# Restart the Atlas dev server cleanly.
#
# WHY THIS EXISTS:
#   `npm run dev` runs `predev` -> `rm -rf .next`, which DELETES the live
#   server's compiled chunks. If any `next dev`/`next-server` is still running
#   from a previous session, that orphan keeps serving from a deleted/corrupt
#   `.next` (pages 500 with "Cannot find module './vendor-chunks/@better-auth.js'").
#
#   Always use `npm run dev:restart` instead of `npm run dev` when you might
#   already have a dev server running.
set -euo pipefail

# 1. Kill every dev-server process owned by this repo (parent `next` + children).
bash scripts/stop-dev.sh

# 2. Wipe the incremental cache (a torn .next is what causes the 500s).
rm -rf .next .turbo

# 3. Start a single, clean dev server in the foreground (predev then handles
#    migrations/seed and its own clean wipe safely).
exec npm run dev
