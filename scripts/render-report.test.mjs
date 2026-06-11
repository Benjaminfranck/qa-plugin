import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { renderReport, escapeHtml } from './render-report.mjs';

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

function makeRun() {
  const dir = mkdtempSync(join(tmpdir(), 'qa-report-'));
  mkdirSync(join(dir, 'coverage'), { recursive: true });
  writeFileSync(join(dir, 'shot.png'), PNG);
  writeFileSync(join(dir, 'run.json'), JSON.stringify({
    target: 'http://localhost:4173', startedAt: '2026-06-11T10:00:00Z', runId: 'RUN-TEST'
  }));
  writeFileSync(join(dir, 'coverage', 'explorer-1.json'), JSON.stringify({
    routesVisited: ['/', '/about'], working: ['About page renders correctly']
  }));
  writeFileSync(join(dir, 'findings.json'), JSON.stringify({
    findings: [{
      id: 'RUN-TEST-explorer-001', source: 'explore', severity: 'critical',
      title: 'Signup <script>alert(1)</script> broken', url: '/',
      repro: ['goto /', 'click Sign up'], verified: true, status: 'open',
      evidence: { screenshot: 'shot.png', console: ['TypeError: window.startSignup is not a function'] }
    }],
    dropped: [{ id: 'RUN-TEST-explorer-002', errors: ['evidence rule: missing screenshot'] }]
  }));
  return dir;
}

test('renderReport writes self-contained report.html', () => {
  const dir = makeRun();
  const out = renderReport(dir);
  assert.ok(existsSync(out));
  const html = readFileSync(out, 'utf8');
  assert.ok(html.includes('data:image/png;base64,'));          // embedded screenshot
  assert.ok(html.includes('critical'));                        // severity badge
  assert.ok(html.includes('TypeError'));                       // console evidence
  assert.ok(html.includes('About page renders correctly'));    // what-works from coverage/
  assert.ok(html.includes('2'));                               // pages tested metric
  assert.ok(!html.includes('<script>alert(1)</script>'));      // titles are escaped
  assert.ok(html.includes('&lt;script&gt;'));
});

test('escapeHtml escapes the five specials', () => {
  assert.equal(escapeHtml(`<a href="x" & 'y'>`), '&lt;a href=&quot;x&quot; &amp; &#39;y&#39;&gt;');
});

test('renders without coverage/ or run.json (graceful)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-report-'));
  writeFileSync(join(dir, 'findings.json'), JSON.stringify({ findings: [], dropped: [] }));
  const out = renderReport(dir);
  const html = readFileSync(out, 'utf8');
  assert.ok(html.includes('0'));   // zero findings still renders
});
