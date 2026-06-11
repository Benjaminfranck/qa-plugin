---
name: fix
description: Use when the user wants QA findings fixed — "fix the bugs", "fix the findings", "work through the QA report", "/qa:fix". Triages findings, fixes each in source, and re-verifies by replaying the finding's own repro steps until green.
argument-hint: "[run-id] [--batch=severity]"
---

Runs: !`ls -1t qa/runs 2>/dev/null | head -5 || echo "NO_RUNS"`
Config: !`cat qa/qa.config.json 2>/dev/null || echo "NOT_CONFIGURED"`

Read `${CLAUDE_PLUGIN_ROOT}/skills/qa-core/SKILL.md` first. NO_RUNS ⇒ suggest `/qa:explore`.

## 1. Triage

Load `qa/runs/<run-id>/findings.json` ($ARGUMENTS or latest). Candidates: `status: open` and `verified: true`, worst severity first. Findings marked `flaky`: list them, ask whether to attempt. Present the triage table, then get approval: per-bug, or batch (`--batch=high` = everything high+). Zero candidates ⇒ say so, done.

## 2. Pre-flight

Same as /qa:explore: `PWCLI=$(${CLAUDE_PLUGIN_ROOT}/scripts/ensure-playwright.sh)`; ensure the run's target URL is up (start local dev server if configured and down).

## 3. Per finding — the loop (max 3 attempts, then blocked)

1. **Reproduce first.** Fresh session `qa-fix-<finding-id>-a1` (the attempt suffix is what makes each verification session fresh — a reused session carries stale console errors that corrupt the "no NEW errors" check); resize to the finding's viewport if not desktop; replay `repro` exactly; confirm the symptom (console/network/UI per evidence). Gone already ⇒ `status: fixed`, `verifierNote: "no longer reproducible"`, next.
2. **Locate.** NOW you may read source: map the symptom to code via stack traces in `evidence.console`, failing URLs in `evidence.network`, the route, and grep. State your root-cause hypothesis in one sentence before editing.
3. **Fix.** Minimal change in the project's existing style. No drive-by refactors. (If the superpowers test-driven-development skill is available and the project has a test setup, write the failing unit test first where it makes sense.)
4. **Re-verify.** Reload/restart as the stack requires (note: dev servers usually hot-reload; a static server needs restart). Fresh session `qa-fix-<finding-id>-a<attempt+1>`, replay `repro`: symptom gone AND `console error` shows no NEW errors on that page ⇒ `status: fixed`. Else loop to 2 (≤3 attempts), then `status: blocked` + `verifierNote` with your diagnosis ("needs backend change", "third-party script", ...).
5. **Regression guard.** If `qa/tests/` contains specs matching the route (Phase 2+), run them; a new failure ⇒ your fix broke something: revert or repair before moving on. No specs ⇒ skip silently.
6. Update the finding in `findings.json` (Edit) and commit the code fix: `fix(qa): <finding-id> <title>`.

## 4. Wrap up

`"$PWCLI" close-all`. Re-render: `node ${CLAUDE_PLUGIN_ROOT}/scripts/render-report.mjs <runDir>`. Final summary table: id · title · fixed/blocked/deferred · attempts (`deferred` = declined at triage; set it on those findings so the report reflects the decision). Suggest `/qa:explore` to confirm overall health.
