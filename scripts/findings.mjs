// Findings schema utilities for the qa plugin. Zero dependencies.
// Schema: docs/superpowers/specs/2026-06-11-qa-framework-design.md §6
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

export const SOURCES = ['explore', 'test', 'audit-a11y', 'audit-perf', 'audit-links', 'audit-seo', 'audit-design', 'visual'];
export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
export const STATUSES = ['open', 'fixed', 'blocked', 'deferred', 'wont-fix', 'flaky'];

export function validateFinding(f) {
  if (!f || typeof f !== 'object') return { valid: false, errors: ['not an object'] };
  const errors = [];
  if (!f.id) errors.push('missing id');
  if (!SOURCES.includes(f.source)) errors.push(`invalid source: ${f.source}`);
  if (!SEVERITIES.includes(f.severity)) errors.push(`invalid severity: ${f.severity}`);
  if (!f.title) errors.push('missing title');
  if (!f.url) errors.push('missing url');
  const hasRepro = Array.isArray(f.repro) && f.repro.length > 0;
  const hasCodeRef = typeof f.codeRef === 'string' && f.codeRef.length > 0;
  if (hasRepro === hasCodeRef) errors.push('exactly one of repro (behavioral) / codeRef (code-level) required');
  if (!f.evidence?.screenshot) errors.push('evidence rule: missing screenshot');
  if (f.status && !STATUSES.includes(f.status)) errors.push(`invalid status: ${f.status}`);
  return { valid: errors.length === 0, errors };
}

export function dedupeKey(f) {
  return [f.url, f.viewport ?? 'desktop', String(f.title).toLowerCase().trim()].join('|');
}

export function mergeFindings(lists) {
  const seen = new Map();
  const dropped = [];
  for (const f of lists.flat()) {
    const { valid, errors } = validateFinding(f);
    if (!valid) { dropped.push({ id: f?.id ?? null, errors }); continue; }
    const key = dedupeKey(f);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { verified: false, status: 'open', ...f });
      continue;
    }
    existing.duplicates = [...(existing.duplicates ?? []), f.id];
    if (SEVERITIES.indexOf(f.severity) < SEVERITIES.indexOf(existing.severity)) {
      existing.severity = f.severity;
    }
  }
  return { findings: [...seen.values()], dropped };
}

function cliMerge(runDir) {
  const rawDir = join(runDir, 'raw');
  const lists = readdirSync(rawDir)
    .filter(n => n.endsWith('.json'))
    .map(n => JSON.parse(readFileSync(join(rawDir, n), 'utf8')));
  const { findings, dropped } = mergeFindings(lists);
  findings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
  writeFileSync(join(runDir, 'findings.json'), JSON.stringify({ findings, dropped }, null, 2));
  console.log(`merged: ${findings.length} findings; dropped (evidence rule): ${dropped.length}`);
  if (dropped.length) console.log(JSON.stringify(dropped, null, 2));
}

if (process.argv[1]?.endsWith('findings.mjs')) {
  const [cmd, runDir] = process.argv.slice(2);
  if (cmd === 'merge' && runDir) cliMerge(runDir);
  else { console.error('usage: node findings.mjs merge <runDir>'); process.exit(1); }
}
