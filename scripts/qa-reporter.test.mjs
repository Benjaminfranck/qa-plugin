import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import QaReporter from '../templates/qa/qa-reporter.mjs';
import { validateFinding } from './findings.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

function makeReporter(cwd) {
  const r = new QaReporter();
  r.onBegin({ projects: [{ use: { baseURL: 'http://localhost:4173' } }] }, {}, cwd);
  return r;
}

function fakeTest(title, projectName) {
  return { title, titlePath: () => ['', projectName, 'demo.spec.ts', title], parent: { project: () => ({ name: projectName }) } };
}

test('captured events become schema-valid findings with evidence', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'qa-rep-'));
  const shot = join(cwd, 'shot.png');
  writeFileSync(shot, PNG);
  const r = makeReporter(cwd);
  r.onTestEnd(fakeTest('home has no console errors', 'desktop-chromium'), {
    status: 'passed',
    attachments: [
      { name: 'qa-findings', body: Buffer.from(JSON.stringify([
        { kind: 'console', level: 'error', text: 'boom: analytics config missing' },
        { kind: 'http-error', url: 'http://localhost:4173/img/team.png', status: 404 },
      ])), contentType: 'application/json' },
      { name: 'qa-evidence', path: shot, contentType: 'image/png' },
    ],
  });
  r.onEnd({ status: 'passed' });
  const runDirs = readdirSync(join(cwd, 'qa', 'runs'));
  assert.equal(runDirs.length, 1);
  assert.ok(runDirs[0].endsWith('-suite'));
  const runDir = join(cwd, 'qa', 'runs', runDirs[0]);
  const raw = JSON.parse(readFileSync(join(runDir, 'raw', 'suite.json'), 'utf8'));
  assert.equal(raw.length, 2);
  for (const f of raw) {
    const v = validateFinding(f);
    assert.deepEqual(v.errors, []);
    assert.equal(f.source, 'test');
    assert.equal(f.verified, true);            // deterministic evidence = machine-verified
    assert.ok(existsSync(join(runDir, f.evidence.screenshot)));
  }
  assert.equal(raw[0].viewport, 'desktop');
  assert.ok(existsSync(join(runDir, 'run.json')));
  assert.ok(existsSync(join(runDir, 'coverage', 'suite.json')));
});

test('failed test becomes a high-severity finding; mobile project maps viewport', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'qa-rep-'));
  const shot = join(cwd, 'fail.png');
  writeFileSync(shot, PNG);
  const r = makeReporter(cwd);
  r.onTestEnd(fakeTest('quote flow reaches confirmation', 'mobile-iphone-14'), {
    status: 'failed',
    error: { message: 'expect(locator).toBeVisible() failed' },
    attachments: [{ name: 'screenshot', path: shot, contentType: 'image/png' }],
  });
  r.onEnd({ status: 'failed' });
  const cwdRuns = join(cwd, 'qa', 'runs');
  const runDir = join(cwdRuns, readdirSync(cwdRuns)[0]);
  const raw = JSON.parse(readFileSync(join(runDir, 'raw', 'suite.json'), 'utf8'));
  assert.equal(raw.length, 1);
  assert.equal(raw[0].severity, 'high');
  assert.equal(raw[0].viewport, 'iphone-14');
  assert.match(raw[0].title, /Test failed/);
  assert.deepEqual(validateFinding(raw[0]).errors, []);
});

test('passed tests with no events produce coverage, not findings', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'qa-rep-'));
  const r = makeReporter(cwd);
  r.onTestEnd(fakeTest('about page is clean', 'desktop-chromium'), { status: 'passed', attachments: [] });
  r.onEnd({ status: 'passed' });
  const cwdRuns = join(cwd, 'qa', 'runs');
  const runDir = join(cwdRuns, readdirSync(cwdRuns)[0]);
  const raw = JSON.parse(readFileSync(join(runDir, 'raw', 'suite.json'), 'utf8'));
  assert.equal(raw.length, 0);
  const cov = JSON.parse(readFileSync(join(runDir, 'coverage', 'suite.json'), 'utf8'));
  assert.ok(cov.working.some((w) => w.includes('about page is clean')));
});
