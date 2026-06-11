#!/usr/bin/env bash
set -euo pipefail
DATA="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/qa}"
mkdir -p "$DATA"
[ -f "$DATA/package.json" ] || echo '{"name":"qa-plugin-data","private":true}' > "$DATA/package.json"
need=""
for pkg in playwright axe-core pixelmatch pngjs; do
  [ -d "$DATA/node_modules/$pkg" ] || need="$need $pkg"
done
if [ -n "$need" ]; then
  echo "installing$need into $DATA ..." >&2
  ( cd "$DATA" && npm install --no-fund --no-audit --silent $need ) >&2
fi
# chromium is shared with @playwright/cli via the ms-playwright cache
( cd "$DATA" && npx --yes playwright install chromium ) >&2 || true
echo "$DATA"
