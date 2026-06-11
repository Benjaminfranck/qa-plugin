---
name: visual
description: Use when the user wants visual regression — "take visual baselines", "did the UI change?", "visual diff", "check the screenshots", "/qa:visual". Captures per-route × viewport baselines and pixel-compares later runs against them.
argument-hint: "[baseline|check] [target]"
---

Config: !`cat qa/qa.config.json 2>/dev/null || echo "NOT_CONFIGURED"`
Baselines: !`ls qa/visual-baselines 2>/dev/null | head -5 || echo "NO_BASELINES"`

Read `${CLAUDE_PLUGIN_ROOT}/skills/qa-core/SKILL.md` first. NOT_CONFIGURED ⇒ suggest `/qa:init`. Baselines live in `qa/visual-baselines/` (committed to git — they ARE the approved state).

Pre-flight for both modes: `${CLAUDE_PLUGIN_ROOT}/scripts/ensure-audit-deps.sh`; target up (as /qa:explore); build `--masks=` from config `visual.mask` (comma-joined) and `--maxDiffRatio=` from `visual.maxDiffPixelRatio`.

## baseline

1. If baselines exist, warn: re-baselining declares the CURRENT UI as the approved state — confirm first.
2. `node ${CLAUDE_PLUGIN_ROOT}/scripts/visual.mjs baseline qa/visual-baselines <targetUrl> <routes,csv> <viewports,csv> --masks=...`
3. Suggest committing `qa/visual-baselines/`.

## check

1. NO_BASELINES ⇒ offer to capture them instead (that's a `baseline` run), then stop.
2. `RUN_ID=RUN-$(date +%Y%m%d-%H%M%S)-visual`; `RUN_DIR=qa/runs/$RUN_ID`; write run.json.
3. `node ${CLAUDE_PLUGIN_ROOT}/scripts/visual.mjs check qa/visual-baselines $RUN_DIR <targetUrl> <routes,csv> <viewports,csv> --masks=... --maxDiffRatio=...`
4. `node ${CLAUDE_PLUGIN_ROOT}/scripts/findings.mjs merge $RUN_DIR --trust-verified` then render the report.
5. For each diff finding, show the diff image path and ask: **regression** (keep finding open → /qa:fix) or **intended change** (update that baseline: copy `$RUN_DIR/visual/<file>` over `qa/visual-baselines/<file>`, mark the finding `wont-fix` with note "intended change, baseline updated"). Batch-answerable.
