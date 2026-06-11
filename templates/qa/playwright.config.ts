import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Run from the project root: npx playwright test -c qa/playwright.config.ts
const cfg = JSON.parse(readFileSync('qa/qa.config.json', 'utf8'));
const target = cfg.targets[cfg.defaultTarget] ?? cfg.targets.local;
const baseURL = process.env.QA_BASE_URL ?? target.url;
const hasAuth = !!cfg.auth?.mode && cfg.auth.mode !== 'none';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['./qa-reporter.mjs']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    ...(hasAuth ? [{ name: 'setup', testMatch: /.*\.setup\.ts/ }] : []),
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(hasAuth ? { storageState: 'qa/.auth/user.json' } : {}),
      },
      ...(hasAuth ? { dependencies: ['setup'] } : {}),
      testIgnore: /.*\.setup\.ts/,
    },
    {
      name: 'mobile-iphone-14',
      use: {
        ...devices['iPhone 14'],
        ...(hasAuth ? { storageState: 'qa/.auth/user.json' } : {}),
      },
      ...(hasAuth ? { dependencies: ['setup'] } : {}),
      testIgnore: /.*\.setup\.ts/,
    },
  ],
  webServer: process.env.QA_BASE_URL || !target.command ? undefined : {
    command: target.command,
    url: target.url,
    reuseExistingServer: true,
    timeout: (target.readyTimeout ?? 120) * 1000,
  },
});
