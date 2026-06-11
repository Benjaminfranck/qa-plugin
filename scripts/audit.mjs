// Deterministic audit dimensions for the qa plugin.
// Usage: node audit.mjs <runDir> <targetUrl> <a11y|perf|seo|links> <route,route,...>
// Deps (playwright, axe-core) come from CLAUDE_PLUGIN_DATA via ensure-audit-deps.sh.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const DATA = process.env.CLAUDE_PLUGIN_DATA ?? join(process.env.HOME, '.claude', 'plugins', 'data', 'qa');
const req = createRequire(join(DATA, 'package.json'));

const [runDir, target, dimension, routesCsv] = process.argv.slice(2);
if (!runDir || !target || !['a11y', 'perf', 'seo', 'links'].includes(dimension) || !routesCsv) {
  console.error('usage: node audit.mjs <runDir> <targetUrl> <a11y|perf|seo|links> <routes,csv>');
  process.exit(1);
}
const routes = routesCsv.split(',').filter(Boolean);
const SOURCE = `audit-${dimension}`;
const AXE_IMPACT_SEVERITY = { critical: 'high', serious: 'medium', moderate: 'low', minor: 'info' };

mkdirSync(join(runDir, 'raw'), { recursive: true });
mkdirSync(join(runDir, 'coverage'), { recursive: true });

const findings = [];
const working = [];
let shotN = 0;

async function shoot(page) {
  const rel = `${SOURCE}-${String(++shotN).padStart(3, '0')}.png`;
  await page.screenshot({ path: join(runDir, rel) });
  return rel;
}

function addFinding({ severity, title, url, repro, screenshot, console: cons = [], network = [] }) {
  findings.push({
    id: `${SOURCE}-${String(findings.length + 1).padStart(3, '0')}`,
    source: SOURCE, severity, title: title.slice(0, 140), url,
    viewport: 'desktop', repro,
    evidence: { screenshot, console: cons, network },
    verified: true, status: 'open',
  });
}

const dims = {
  async a11y(page, route) {
    const axePath = req.resolve('axe-core/axe.min.js');
    await page.addScriptTag({ path: axePath });
    const results = await page.evaluate(() =>
      // eslint-disable-next-line no-undef
      axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })
    );
    if (!results.violations.length) { working.push(`a11y clean: ${route}`); return; }
    const shot = await shoot(page);
    for (const v of results.violations) {
      addFinding({
        severity: AXE_IMPACT_SEVERITY[v.impact] ?? 'low',
        title: `axe ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length > 1 ? 's' : ''})`,
        url: route,
        repro: [`goto ${route}`, `observe: axe violation ${v.id} on ${JSON.stringify(v.nodes[0]?.target ?? [])} — ${v.helpUrl}`],
        screenshot: shot,
      });
    }
  },

  async perf(page, route) {
    const m = await page.evaluate(() => new Promise((resolve) => {
      let lcp = 0;
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        lcp = entries[entries.length - 1]?.startTime ?? lcp;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      setTimeout(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        resolve({
          ttfb: Math.round(nav.responseStart - nav.requestStart),
          domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
          load: Math.round(nav.loadEventEnd - nav.startTime),
          lcp: Math.round(lcp),
        });
      }, 1500);
    }));
    working.push(`perf ${route}: LCP ${m.lcp}ms · TTFB ${m.ttfb}ms · DCL ${m.domContentLoaded}ms · load ${m.load}ms`);
    if (m.lcp > 2500) addFinding({
      severity: 'medium', title: `Slow LCP on ${route}: ${m.lcp}ms (target ≤ 2500ms)`, url: route,
      repro: [`goto ${route}`, `observe: LCP ${m.lcp}ms via PerformanceObserver`], screenshot: await shoot(page),
    });
    if (m.ttfb > 800) addFinding({
      severity: 'low', title: `Slow TTFB on ${route}: ${m.ttfb}ms (target ≤ 800ms)`, url: route,
      repro: [`goto ${route}`, `observe: TTFB ${m.ttfb}ms via navigation timing`], screenshot: await shoot(page),
    });
  },

  async seo(page, route) {
    const checks = await page.evaluate(() => ({
      title: document.title,
      metaDescription: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
      h1Count: document.querySelectorAll('h1').length,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
      lang: document.documentElement.getAttribute('lang'),
    }));
    const issues = [];
    if (!checks.title) issues.push(['medium', 'missing <title>']);
    else if (checks.title.length > 60) issues.push(['info', `<title> too long (${checks.title.length} chars)`]);
    if (!checks.metaDescription) issues.push(['low', 'missing meta description']);
    if (checks.h1Count !== 1) issues.push(['low', `${checks.h1Count} <h1> elements (want exactly 1)`]);
    if (!checks.canonical) issues.push(['info', 'missing canonical link']);
    if (!checks.lang) issues.push(['low', 'missing <html lang>']);
    if (!issues.length) { working.push(`seo clean: ${route}`); return; }
    const shot = await shoot(page);
    for (const [severity, what] of issues) {
      addFinding({
        severity, title: `SEO ${route}: ${what}`, url: route,
        repro: [`goto ${route}`, `observe: ${what} (inspect <head>)`], screenshot: shot,
      });
    }
  },

  async links(page, route) {
    // trigger lazy-load, then audit images on the page
    await page.evaluate(async () => {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 600));
    });
    const brokenImgs = await page.evaluate(() =>
      [...document.querySelectorAll('img')].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src)
    );
    const hrefs = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll('a[href]')]
        .map((a) => new URL(a.getAttribute('href'), location.href))
        .filter((u) => u.origin === location.origin)
        .map((u) => u.pathname))]
    );
    let shot = null;
    for (const src of brokenImgs) {
      shot ??= await shoot(page);
      addFinding({
        severity: 'medium', title: `Broken image on ${route}: ${src}`, url: route,
        repro: [`goto ${route}`, `observe: image ${src} has naturalWidth 0 / not complete`], screenshot: shot,
        network: [{ url: src, status: 0 }],
      });
    }
    for (const path of hrefs) {
      if (this._checked.has(path)) continue;
      this._checked.add(path);
      const res = await page.request.get(new URL(path, target).href);
      if (res.status() >= 400) {
        shot ??= await shoot(page);
        addFinding({
          severity: 'medium', title: `Dead link: ${path} → ${res.status()} (linked from ${route})`, url: route,
          repro: [`goto ${route}`, `observe: GET ${path} returns ${res.status()}`], screenshot: shot,
          network: [{ url: path, status: res.status() }],
        });
      }
    }
    if (!brokenImgs.length) working.push(`images ok: ${route}`);
  },
};
dims._checked = new Set();

const { chromium } = req('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
for (const route of routes) {
  await page.goto(new URL(route, target).href, { waitUntil: 'load' });
  await dims[dimension].call(dims, page, route);
}
await browser.close();

writeFileSync(join(runDir, 'raw', `${SOURCE}.json`), JSON.stringify(findings, null, 2));
writeFileSync(join(runDir, 'coverage', `${SOURCE}.json`), JSON.stringify({ routesVisited: routes, working }, null, 2));
console.log(`${SOURCE}: ${findings.length} findings across ${routes.length} routes`);
