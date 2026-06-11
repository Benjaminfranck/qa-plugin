#!/usr/bin/env bash
set -euo pipefail
PIN="0.1.14"
DATA="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/qa}"
BIN="$DATA/node_modules/.bin/playwright-cli"
mkdir -p "$DATA"
if [ ! -x "$BIN" ] || ! "$BIN" --version 2>/dev/null | grep -q "$PIN"; then
  echo "installing @playwright/cli@$PIN into $DATA ..." >&2
  # anchor npm here — without a package.json npm walks up and installs elsewhere
  [ -f "$DATA/package.json" ] || printf '{"name":"qa-plugin-data","private":true}\n' > "$DATA/package.json"
  ( cd "$DATA" && npm install --no-fund --no-audit --silent "@playwright/cli@$PIN" ) >&2
  # browsers land in the shared ms-playwright cache
  ( cd "$DATA" && npx --yes playwright install chromium ) >&2 || true
fi
echo "$BIN"
