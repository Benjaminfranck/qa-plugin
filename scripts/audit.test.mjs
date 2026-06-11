import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { validateFinding } from './findings.mjs';

const AUDIT = fileURLToPath(new URL('./audit.mjs', import.meta.url));
const SERVER = fileURLToPath(new URL('../fixtures/demo-site/server.mjs', import.meta.url));
const TARGET = 'http://localhost:4199';
let server;

before(async () => {
  execFileSync(fileURLToPath(new URL('./ensure-audit-deps.sh', import.meta.url)), { stdio: 'inherit' });
  server = spawn('node', [SERVER], { env: { ...process.env, PORT: '4199' } });
  await new Promise((r) => setTimeout(r, 800));
});
after(() => server?.kill());

function runDim(dim, routes) {
  const runDir = mkdtempSync(join(tmpdir(), `qa-audit-${dim}-`));
  execFileSync('node', [AUDIT, runDir, TARGET, dim, routes], { stdio: 'pipe', timeout: 120000 });
  const findings = JSON.parse(readFileSync(join(runDir, 'raw', `audit-${dim}.json`), 'utf8'));
  const coverage = JSON.parse(readFileSync(join(runDir, 'coverage', `audit-${dim}.json`), 'utf8'));
  return { runDir, findings, coverage };
}

test('links: finds the dead /careers link and the broken team.png', () => {
  const { runDir, findings } = runDim('links', '/,/about');
  assert.ok(findings.some((f) => f.title.includes('/careers')), 'dead link found');
  assert.ok(findings.some((f) => f.title.includes('team.png')), 'broken image found');
  for (const f of findings) {
    assert.deepEqual(validateFinding(f).errors, []);
    assert.equal(f.source, 'audit-links');
    assert.equal(f.verified, true);
    assert.ok(existsSync(join(runDir, f.evidence.screenshot)));
  }
});

test('a11y: axe finds the low-contrast text on /pricing; /about is clean', () => {
  const { findings, coverage } = runDim('a11y', '/pricing,/about');
  assert.ok(findings.some((f) => f.title.includes('color-contrast')), 'contrast violation found');
  assert.ok(!findings.some((f) => f.url === '/about'), 'no /about violations');
  assert.ok(coverage.routesVisited.includes('/about'));
  for (const f of findings) assert.deepEqual(validateFinding(f).errors, []);
});

test('seo: flags missing meta description; perf: emits metrics, no findings on localhost', () => {
  const seo = runDim('seo', '/');
  assert.ok(seo.findings.some((f) => f.title.includes('meta description')));
  for (const f of seo.findings) assert.deepEqual(validateFinding(f).errors, []);

  const perf = runDim('perf', '/');
  assert.equal(perf.findings.length, 0, 'localhost is fast — no perf findings');
  assert.ok(perf.coverage.working.some((w) => w.includes('LCP')), 'metrics recorded in coverage');
});
