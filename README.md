# qa — a Claude Code QA plugin

Playwright-based QA automation, reusable across projects. Spec: `docs/superpowers/specs/2026-06-11-qa-framework-design.md`.

## Commands (Phase 1)
- `/qa:init` — onboard a project (scaffolds `qa/` + `qa.config.json`)
- `/qa:explore` — parallel exploratory QA session → verified findings → HTML report
- `/qa:report` — render/open the report for a run
- `/qa:fix` — fix findings, re-verify each one until green

## Dev
- `npm test` — script unit tests
- `npm run demo` — fixture site with planted bugs at http://localhost:4173
- `claude plugin validate .` — plugin structure check
- Try locally: `claude --plugin-dir .`
