---
name: qa-core
description: Shared conventions for the qa plugin — findings schema, evidence rule, run directory layout, browser session protocol, teardown. Loaded by other qa skills and agents; never invoked directly by users.
user-invocable: false
---

# qa plugin core conventions

## Run directory

Every run gets `qa/runs/<RUN_ID>/` where `RUN_ID = RUN-$(date +%Y%m%d-%H%M%S)`:

- `run.json` — `{ runId, target, startedAt, routes }` written by the orchestrator at start
- `raw/<worker-id>.json` — each worker's findings array (schema below)
- `coverage/<worker-id>.json` — `{ "routesVisited": [..], "working": ["plain-language things that worked"] }`
- `findings.json` — merged + verified findings (written by the merge script, updated by verifier and fix loop)
- `*.png`, `*.webm` — evidence screenshots / optional videos
- `report.html` — self-contained report

## Findings schema (every producer emits this; every consumer reads it)

```json
{
  "id": "<RUN_ID>-<worker-id>-NNN",
  "source": "explore | test | audit-a11y | audit-perf | audit-links | audit-seo | audit-design | visual",
  "severity": "critical | high | medium | low | info",
  "title": "short, specific, user-impact phrased",
  "url": "/route",
  "viewport": "desktop | iphone-14 | ...",
  "repro": ["step", "step", "observe: symptom"],
  "codeRef": "src/file.tsx:42",
  "evidence": { "screenshot": "<relative to run dir>", "console": ["..."], "network": [{ "url": "...", "status": 500 }] },
  "verified": false,
  "status": "open"
}
```

Exactly one of `repro` (behavioral) / `codeRef` (code-level) per finding.

**Evidence rule (non-negotiable):** a finding missing its screenshot, or missing exactly-one-of repro/codeRef, is discarded by the merge script. Take the screenshot at the moment the bug is visible.

**Severity guide:** critical = data loss / payment / app unusable · high = core flow broken · medium = feature broken with workaround · low = cosmetic/minor · info = observation.

## Browser sessions (playwright-cli)

- Resolve the binary once: `PWCLI=$(${CLAUDE_PLUGIN_ROOT}/scripts/ensure-playwright.sh)`.
- One named session per worker: pass `-s=<session>` on EVERY command — sessions are isolated browsers. Naming: `qa-<RUN_ID>-<role>-<n>` (e.g. `qa-RUN-20260611-103000-explorer-1`).
- Element refs (`e15`) come from the freshest snapshot; they go stale after navigation — re-snapshot.
- Headless is the default; only use `--headed` for human login capture.
- **Teardown:** the orchestrator (never workers) runs `"$PWCLI" close-all` at the end of every run, including after failures.

## Human-behavior rules (workers)

Before any click/type: `highlight <ref> --style="outline: 3px solid #e85d26"`, `mousemove` toward it, `sleep 1`. After navigation: scroll the page in 2–3 `mousewheel` increments with ~1s pauses (triggers lazy-load and reveals layout bugs). Test like a stubborn human: empty submits, double clicks, Enter/Escape/Tab, back button.

## Scripts

- Merge raw findings → `node ${CLAUDE_PLUGIN_ROOT}/scripts/findings.mjs merge <runDir>` — refuses to overwrite an existing `findings.json` (protects verifier/fix-loop state); add `--force` only when intentionally re-merging from raw
- Render report → `node ${CLAUDE_PLUGIN_ROOT}/scripts/render-report.mjs <runDir>`
