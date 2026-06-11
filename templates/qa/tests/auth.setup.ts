import { test as setup, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('qa/qa.config.json', 'utf8'));
const authFile = 'qa/.auth/user.json';

setup('authenticate', async ({ page }) => {
  if (cfg.auth?.mode === 'headed-manual') {
    // OAuth/SSO: state was captured manually via /qa:init; just assert it exists.
    expect(existsSync(authFile), 'run /qa:init auth capture first').toBeTruthy();
    return;
  }
  const user = process.env[cfg.auth?.credsEnv?.[0] ?? 'QA_USER'];
  const pass = process.env[cfg.auth?.credsEnv?.[1] ?? 'QA_PASS'];
  expect(user, 'auth env vars missing').toBeTruthy();
  await page.goto(cfg.auth.loginUrl);
  await page.getByLabel(/email|user/i).fill(user!);
  await page.getByLabel(/password/i).fill(pass!);
  await page.getByRole('button', { name: /log ?in|sign ?in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes(cfg.auth.loginUrl));
  await page.context().storageState({ path: authFile });
});
