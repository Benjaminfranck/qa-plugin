import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

export type CapturedEvent = {
  kind: 'console' | 'pageerror' | 'requestfailed' | 'http-error';
  level?: string;
  text?: string;
  url?: string;
  method?: string;
  status?: number;
};

function ignoreMatchers(): string[] {
  try {
    const cfg = JSON.parse(readFileSync('qa/qa.config.json', 'utf8'));
    // crude glob → substring: "**/analytics/**" matches any url containing "analytics"
    return (cfg.ignore?.urls ?? []).map((p: string) => p.replaceAll('*', ''));
  } catch {
    return [];
  }
}

export const test = base.extend<{ qaEvents: CapturedEvent[] }>({
  qaEvents: [
    async ({ page }, use, testInfo) => {
      const events: CapturedEvent[] = [];
      const ignores = ignoreMatchers();
      const ignored = (u: string) => ignores.some(frag => frag && u.includes(frag));

      page.on('console', (msg) => {
        if (['error', 'warning'].includes(msg.type())) {
          events.push({ kind: 'console', level: msg.type(), text: msg.text() });
        }
      });
      page.on('pageerror', (err) => events.push({ kind: 'pageerror', text: err.message }));
      page.on('requestfailed', (req) => {
        if (!ignored(req.url())) {
          events.push({ kind: 'requestfailed', url: req.url(), method: req.method(), text: req.failure()?.errorText ?? '' });
        }
      });
      page.on('response', (res) => {
        if (res.status() >= 400 && !ignored(res.url())) {
          events.push({ kind: 'http-error', url: res.url(), status: res.status() });
        }
      });

      await use(events);

      if (events.length) {
        const shot = testInfo.outputPath('qa-evidence.png');
        try { await page.screenshot({ path: shot }); } catch { /* page may be closed */ }
        await testInfo.attach('qa-findings', {
          body: JSON.stringify(events),
          contentType: 'application/json',
        });
        try { await testInfo.attach('qa-evidence', { path: shot, contentType: 'image/png' }); } catch { /* no shot */ }
      }
    },
    { auto: true },
  ],
});

export { expect };
