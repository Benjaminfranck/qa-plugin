// Visual regression for the qa plugin: baseline capture + pixelmatch check.
// Usage:
//   node visual.mjs baseline <baselineDir> <targetUrl> <routes,csv> <viewports,csv> [--masks=sel1,sel2]
//   node visual.mjs check <baselineDir> <runDir> <targetUrl> <routes,csv> <viewports,csv> [--masks=...] [--maxDiffRatio=0.01]
// Deps (playwright, pixelmatch, pngjs) from CLAUDE_PLUGIN_DATA (ensure-audit-deps.sh).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const DATA = process.env.CLAUDE_PLUGIN_DATA ?? join(process.env.HOME, '.claude', 'plugins', 'data', 'qa');
const req = createRequire(join(DATA, 'package.json'));
export function loadDep(name) { return req(name); }

const VIEWPORTS = { desktop: { width: 1280, height: 720 }, 'iphone-14': { width: 390, height: 844 } };

export function routeSlug(route) {
  return route === '/' ? 'home' : route.replace(/^\//, '').replaceAll('/', '-');
}

export function comparePngs(aPath, bPath, diffPath, threshold = 0.2) {
  const { PNG } = req('pngjs');
  const pixelmatch = req('pixelmatch');
  const a = PNG.sync.read(readFileSync(aPath));
  const b = PNG.sync.read(readFileSync(bPath));
  if (a.width !== b.width || a.height !== b.height) {
    return { dimensionMismatch: true, ratio: 1, diffPixels: a.width * a.height };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const fn = pixelmatch.default ?? pixelmatch;
  const diffPixels = fn(a.data, b.data, diff.data, a.width, a.height, { threshold });
  writeFileSync(diffPath, PNG.sync.write(diff));
  return { dimensionMismatch: false, ratio: diffPixels / (a.width * a.height), diffPixels };
}

async function capture(targetUrl, routes, viewports, masks, outDir) {
  const { chromium } = req('playwright');
  const browser = await chromium.launch();
  mkdirSync(outDir, { recursive: true });
  const shots = [];
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: VIEWPORTS[vp] ?? VIEWPORTS.desktop });
    for (const route of routes) {
      await page.goto(new URL(route, targetUrl).href, { waitUntil: 'load' });
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
      await page.evaluate(() => document.fonts.ready);
      if (masks.length) {
        await page.evaluate((sels) => {
          for (const sel of sels) document.querySelectorAll(sel).forEach((el) => { el.style.visibility = 'hidden'; });
        }, masks);
      }
      const file = join(outDir, `${routeSlug(route)}--${vp}.png`);
      await page.screenshot({ path: file, fullPage: true });
      shots.push({ route, viewport: vp, file: `${routeSlug(route)}--${vp}.png` });
    }
    await page.close();
  }
  await browser.close();
  return shots;
}

function parseArgs(rest) {
  const masks = (rest.find((a) => a.startsWith('--masks=')) ?? '--masks=').slice(8).split(',').filter(Boolean);
  const maxDiffRatio = Number((rest.find((a) => a.startsWith('--maxDiffRatio=')) ?? '--maxDiffRatio=0.01').split('=')[1]);
  return { masks, maxDiffRatio };
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'baseline') {
    const [baselineDir, targetUrl, routesCsv, viewportsCsv, ...rest] = args;
    const { masks } = parseArgs(rest);
    const shots = await capture(targetUrl, routesCsv.split(','), viewportsCsv.split(','), masks, baselineDir);
    console.log(`baseline: ${shots.length} screenshots in ${baselineDir}`);
  } else if (mode === 'check') {
    const [baselineDir, runDir, targetUrl, routesCsv, viewportsCsv, ...rest] = args;
    const { masks, maxDiffRatio } = parseArgs(rest);
    const currentDir = join(runDir, 'visual');
    mkdirSync(join(runDir, 'raw'), { recursive: true });
    mkdirSync(join(runDir, 'coverage'), { recursive: true });
    const shots = await capture(targetUrl, routesCsv.split(','), viewportsCsv.split(','), masks, currentDir);
    const findings = [];
    const working = [];
    for (const s of shots) {
      const basePath = join(baselineDir, s.file);
      if (!existsSync(basePath)) { working.push(`visual: no baseline yet for ${s.route} (${s.viewport}) — captured`); continue; }
      const diffRel = `visual/diff-${s.file}`;
      const r = comparePngs(basePath, join(currentDir, s.file), join(runDir, diffRel));
      if (r.dimensionMismatch || r.ratio > maxDiffRatio) {
        findings.push({
          id: `visual-${String(findings.length + 1).padStart(3, '0')}`,
          source: 'visual',
          severity: r.dimensionMismatch ? 'high' : 'medium',
          title: r.dimensionMismatch
            ? `Page size changed: ${s.route} (${s.viewport})`
            : `Visual diff ${(r.ratio * 100).toFixed(2)}% on ${s.route} (${s.viewport})`,
          url: s.route,
          viewport: s.viewport,
          repro: [`compare visual/${s.file} against baseline ${s.file}`, `observe: ${r.diffPixels} pixels differ (${(r.ratio * 100).toFixed(2)}%)`],
          evidence: { screenshot: r.dimensionMismatch ? `visual/${s.file}` : diffRel, console: [], network: [] },
          verified: true,
          status: 'open',
        });
      } else {
        working.push(`visual unchanged: ${s.route} (${s.viewport})`);
      }
    }
    writeFileSync(join(runDir, 'raw', 'visual.json'), JSON.stringify(findings, null, 2));
    writeFileSync(join(runDir, 'coverage', 'visual.json'), JSON.stringify({ routesVisited: [...new Set(shots.map((s) => s.route))], working }, null, 2));
    console.log(`visual: ${findings.length} diffs, ${working.length} ok/new`);
  } else {
    console.error('usage: node visual.mjs baseline|check ...');
    process.exit(1);
  }
}

import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
