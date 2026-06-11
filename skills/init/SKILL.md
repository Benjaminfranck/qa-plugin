---
name: init
description: Use when onboarding a project into the QA framework — the user asks to "set up QA", "install the qa framework here", "configure qa", or another qa skill reports NOT_CONFIGURED. Detects the stack, builds a route map, interviews for flows and auth, and scaffolds qa/ with qa.config.json.
disable-model-invocation: true
argument-hint: "[base-url]"
---

Current config: !`cat qa/qa.config.json 2>/dev/null || echo "NOT_CONFIGURED"`

Read `${CLAUDE_PLUGIN_ROOT}/skills/qa-core/SKILL.md` first for shared conventions.

If config exists above, you are RE-running init: load it, tell the user what's configured, and ask what to update — never wipe their flows/ignore lists.

## Steps

1. **Detect the stack.** Read `package.json` (scripts, deps), lockfile (pnpm/yarn/npm), framework configs (`next.config.*`, `vite.config.*`, `astro.config.*`, etc.). Derive: project name, dev command, default port (Next 3000, Vite 5173, Astro 4321 — verify against the dev script's flags). No package.json ⇒ ask the user what serves the app.
2. **Confirm targets.** Present detected local command + URL ($ARGUMENTS overrides URL). Ask (AskUserQuestion) whether to add staging/prod URLs.
3. **Build the route map.** If the local target responds (`curl -s -o /dev/null -w "%{http_code}" <url>` = 2xx/3xx):
   - Try `<url>/sitemap.xml` first; parse same-origin paths.
   - Else: `PWCLI=$(${CLAUDE_PLUGIN_ROOT}/scripts/ensure-playwright.sh)`, then `"$PWCLI" -s=qa-init open <url>` and `"$PWCLI" -s=qa-init eval "JSON.stringify([...new Set([...document.querySelectorAll('a[href]')].map(a=>new URL(a.href,location.href)).filter(u=>u.origin===location.origin).map(u=>u.pathname))])"` — repeat one level deep on discovered pages (cap: 25 routes), then `"$PWCLI" close-all`.
   - Target down ⇒ ask the user for routes.
   Show the route list; let the user prune/add.
4. **Interview for flows.** Ask for the 1–3 user journeys that must never break (name + plain-language description + critical flag). Skippable.
5. **Auth.** Ask: none / app login form / OAuth-SSO. For app login: record loginUrl + env var names (NEVER store credential values). For both auth modes, offer the one-time headed capture: `"$PWCLI" -s=qa-auth open <loginUrl> --headed` → user logs in manually → `"$PWCLI" -s=qa-auth state-save qa/.auth/user.json` → `"$PWCLI" close-all` → set `auth.mode` to `storageState` (form) or `headed-manual` (OAuth), `stateFile: "qa/.auth/user.json"`.
6. **Impeccable hook.** If the impeccable plugin is available in this session and the project lacks `PRODUCT.md`, mention that running `/impeccable teach` will unlock design audits in Phase 3 (don't run it yourself).
7. **Scaffold (confirm first).** Show the exact `qa/qa.config.json` (from `${CLAUDE_PLUGIN_ROOT}/templates/qa/qa.config.json`, tokens filled, plus interview answers) and `qa/.gitignore` (from `templates/qa/gitignore`). On user confirmation ONLY: write both, and append `.playwright-cli/` to the project's root `.gitignore` (create it if missing; append, never clobber — playwright-cli writes session logs into the cwd). Never overwrite an existing file without showing a diff and getting explicit approval.
8. **Wrap up.** Suggest committing `qa/`, then `/qa:explore` for a first run.
