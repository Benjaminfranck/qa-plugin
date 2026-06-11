---
name: report
description: Use when the user wants to see, regenerate, or open a QA report — "show me the QA report", "open the last run", "regenerate the report for run X".
argument-hint: "[run-id]"
---

Runs: !`ls -1t qa/runs 2>/dev/null | head -10 || echo "NO_RUNS"`

NO_RUNS ⇒ suggest `/qa:explore`.

1. Pick the run: $ARGUMENTS names one (fuzzy-match against the list above), else the most recent.
2. If `qa/runs/<id>/findings.json` is missing but `raw/` has files: `node ${CLAUDE_PLUGIN_ROOT}/scripts/findings.mjs merge qa/runs/<id>` first.
3. `node ${CLAUDE_PLUGIN_ROOT}/scripts/render-report.mjs qa/runs/<id>` then `open qa/runs/<id>/report.html`.
4. Summarize inline: findings by severity, verified count, fixed count, coverage, dropped count.
