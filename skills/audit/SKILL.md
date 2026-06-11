---
name: audit
description: Use when the user wants specialized audits — "audit accessibility", "check performance", "find broken links", "SEO check", "design review the app", "/qa:audit". Runs a11y/perf/seo/links as deterministic scripts in parallel, plus the impeccable design dimension when available.
argument-hint: "[a11y|perf|links|seo|design|all] [target]"
---

Config: !`cat qa/qa.config.json 2>/dev/null || echo "NOT_CONFIGURED"`

Read `${CLAUDE_PLUGIN_ROOT}/skills/qa-core/SKILL.md` first. NOT_CONFIGURED ⇒ suggest `/qa:init`. You are the orchestrator.

Dimensions: parse from $ARGUMENTS (default `all` = a11y, perf, seo, links, design).

## 1. Pre-flight

- `DATA=$(${CLAUDE_PLUGIN_ROOT}/scripts/ensure-audit-deps.sh)` (installs playwright/axe/pixelmatch into plugin data on first use).
- Resolve target + ensure it's up (same as /qa:explore pre-flight, incl. auth probe when configured).
- `RUN_ID=RUN-$(date +%Y%m%d-%H%M%S)-audit`; `RUN_DIR=qa/runs/$RUN_ID`; mkdir raw/ coverage/; write run.json.

## 2. Script dimensions (a11y, perf, seo, links) — in parallel

Launch each requested script dimension as a background Bash call:
`node ${CLAUDE_PLUGIN_ROOT}/scripts/audit.mjs $RUN_DIR <targetUrl> <dim> <routes,csv>`
Wait for all to complete; report any non-zero exits honestly as coverage gaps.

## 3. Design dimension (impeccable integration — spec §9)

Only when requested. Detect impeccable: is the impeccable skill/CLI available in this session (try `npx impeccable --version` or check for the plugin)? 
- Absent ⇒ skip with an explicit note in the final summary: "design audit skipped — install the impeccable plugin to enable it".
- Present ⇒ `PWCLI=$(${CLAUDE_PLUGIN_ROOT}/scripts/ensure-playwright.sh)`; dispatch the `qa:auditor` agent with RUN_DIR, TARGET, ROUTES, RUN_ID, PWCLI, SESSION `qa-$RUN_ID-design`, and whether PRODUCT.md exists. (If PRODUCT.md is missing, the agent runs the detector only — suggest `/impeccable teach` in the summary.)

## 4. Merge, verify, report

- `node ${CLAUDE_PLUGIN_ROOT}/scripts/findings.mjs merge $RUN_DIR --trust-verified` (script dimensions carry deterministic evidence; agent design findings arrive unverified and stay so).
- If any merged finding has `verified: false` (design dim), dispatch `qa:verifier` for those (same dispatch shape as /qa:explore step 6).
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/render-report.mjs $RUN_DIR`, open it, `"$PWCLI" close-all` if a browser session was used.
- Summary: findings by dimension × severity, dimensions skipped (and why), report path. Offer /qa:fix.
