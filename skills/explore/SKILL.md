---
name: explore
description: Use when the user wants an exploratory QA session — "test my app", "QA this site", "run a QA session", "find bugs on <url>", "check the app before deploy". Fans out parallel black-box browser agents, verifies findings, and produces an HTML report.
argument-hint: "[target] [--video] [--focus=area]"
---

Project config: !`cat qa/qa.config.json 2>/dev/null || echo "NOT_CONFIGURED"`

Read `${CLAUDE_PLUGIN_ROOT}/skills/qa-core/SKILL.md` first for shared conventions. You are the ORCHESTRATOR: you plan, dispatch, merge, verify, report. You do not browse the app yourself.

If config is NOT_CONFIGURED: stop and suggest `/qa:init`. (Exception: $ARGUMENTS contains a URL ⇒ run a config-less session against it with routes discovered from the homepage, defaults for everything else.)

## 1. Pre-flight (cheap checks before any subagent)

- `PWCLI=$(${CLAUDE_PLUGIN_ROOT}/scripts/ensure-playwright.sh)`
- Resolve target: $ARGUMENTS names a target key or URL, else `defaultTarget`. For `local` targets: `curl -s -o /dev/null -w "%{http_code}" <url>` — if down and a `command` is configured, start it in the background (Bash run_in_background), poll the URL up to `readyTimeout` seconds; still down ⇒ ABORT with a clear message.
- Auth probe (if `auth.mode` ≠ `none`): `"$PWCLI" -s=qa-preflight state-load <stateFile>`, `goto` the first non-public route, snapshot — redirected to `loginUrl` ⇒ ABORT: "auth state expired — re-run /qa:init step 5", then `"$PWCLI" close-all`. Missing stateFile ⇒ same abort.

## 2. Set up the run

- `RUN_ID=RUN-$(date +%Y%m%d-%H%M%S)`; `RUN_DIR=qa/runs/$RUN_ID`; `mkdir -p $RUN_DIR/raw $RUN_DIR/coverage`
- Write `$RUN_DIR/run.json`: `{ "runId", "target": <url>, "startedAt": <ISO date>, "routes": [...] }`

## 3. Plan territories

Split config `routes` into 1–3 groups by URL prefix/section (≤3 explorers; 1 explorer if ≤4 routes). `--focus=<area>` ⇒ only matching routes. The mobile-tester gets: home + nav + routes of `critical` flows.

## 4. Dispatch workers — ALL in ONE message (parallel)

One Agent call per explorer group (`qa:explorer`) + one for `qa:mobile-tester`. Dispatch prompt template (fill every placeholder):

```
Test this app. Parameters:
- PWCLI: <absolute path from step 1>
- SESSION: qa-<RUN_ID>-<worker-id>
- TARGET: <target url>
- ROUTES: <list>
- RUN_DIR: <absolute path to $RUN_DIR>
- WORKER_ID: <explorer-1 | explorer-2 | mobile-1>
- RUN_ID: <RUN_ID>
- FLOWS: <relevant flows from config, with descriptions>
- IGNORE: <ignore rules from config>
<if auth configured>: First run `"$PWCLI" -s=$SESSION state-load <abs stateFile>` before opening any page.
<if --video>: After opening, run `"$PWCLI" -s=$SESSION video-start $RUN_DIR/$WORKER_ID.webm` and emit `video-chapter "<route>"` when starting each route; `video-stop` before finishing.
Follow your agent instructions for behavior and output contract.
```

## 5. Merge (evidence rule enforced here)

`node ${CLAUDE_PLUGIN_ROOT}/scripts/findings.mjs merge $RUN_DIR` — report dropped findings honestly. A worker that returned no `raw/` file = a coverage gap: note its routes as NOT covered in your summary; never pretend.

## 6. Verify

If findings > 0, dispatch `qa:verifier` (sequential, after merge):

```
Verify the findings of run <RUN_ID>.
- PWCLI: <path> · SESSION: qa-<RUN_ID>-verify · TARGET: <url> · RUN_DIR: <abs path>
<if auth configured>: state-load <stateFile> into your session first.
Follow your agent instructions.
```

## 7. Report, teardown, summary

- `node ${CLAUDE_PLUGIN_ROOT}/scripts/render-report.mjs $RUN_DIR` then `open $RUN_DIR/report.html`
- ALWAYS `"$PWCLI" close-all` — even after aborts/failures.
- Final message: findings table (severity · title · url · verified), coverage (routes tested / gaps), dropped count, report path. Offer `/qa:fix` if open findings exist.
