import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { validateFinding, mergeFindings, dedupeKey, SEVERITIES } from './findings.mjs';

const base = {
  id: 'RUN-X-explorer-001', source: 'explore', severity: 'high',
  title: 'Checkout dead', url: '/cart',
  repro: ['goto /cart', 'click Checkout', 'observe: nothing'],
  evidence: { screenshot: '001.png' }
};

test('valid behavioral finding passes', () => {
  assert.equal(validateFinding(base).valid, true);
});

test('valid code-level finding passes (codeRef instead of repro)', () => {
  const f = { ...base, source: 'audit-design', repro: undefined, codeRef: 'src/Nav.tsx:42' };
  assert.equal(validateFinding(f).valid, true);
});

test('finding with BOTH repro and codeRef fails', () => {
  const f = { ...base, codeRef: 'src/Nav.tsx:42' };
  assert.equal(validateFinding(f).valid, false);
});

test('finding with NEITHER repro nor codeRef fails', () => {
  const f = { ...base, repro: [] };
  assert.equal(validateFinding(f).valid, false);
});

test('evidence rule: missing screenshot fails', () => {
  const f = { ...base, evidence: {} };
  const r = validateFinding(f);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some(e => e.includes('screenshot')));
});

test('invalid source / severity fail', () => {
  assert.equal(validateFinding({ ...base, source: 'vibes' }).valid, false);
  assert.equal(validateFinding({ ...base, severity: 'mega' }).valid, false);
});

test('merge dedupes same title+url+viewport, keeps worst severity, records duplicates', () => {
  const a = { ...base, severity: 'medium' };
  const b = { ...base, id: 'RUN-X-mobile-007', severity: 'critical' };
  const { findings, dropped } = mergeFindings([[a], [b]]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'critical');
  assert.deepEqual(findings[0].duplicates, ['RUN-X-mobile-007']);
  assert.equal(dropped.length, 0);
});

test('merge drops invalid findings into dropped[] with errors', () => {
  const bad = { ...base, id: 'RUN-X-explorer-002', evidence: {} };
  const { findings, dropped } = mergeFindings([[base, bad]]);
  assert.equal(findings.length, 1);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].id, 'RUN-X-explorer-002');
});

test('different viewports are distinct findings', () => {
  const mobile = { ...base, id: 'RUN-X-mobile-001', viewport: 'iphone-14' };
  assert.notEqual(dedupeKey(base), dedupeKey(mobile));
});

test('CLI merge: reads raw/*.json, writes sorted findings.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-run-'));
  mkdirSync(join(dir, 'raw'));
  const low = { ...base, id: 'L1', title: 'minor thing', severity: 'low' };
  writeFileSync(join(dir, 'raw', 'explorer-1.json'), JSON.stringify([low]));
  writeFileSync(join(dir, 'raw', 'explorer-2.json'), JSON.stringify([base]));
  execFileSync('node', ['scripts/findings.mjs', 'merge', dir]);
  const out = JSON.parse(readFileSync(join(dir, 'findings.json'), 'utf8'));
  assert.equal(out.findings.length, 2);
  assert.equal(out.findings[0].severity, 'high'); // sorted worst-first
  assert.equal(SEVERITIES[0], 'critical');
});
