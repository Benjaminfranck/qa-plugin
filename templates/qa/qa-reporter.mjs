// Playwright reporter: converts qa-findings/qa-evidence attachments and test
// failures into a Phase-1-schema run dir (qa/runs/RUN-<ts>-suite/).
// Findings here carry deterministic machine evidence, so verified: true.
import { mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SEV_BY_KIND = { pageerror: 'high', 'http-error': 'medium', requestfailed: 'medium', console: 'medium' };

export default class QaReporter {
  // cwdOverride is for tests; Playwright calls onBegin(config, suite)
  onBegin(config, _suite, cwdOverride) {
    const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    this.runId = `RUN-${ts}-suite`;
    this.cwd = cwdOverride ?? process.cwd();
    this.runDir = join(this.cwd, 'qa', 'runs', this.runId);
    mkdirSync(join(this.runDir, 'raw'), { recursive: true });
    mkdirSync(join(this.runDir, 'coverage'), { recursive: true });
    this.baseURL = config.projects?.[0]?.use?.baseURL ?? '';
    this.findings = [];
    this.working = [];
    this.startedAt = new Date().toISOString();
    this.shotCount = 0;
  }

  copyShot(attachment) {
    if (!attachment?.path || !existsSync(attachment.path)) return null;
    const rel = `${String(++this.shotCount).padStart(3, '0')}.png`;
    copyFileSync(attachment.path, join(this.runDir, rel));
    return rel;
  }

  nextId() {
    return `${this.runId}-suite-${String(this.findings.length + 1).padStart(3, '0')}`;
  }

  runCmd(test) {
    return `npx playwright test -c qa/playwright.config.ts -g "${test.title}"`;
  }

  onTestEnd(test, result) {
    const project = test.parent?.project?.()?.name ?? 'desktop';
    const viewport = project.includes('mobile') || project.includes('iphone') ? 'iphone-14' : 'desktop';

    if (result.status === 'passed') this.working.push(`[suite] ${test.title} (${project})`);

    if (result.status === 'failed' || result.status === 'timedOut') {
      const shotRel = this.copyShot(result.attachments?.find((a) => a.name === 'screenshot'));
      this.findings.push({
        id: this.nextId(),
        source: 'test',
        severity: 'high',
        title: `Test failed: ${test.title}`.slice(0, 140),
        url: `(suite) ${test.titlePath().filter(Boolean).join(' › ')}`,
        viewport,
        repro: [this.runCmd(test), `observe: ${(result.error?.message ?? 'failure').split('\n')[0]}`],
        evidence: { screenshot: shotRel, console: [], network: [] },
        verified: true,
        status: 'open',
      });
    }

    const fa = result.attachments?.find((a) => a.name === 'qa-findings');
    if (!fa) return;
    const events = JSON.parse(fa.body ? fa.body.toString() : readFileSync(fa.path, 'utf8'));
    const shotRel = this.copyShot(result.attachments?.find((a) => a.name === 'qa-evidence'));
    for (const e of events) {
      this.findings.push({
        id: this.nextId(),
        source: 'test',
        severity: SEV_BY_KIND[e.kind] ?? 'low',
        title: `[${e.kind}] ${(e.text ?? `${e.status ?? ''} ${e.url ?? ''}`.trim()).slice(0, 140)}`,
        url: e.url ?? this.baseURL,
        viewport,
        repro: [this.runCmd(test), `observe: ${e.kind} — ${(e.text ?? `${e.status} ${e.url}`).slice(0, 140)}`],
        evidence: {
          screenshot: shotRel,
          console: e.kind === 'console' || e.kind === 'pageerror' ? [e.text] : [],
          network: e.kind === 'http-error' ? [{ url: e.url, status: e.status }] : [],
        },
        verified: true,
        status: 'open',
      });
    }
  }

  onEnd() {
    writeFileSync(join(this.runDir, 'raw', 'suite.json'), JSON.stringify(this.findings, null, 2));
    writeFileSync(join(this.runDir, 'run.json'), JSON.stringify({
      runId: this.runId, target: this.baseURL, startedAt: this.startedAt, kind: 'suite',
    }, null, 2));
    writeFileSync(join(this.runDir, 'coverage', 'suite.json'), JSON.stringify({
      routesVisited: [], working: this.working,
    }, null, 2));
    console.log(`\nqa: suite findings written to ${this.runDir}`);
  }
}
