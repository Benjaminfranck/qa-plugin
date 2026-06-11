---
name: full
description: Use when the user wants the complete QA pipeline in one shot — "full QA run", "run everything", "QA the app before release", "complete check", "/qa:full". Runs explore + audits + visual check + suite in parallel, merges everything into one verified report, then drives the fix loop.
argument-hint: "[target] [--no-fix]"
---

Config: !`cat qa/qa.config.json 2>/dev/null || echo "NOT_CONFIGURED"`
Suite: !`ls qa/tests/*.spec.ts 2>/dev/null | head -3 || echo "NO_SUITE"`
Baselines: !`ls qa/visual-baselines 2>/dev/null | head -3 || echo "NO_BASELINES"`

Read `${CLAUDE_PLUGIN_ROOT}/skills/qa-core/SKILL.md` first. NOT_CONFIGURED ⇒ suggest `/qa:init`. You are the orchestrator of orchestrators — one RUN_DIR, four parallel streams, one report, one fix loop.

## 1. Pre-flight (once)

- `PWCLI=$(${CLAUDE_PLUGIN_ROOT}/scripts/ensure-playwright.sh)`; `${CLAUDE_PLUGIN_ROOT}/scripts/ensure-audit-deps.sh`
- Target resolution + up-check + auth probe (as /qa:explore). ABORT before spawning anything if it fails.
- `RUN_ID=RUN-$(date +%Y%m%d-%H%M%S)-full`; `RUN_DIR=qa/runs/$RUN_ID`; mkdir raw/ coverage/; write run.json.

## 2. Fan out — everything in parallel

Launch ALL of these concurrently (agents in ONE message; scripts as background Bash):

- **Explore fleet** (per /qa:explore steps 3–4, same dispatch template, same RUN_DIR): explorer group(s) + mobile-tester + breaker.
- **Audit scripts**: `node ${CLAUDE_PLUGIN_ROOT}/scripts/audit.mjs $RUN_DIR <url> <dim> <routes,csv>` for a11y, perf, seo, links (4 background calls).
- **Visual**: if baselines exist, `node ${CLAUDE_PLUGIN_ROOT}/scripts/visual.mjs check qa/visual-baselines $RUN_DIR <url> <routes,csv> <viewports,csv> --masks=... --maxDiffRatio=...`; if NO_BASELINES, capture them instead (graceful degradation — note it).
- **Suite**: if specs exist, `npx playwright test -c qa/playwright.config.ts` (background). Its reporter writes its OWN run dir; after it finishes, move that run's `raw/suite.json` into `$RUN_DIR/raw/` and its `coverage/suite.json` into `$RUN_DIR/coverage/` (adjust the copied findings' screenshot paths by copying the referenced PNGs into $RUN_DIR too).
- **Design dim**: if impeccable available, dispatch `qa:auditor` (as /qa:audit step 3) into the same RUN_DIR.

Wait for everything. A dead stream = explicit coverage-gap note, never silence.

## 3. Merge, verify, report

- `node ${CLAUDE_PLUGIN_ROOT}/scripts/findings.mjs merge $RUN_DIR --trust-verified` (scripts/suite arrive verified; agent findings arrive unverified).
- Dispatch `qa:verifier` for the findings with `verified: false` (fresh session `qa-$RUN_ID-verify`).
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/render-report.mjs $RUN_DIR`; open it; `"$PWCLI" close-all`.
- Summary table: findings by source × severity, coverage per stream, gaps.

## 4. Fix loop

`--no-fix` ⇒ stop at the report. Otherwise: ONE batch-approval gate ("fix everything ≥ <severity>? or pick") then run the /qa:fix loop (read `${CLAUDE_PLUGIN_ROOT}/skills/fix/SKILL.md` and follow its per-finding cycle against $RUN_DIR/findings.json). End with the final status table.
