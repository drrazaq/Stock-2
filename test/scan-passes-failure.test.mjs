// Failure paths of the two-pass orchestrator (scan-passes.mjs), with a STUB scan.mjs so each failure is exact: a private pass killed
// mid-write (SIGKILL), a crashed public pass, an owner file changed concurrently by the bot, and the public environment allowlist.
// Invariant: the real checkout never holds private bytes at a public path, and owner files are never lost. Synthetic data only.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process';
const ROOT = path.resolve(import.meta.dirname, '..');
const STUB = `import fs from 'node:fs';
const pass = process.env.SCAN_PASS, mode = process.env.STUB_MODE || (() => { try { return fs.readFileSync('data/stub-mode.txt', 'utf8'); } catch { return ''; } })();   // the public env allowlist strips STUB_MODE
if (pass === 'public') {
  fs.writeFileSync('data/public-env.json', JSON.stringify(Object.keys(process.env).sort()));
  if (mode.includes('public-crash')) { fs.writeFileSync('data/signals.json', '{"half":'); process.exit(7); }
  fs.writeFileSync('data/signals.json', JSON.stringify({ session: '2026-11-12', generatedAt: '2026-11-12T21:40:00.000Z', who: 'public' }));
  fs.writeFileSync('data/models.json', JSON.stringify({ PUB: 1 }));
} else {
  fs.writeFileSync('data/signals.json', JSON.stringify({ session: '2026-11-12', generatedAt: process.env.SCAN_GENERATED_AT, who: 'PRIVATE_SECRET' }));
  fs.writeFileSync('data/models.json', JSON.stringify({ PRIVATE_SECRET: 1 }));
  fs.writeFileSync('data/signals-private.json', JSON.stringify({ v: 1, posVerdict: { ZZP: 'PRIVATE_SECRET' } }));
  fs.writeFileSync('data/my-positions.json', JSON.stringify({ ZZP: { entry: 1, note: 'scan' } }));
  if (mode.includes('concurrent')) fs.writeFileSync(process.env.STUB_REAL + '/data/my-positions.json', JSON.stringify({ ZZP: { entry: 1, note: 'bot-newer' } }));
  if (mode.includes('private-kill')) process.kill(process.pid, 'SIGKILL');
}`;
function world(mode, extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-passes-fail-'));
  fs.mkdirSync(path.join(dir, '.github')); fs.copyFileSync(path.join(ROOT, '.github/private-files.txt'), path.join(dir, '.github/private-files.txt'));
  fs.copyFileSync(path.join(ROOT, 'scan-passes.mjs'), path.join(dir, 'scan-passes.mjs')); fs.writeFileSync(path.join(dir, 'scan.mjs'), STUB);
  fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'data/signals.json'), '{"orig":true}'); fs.writeFileSync(path.join(dir, 'data/models.json'), '{"orig":true}');
  fs.writeFileSync(path.join(dir, 'data/my-positions.json'), '{"ZZP":{"entry":1,"note":"original"}}'); fs.writeFileSync(path.join(dir, 'data/stub-mode.txt'), mode);
  const r = spawnSync(process.execPath, ['scan-passes.mjs'], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, STUB_MODE: mode, STUB_REAL: dir, TG_TOKEN: 'secret-tg', TG_CHAT: '1', HALALTERMINAL_KEY: 'h', HALALSCREENER_KEY: 'h', ZOYA_KEY: 'z', ALPACA_KEY: 'a', PRIVATE_DATA_TOKEN: 'p', GITHUB_TOKEN: 'g', TWELVE_KEY: 'market', ...extraEnv } });
  const read = (f) => { try { return fs.readFileSync(path.join(dir, 'data', f), 'utf8'); } catch { return null; } };
  const publicFiles = () => fs.readdirSync(path.join(dir, 'data')).filter(f => !f.startsWith('private-') && !fs.readFileSync(path.join(ROOT, '.github/private-files.txt'), 'utf8').split('\n').map(l => l.trim()).includes(f));
  return { dir, r, read, publicFiles };
}
const noSecretInPublic = (w) => { for (const f of w.publicFiles()) assert.doesNotMatch(w.read(f), /PRIVATE_SECRET/, 'private bytes at public path ' + f); };
test('private pass SIGKILLed mid-write: public paths keep the public pass output, owner files untouched, no private bytes public', () => {
  const w = world('private-kill'); try {
    assert.notEqual(w.r.status, 0);
    assert.match(w.read('signals.json'), /"who":"public"/); assert.match(w.read('models.json'), /"PUB":1/); noSecretInPublic(w);
    assert.equal(w.read('my-positions.json'), '{"ZZP":{"entry":1,"note":"original"}}', 'owner file not replaced by a killed pass');
    assert.equal(w.read('signals-private.json'), null, 'no partial private record installed');
  } finally { fs.rmSync(w.dir, { recursive: true, force: true }); }
});
test('public pass crash: every public path stays as it was; the completed private pass still installs only to private paths', () => {
  const w = world('public-crash'); try {
    assert.equal(w.read('signals.json'), '{"orig":true}'); assert.equal(w.read('models.json'), '{"orig":true}'); noSecretInPublic(w);
    assert.match(w.read('private-signals.json'), /PRIVATE_SECRET/); assert.match(w.read('private-models.json'), /PRIVATE_SECRET/);
    assert.match(w.read('my-positions.json'), /"note":"scan"/, 'completed private pass updates the owner file');
  } finally { fs.rmSync(w.dir, { recursive: true, force: true }); }
});
test('owner file changed concurrently during the scan: the newer owner bytes are kept, the scan copy is set aside privately', () => {
  const w = world('concurrent'); try {
    assert.match(w.read('my-positions.json'), /bot-newer/); assert.match(w.read('private-conflict-my-positions.json'), /"note":"scan"/); noSecretInPublic(w);
  } finally { fs.rmSync(w.dir, { recursive: true, force: true }); }
});
test('public pass environment is an allowlist: no messaging, account, private-data, GitHub, screening or Zoya credentials', () => {
  const w = world(''); try {
    const keys = JSON.parse(w.read('public-env.json'));
    for (const k of ['TG_TOKEN', 'TG_CHAT', 'HALALTERMINAL_KEY', 'HALALSCREENER_KEY', 'ZOYA_KEY', 'ALPACA_KEY', 'PRIVATE_DATA_TOKEN', 'GITHUB_TOKEN', 'STUB_REAL']) assert.ok(!keys.includes(k), k);
    assert.ok(keys.includes('TWELVE_KEY')); noSecretInPublic(w);
    assert.equal(JSON.parse(w.read('signals.json')).generatedAt, JSON.parse(w.read('private-signals.json')).generatedAt, 'private pass reuses the public clock');
  } finally { fs.rmSync(w.dir, { recursive: true, force: true }); }
});
