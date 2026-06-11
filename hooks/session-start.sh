#!/usr/bin/env bash
set -euo pipefail
proj="${CLAUDE_PROJECT_DIR:-$PWD}"
if [ -f "$proj/qa/qa.config.json" ]; then
  cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"This project is QA-enabled (qa/qa.config.json present). Use the /qa:* skills for QA work: /qa:explore (exploratory session), /qa:fix (fix findings), /qa:report (render report), /qa:init (reconfigure)."}}
EOF
fi
exit 0
