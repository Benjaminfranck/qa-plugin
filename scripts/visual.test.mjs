import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { comparePngs, routeSlug } from './visual.mjs';

before(() => {
  execFileSync(fileURLToPath(new URL('./ensure-audit-deps.sh', import.meta.url)), { stdio: 'inherit' });
});

// PNG builder using visual.mjs's own dep loader (loadDep is exported for this)
import { loadDep } from './visual.mjs';
function makePng(file, w, h, paint) {
  const { PNG } = loadDep('pngjs');
  const img = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (w * y + x) << 2;
    const [r, g, b] = paint(x, y);
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  writeFileSync(file, PNG.sync.write(img));
}

test('identical images → ratio 0; small change → small ratio; dimension change → mismatch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-visual-'));
  const a = join(dir, 'a.png'), b = join(dir, 'b.png'), c = join(dir, 'c.png'), d = join(dir, 'd.png');
  makePng(a, 100, 100, () => [200, 200, 200]);
  makePng(b, 100, 100, () => [200, 200, 200]);
  makePng(c, 100, 100, (x, y) => (x < 10 && y < 10 ? [255, 0, 0] : [200, 200, 200]));
  makePng(d, 100, 120, () => [200, 200, 200]);

  const same = comparePngs(a, b, join(dir, 'diff1.png'));
  assert.equal(same.ratio, 0);
  const changed = comparePngs(a, c, join(dir, 'diff2.png'));
  assert.ok(changed.ratio > 0.005 && changed.ratio < 0.05, `ratio ${changed.ratio}`);
  const resized = comparePngs(a, d, join(dir, 'diff3.png'));
  assert.equal(resized.dimensionMismatch, true);
});

test('routeSlug maps routes to filenames', () => {
  assert.equal(routeSlug('/'), 'home');
  assert.equal(routeSlug('/pricing'), 'pricing');
  assert.equal(routeSlug('/docs/getting-started'), 'docs-getting-started');
});
