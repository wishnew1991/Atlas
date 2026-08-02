#!/bin/bash
# Fetches the active LLM config from Atlas's admin panel (/api/admin/llm-config).
# No API keys or model IDs in this script — configure in /admin → Providers.
set -e

CONFIG_DIR="${TMPDIR:-/tmp}/browser-use-$$"
mkdir -p "$CONFIG_DIR"

# Fetch config from Atlas (same port Atlas runs on)
ATLAS_URL="http://localhost:3000/api/admin/llm-config"
LLM_JSON=$(curl -sf "$ATLAS_URL" 2>/dev/null || echo "{}")

API_KEY=$(echo "$LLM_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('api_key',''))" 2>/dev/null)
BASE_URL=$(echo "$LLM_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('base_url','https://api.openai.com/v1'))" 2>/dev/null)
MODEL=$(echo "$LLM_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('model','gpt-4.1-mini'))" 2>/dev/null)

[ -z "$API_KEY" ] && { echo "[browser-use] No model configured in Atlas admin (/admin → Providers)."; exit 1; }

cat > "$CONFIG_DIR/config.json" <<JSON
{
  "llm": {
    "api_key": "${API_KEY}",
    "base_url": "${BASE_URL}",
    "model": "${MODEL}"
  }
}
JSON

export BROWSER_USE_CONFIG_PATH="$CONFIG_DIR/config.json"
exec /Users/vishnuvardhan/Desktop/image-feed/browser-use-venv/bin/browser-use --mcp
