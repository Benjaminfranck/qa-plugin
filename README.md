# qa — a Claude Code QA plugin

Playwright-based QA automation, reusable across projects. Install the plugin once; onboard any project with `/qa:init`. Spec: `docs/superpowers/specs/2026-06-11-qa-framework-design.md`. All three build phases validated against the fixture pilot (see `docs/superpowers/plans/*-phase-{1,2,3}.md` DoD results).

## Commands

| Command | What it does |
|---|---|
| `/qa:init` | Onboard a project: detect stack, crawl routes, interview for flows/auth, scaffold `qa/` + `qa.config.json`; optional persistent-suite setup and headed auth capture |
| `/qa:explore [target] [--video]` | Parallel exploratory session: explorer(s) + mobile-tester + breaker agents in isolated browsers → evidence-backed findings → verifier gate → HTML report |
| `/qa:test [generate\|run\|heal] [flow]` | Persistent suites: generate specs from flows (selectors verified live), run them through the findings pipeline, heal stale tests with an honest stale-vs-bug verdict |
| `/qa:audit [a11y\|perf\|links\|seo\|design\|all]` | Deterministic audit scripts (axe-core, web vitals, link/asset sweep, SEO checks) + impeccable design dimension when available |
| `/qa:visual [baseline\|check]` | Visual regression: per-route × viewport baselines, pixelmatch diffs, regression-vs-intended triage |
| `/qa:full [target] [--no-fix]` | Everything above in parallel into one unified, verified report — then the fix loop |
| `/qa:fix [run-id]` | Fix loop: reproduce-first → minimal fix → re-verify by replaying the finding's own repro (max 3 attempts, then blocked + diagnosis) |
| `/qa:report [run-id]` | Render/open the self-contained HTML report for any run |
| `/qa:status` | Read-only digest: last run, open findings, suite health, suggested next action |

## How it works

- **Findings schema** (`skills/qa-core`): every producer — agent, audit script, suite reporter, visual diff — emits the same shape; every consumer (verifier, fix loop, report) reads it. The **evidence rule** discards any finding without a screenshot + repro/codeRef before it can reach a report.
- **Verifier gate**: agent-claimed findings are independently reproduced in a fresh browser before reporting; deterministic script/suite findings carry machine evidence (`merge --trust-verified`).
- **Browser layer**: `@playwright/cli` (pinned) for agent sessions; the playwright library + axe-core/pixelmatch for scripts; everything installs into `${CLAUDE_PLUGIN_DATA}` — host projects stay clean.

## Dev

- `npm test` — 29 unit/integration tests (findings, reporter, renderer, audits vs fixture site, visual compare)
- `npm run demo` — fixture site with 8 planted bugs at http://localhost:4173 (`PORT=` to override); ground truth in `fixtures/demo-site/BUGS.md`
- `claude plugin validate .` — plugin structure check
- Try locally: `claude --plugin-dir .`
