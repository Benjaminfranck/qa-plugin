---
name: status
description: Use when the user asks how QA stands — "qa status", "any open findings?", "when did we last test?", "/qa:status". Quick read-only digest of runs, open findings, and suite health.
argument-hint: ""
---

Config: !`cat qa/qa.config.json 2>/dev/null || echo "NOT_CONFIGURED"`
Runs: !`ls -1t qa/runs 2>/dev/null | head -5 || echo "NO_RUNS"`
Suite: !`ls qa/tests/*.spec.ts 2>/dev/null | head -10 || echo "NO_SUITE"`

NOT_CONFIGURED ⇒ suggest `/qa:init`. Otherwise build the digest READ-ONLY (no browsers, no test runs):

1. Latest run: parse its `findings.json` — counts by status and severity, verified ratio, run age (from run.json startedAt).
2. Open findings across the LATEST run only (older runs are history, mention their count but don't aggregate statuses across runs).
3. Suite: spec count and last `-suite` run result if one exists.
4. Output a compact digest: last run (age, type, findings open/fixed), top 3 open by severity, suite state, and ONE suggested next action (/qa:explore if stale > 7 days, /qa:fix if open criticals, /qa:test heal if suite red, otherwise "healthy").
