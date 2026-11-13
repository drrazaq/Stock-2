// The public sandbox admits only POSITIVELY declared inputs (Codex 6851464418): declared public seeds and manifest-verified scan outputs.
// An unmapped data input (here: a lab-style file carrying an owner halal field), a legacy unverified scan output, an unrelated root file
// and a root log are never visible to the public pass; only declared outputs are installed. Stub scan.mjs, synthetic data, no network.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { seedClass, codeAllowed, PUBLIC_SEEDS } from '../scan-passes.mjs';
const ROOT = path.resolve(import.meta.dirname, '..');
const STUB = `import fs from 'node:fs';
if (process.env.SCAN_PASS === 'public') {
  fs.writeFileSync('data/names.json', JSON.stringify({ data: fs.readdirSync('data').sort(), root: fs.readdirSync('.').sort() }));
  fs.writeFileSync('data/signals.json', JSON.stringify({ session: '2026-11-12', generatedAt: '2026-11-12T21:40:00.000Z' }));
  fs.writeFileSync('data/undeclared-output.json', '{"x":1}');
}`;
test('public pass sees only declared inputs and the declared code copy; only declared outputs are installed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-map-')); try {
    fs.mkdirSync(path.join(dir, '.github')); fs.copyFileSync(path.join(ROOT, '.github/private-files.txt'), path.join(dir, '.github/private-files.txt'));
    fs.copyFileSync(path.join(ROOT, 'scan-passes.mjs'), path.join(dir, 'scan-passes.mjs')); fs.writeFileSync(path.join(dir, 'scan.mjs'), STUB);
    fs.writeFileSync(path.join(dir, 'index.html'), '<script id="logic"></script>'); fs.writeFileSync(path.join(dir, 'notes.txt'), 'PRIVATE_SECRET'); fs.writeFileSync(path.join(dir, 'run.log'), 'PRIVATE_SECRET');
    fs.mkdirSync(path.join(dir, 'docs')); fs.writeFileSync(path.join(dir, 'docs/x.md'), 'PRIVATE_SECRET');
    fs.mkdirSync(path.join(dir, 'data'));
    fs.writeFileSync(path.join(dir, 'data/zad-list.json'), '{"not":[]}'); fs.writeFileSync(path.join(dir, 'data/chains.json'), '{"chains":{}}');
    fs.writeFileSync(path.join(dir, 'data/newlab-today.json'), '{"methods":{"m":{"newSignals":[{"sym":"ZZQ","halal":"PRIVATE_SECRET"}]}}}');   // unmapped
    fs.writeFileSync(path.join(dir, 'data/models.json'), '{"legacy":"PRIVATE_SECRET"}');   // scan output with no manifest: unverified
    fs.writeFileSync(path.join(dir, 'data/my-positions.json'), '{"ZZP":{"entry":1}}');
    const r = spawnSync(process.execPath, ['scan-passes.mjs'], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const seen = JSON.parse(fs.readFileSync(path.join(dir, 'data/names.json'), 'utf8'));
    assert.deepEqual(seen.data, ['chains.json', 'zad-list.json'], 'only declared public seeds are visible to the public pass');
    assert.deepEqual(seen.root.filter(n => n !== 'data').sort(), ['index.html', 'scan-passes.mjs', 'scan.mjs'], 'only the declared code copy');
    assert.ok(!fs.existsSync(path.join(dir, 'data/undeclared-output.json')), 'an undeclared public-pass output is not installed');
    assert.match(r.stdout, /UNKNOWN 1/); assert.match(r.stdout, /SCAN_OUTPUT_UNVERIFIED 1/); assert.match(r.stdout, /undeclared public-pass outputs were NOT installed/);
    assert.doesNotMatch(r.stdout, /PRIVATE_SECRET/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('declared public outputs and declared public seeds never overlap the private list', async () => {
  const { SCAN_OUTPUTS } = await import('../scan-passes.mjs');
  const priv = new Set(fs.readFileSync(path.join(ROOT, '.github/private-files.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')));
  for (const f of [...SCAN_OUTPUTS, ...Object.keys(PUBLIC_SEEDS)]) assert.ok(!priv.has(f) && !f.startsWith('private-'), f);
});
test('seed classes: unknown is never presumed public; declared and verified are the only admitted classes', () => {
  const h = () => 'abc', man = { files: { 'signals.json': 'abc' } };
  assert.equal(seedClass('newlab-today.json', man, h), 'UNKNOWN'); assert.equal(seedClass('squad1-today.json', man, h), 'UNKNOWN');
  assert.equal(seedClass('discovery.json', man, h), 'UNKNOWN', 'producer reads owner settings: quarantined until split');
  assert.equal(seedClass('signals.json', man, h), 'SCAN_OUTPUT_VERIFIED'); assert.equal(seedClass('models.json', man, h), 'SCAN_OUTPUT_UNVERIFIED');
  assert.equal(seedClass('my-positions.json', man, h), 'PRIVATE'); assert.equal(seedClass('private-failed-pass-x.json', man, h), 'PRIVATE');
  for (const f of Object.keys(PUBLIC_SEEDS)) assert.equal(seedClass(f, man, h), 'DECLARED_PUBLIC');
  for (const n of ['notes.txt', 'run.log', 'README.md', 'run-squad1-now.txt', 'ml-spec.json', '.github', 'docs', 'tools']) assert.equal(codeAllowed(n), false, n);
  for (const n of ['scan.mjs', 'index.html', 'watchlist.txt']) assert.equal(codeAllowed(n), true, n);
});
