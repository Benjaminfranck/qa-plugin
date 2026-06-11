---
name: test
description: Use when the user wants persistent Playwright suites — "generate a test for X", "run the QA suite", "run the regression tests", "heal the failing tests", "/qa:test". Generates specs from flows (selectors verified live), runs the suite through the findings pipeline, and heals stale tests.
argument-hint: "[generate|run|heal] [flow-or-spec]"
---

Config: !`cat qa/qa.config.json 2>/dev/null || echo "NOT_CONFIGURED"`
Suite: !`ls qa/playwright.config.ts qa/tests/*.spec.ts 2>/dev/null || echo "NO_SUITE"`

Read `${CLAUDE_PLUGIN_ROOT}/skills/qa-core/SKILL.md` first. NOT_CONFIGURED ⇒ suggest `/qa:init`.

NO_SUITE (config exists but no qa/playwright.config.ts): offer the suite setup from /qa:init step 7 (devDependency `@playwright/test`, `npx playwright install chromium`, copy `playwright.config.ts` + `fixtures/index.ts` + `qa-reporter.mjs` from `${CLAUDE_PLUGIN_ROOT}/templates/qa/`, plus `tests/auth.setup.ts` when auth ≠ none) — with user confirmation — then continue.

All suite commands run FROM THE PROJECT ROOT: `npx playwright test -c qa/playwright.config.ts`.

## generate [flow]

1. Pick the flow from config `flows` ($ARGUMENTS fuzzy-match; no match ⇒ list flows, ask). Ensure the target is up (same pre-flight as /qa:explore).
2. `PWCLI=$(${CLAUDE_PLUGIN_ROOT}/scripts/ensure-playwright.sh)`; dispatch the `qa:test-writer` agent (RUN_MODE: generate) with: PWCLI, SESSION `qa-testwriter-<flow>`, TARGET, the flow object, RUN_CMD. It walks the app live, writes `qa/tests/<flow>.spec.ts`, and proves it green.
3. On success: show the spec, suggest committing it. Teardown: `"$PWCLI" close-all`.

## run

1. Pre-flight target (webServer can also autostart it — prefer attaching to a running server).
2. `npx playwright test -c qa/playwright.config.ts` ($ARGUMENTS may add `-g <filter>` or `--project=<name>`).
3. The qa-reporter wrote `qa/runs/RUN-<ts>-suite/raw/suite.json`. Finish the pipeline: `node ${CLAUDE_PLUGIN_ROOT}/scripts/findings.mjs merge <that run dir> --trust-verified` (suite evidence is deterministic — this flag is reserved for suite runs; never use it on agent-produced raw findings) then `node ${CLAUDE_PLUGIN_ROOT}/scripts/render-report.mjs <that run dir>`.
4. Summarize: pass/fail counts, findings by severity, report path. Failures ⇒ offer `/qa:test heal` (stale tests) or `/qa:fix` (app bugs).

## heal [spec]

1. Identify failing specs: $ARGUMENTS or re-run the suite and collect failures.
2. Target up; `PWCLI=$(...)`; per failing spec, dispatch `qa:test-writer` (RUN_MODE: heal) with the spec path, the failure output, PWCLI, SESSION `qa-heal-<spec>`, TARGET, RUN_CMD.
3. Report per spec: healed (stale) — show the diff and suggest committing — or app bug (left red, route to /qa:fix). Teardown: `"$PWCLI" close-all`.
