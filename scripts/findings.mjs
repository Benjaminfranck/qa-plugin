// Findings schema utilities for the qa plugin. Zero dependencies.
// Schema: docs/superpowers/specs/2026-06-11-qa-framework-design.md §6
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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

// title-equality dedupe is intentionally literal; paraphrased duplicates are caught later by the verifier
export function dedupeKey(f) {
  return [f.url, f.viewport ?? 'desktop', String(f.title).toLowerCase().trim()].join('|');
}

export function mergeFindings(lists, opts = {}) {
  const seen = new Map();
  const dropped = [];
  for (const f of lists.flat()) {
    const { valid, errors } = validateFinding(f);
    if (!valid) { dropped.push({ id: f?.id ?? null, errors }); continue; }
    const key = dedupeKey(f);
    const existing = seen.get(key);
    if (!existing) {
      if (opts.trustVerified) {
        // trustVerified: seed with defaults, then let producer values win
        seen.set(key, { verified: false, status: 'open', ...f });
      } else {
        // Spread f first, then override verified/status so producers cannot smuggle verifier state
        seen.set(key, { ...f, verified: false, status: 'open' });
      }
      continue;
    }
    existing.duplicates = [...(existing.duplicates ?? []), f.id];
    if (SEVERITIES.indexOf(f.severity) < SEVERITIES.indexOf(existing.severity)) {
      existing.severity = f.severity;
    }
  }
  return { findings: [...seen.values()], dropped };
}

function cliMerge(runDir, force) {
  const rawDir = join(runDir, 'raw');
  if (!existsSync(rawDir)) {
    process.stderr.write(`error: ${rawDir} does not exist\n`);
    process.exit(1);
  }

  const outFile = join(runDir, 'findings.json');
  if (!force && existsSync(outFile)) {
    process.stderr.write('findings.json exists; re-run with --force to overwrite\n');
    process.exit(1);
  }

  const dropped = [];
  const lists = readdirSync(rawDir)
    .filter(n => n.endsWith('.json'))
    .map(n => {
      try {
        return JSON.parse(readFileSync(join(rawDir, n), 'utf8'));
      } catch {
        dropped.push({ file: n, errors: ['unparseable JSON'] });
        return [];
      }
    });

  const { findings, dropped: mergeDropped } = mergeFindings(lists, { trustVerified: process.argv.includes('--trust-verified') });
  const allDropped = [...dropped, ...mergeDropped];
  findings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
  writeFileSync(outFile, JSON.stringify({ findings, dropped: allDropped }, null, 2));
  console.log(`merged: ${findings.length} findings; dropped (evidence rule): ${allDropped.length}`);
  if (allDropped.length) console.log(JSON.stringify(allDropped, null, 2));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const positional = args.filter(a => !a.startsWith('--'));
  const [cmd, runDir] = positional;
  if (cmd === 'merge' && runDir) cliMerge(runDir, force);
  else { console.error('usage: node findings.mjs merge <runDir> [--force]'); process.exit(1); }
}
