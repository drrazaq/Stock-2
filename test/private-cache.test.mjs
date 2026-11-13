// Owner-derived research caches through the private store only (.github/private-cache.sh; Codex 6856174038 / 6856207421 / 6856231228 /
// 6856457357). Synthetic bytes in throw-away directories; no Actions cache, provider or repository operation.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
const REPO = path.resolve(import.meta.dirname, '..'), WF = path.join(REPO, '.github/workflows');
function box() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pcache-')); fs.mkdirSync(path.join(d, '.github')); fs.mkdirSync(path.join(d, 'data'));
  fs.copyFileSync(path.join(REPO, '.github/private-cache.sh'), path.join(d, '.github/private-cache.sh')); return d; }
const pc = (d, args, env = {}) => spawnSync('bash', ['.github/private-cache.sh', ...args], { cwd: d, encoding: 'utf8', env: { PATH: process.env.PATH, PRIVATE_CACHE_ADMIT_DIR: path.join(d, 'rt/private-cache-admitted'), ...env } });
const seedDir = (d, name) => execSync('tar -czf ' + path.join(d, 'data', name) + ' -T /dev/null');   // an empty, valid archive in the private store
test('install-file: absent private cache is UNKNOWN (exit 3, nothing created); install, stage and re-install round-trip the exact bytes', () => {
  const d = box(); const r = pc(d, ['install-file', 'events-cache.json.gz', 'ev-cache/events-cache.json.gz']); assert.equal(r.status, 3); assert.match(r.stdout, /UNKNOWN.*not starting empty/);
  assert.ok(!fs.existsSync(path.join(d, 'ev-cache/events-cache.json.gz')));
  fs.writeFileSync(path.join(d, 'data/events-cache.json.gz'), 'old');
  assert.equal(pc(d, ['install-file', 'events-cache.json.gz', 'ev-cache/events-cache.json.gz']).status, 0);
  const bytes = Buffer.from([0x1f, 0x8b, 1, 2, 3, 255]); fs.writeFileSync(path.join(d, 'ev-cache/events-cache.json.gz'), bytes);
  assert.equal(pc(d, ['stage-file', 'ev-cache/events-cache.json.gz', 'events-cache.json.gz']).status, 0); fs.rmSync(path.join(d, 'ev-cache'), { recursive: true });
  assert.equal(pc(d, ['install-file', 'events-cache.json.gz', 'ev-cache/events-cache.json.gz']).status, 0); assert.deepEqual(fs.readFileSync(path.join(d, 'ev-cache/events-cache.json.gz')), bytes);
});
test('the compressed bound stops (never truncates)', () => {
  const d = box(); fs.writeFileSync(path.join(d, 'data/evr-min.json.gz'), 'x'); assert.equal(pc(d, ['install-file', 'evr-min.json.gz', 'big.gz']).status, 0);
  fs.writeFileSync(path.join(d, 'big.gz'), Buffer.alloc(2000)); const r = pc(d, ['stage-file', 'big.gz', 'evr-min.json.gz'], { PRIVATE_CACHE_MAX_BYTES: '1000' });
  assert.equal(r.status, 1); assert.equal(fs.readFileSync(path.join(d, 'data/evr-min.json.gz'), 'utf8'), 'x');
});
test('stage-dir is deterministic and install-dir restores the exact tree; links and over-bound trees stop', () => {
  const d = box(), src = path.join(d, 'squad29-cache'); seedDir(d, 'squad29-cache.tar.gz'); assert.equal(pc(d, ['install-dir', 'squad29-cache.tar.gz', 'squad29-cache']).status, 0);
  fs.mkdirSync(path.join(src, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(src, 'sub/0000001.json.gz'), 'a'); fs.writeFileSync(path.join(src, 'company_tickers.json'), '{"x":1}');
  assert.equal(pc(d, ['stage-dir', 'squad29-cache', 'squad29-cache.tar.gz']).status, 0); const a1 = fs.readFileSync(path.join(d, 'data/squad29-cache.tar.gz'));
  fs.utimesSync(path.join(src, 'sub/0000001.json.gz'), new Date(0), new Date(1e12));
  assert.equal(pc(d, ['stage-dir', 'squad29-cache', 'squad29-cache.tar.gz']).status, 0); assert.deepEqual(fs.readFileSync(path.join(d, 'data/squad29-cache.tar.gz')), a1, 'deterministic bytes');
  fs.rmSync(src, { recursive: true }); assert.equal(pc(d, ['install-dir', 'squad29-cache.tar.gz', 'squad29-cache']).status, 0);
  assert.equal(fs.readFileSync(path.join(src, 'sub/0000001.json.gz'), 'utf8'), 'a'); assert.equal(fs.readFileSync(path.join(src, 'company_tickers.json'), 'utf8'), '{"x":1}');
  fs.symlinkSync('/etc/hostname', path.join(src, 'link')); const r = pc(d, ['stage-dir', 'squad29-cache', 'squad29-cache.tar.gz']); assert.equal(r.status, 1); assert.match(r.stdout, /link or special/);
  fs.rmSync(path.join(src, 'link')); assert.equal(pc(d, ['stage-dir', 'squad29-cache', 'squad29-cache.tar.gz'], { PRIVATE_CACHE_MAX_ENTRIES: '2' }).status, 1);
  assert.deepEqual(fs.readFileSync(path.join(d, 'data/squad29-cache.tar.gz')), a1, 'the previous archive is untouched on a stop');
});
test('admission (Codex 6856898125): stage needs this job\'s successful install of that exact path; failed, absent or over-bound installs revoke it; legacy bytes are set aside unchanged', () => {
  // 1. no install at all: stage refuses and writes nothing
  let d = box(); fs.mkdirSync(path.join(d, 'ev-cache')); fs.writeFileSync(path.join(d, 'ev-cache/events-cache.json.gz'), 'legacy');
  let r = pc(d, ['stage-file', 'ev-cache/events-cache.json.gz', 'events-cache.json.gz']); assert.equal(r.status, 1); assert.match(r.stdout, /not admitted/);
  assert.ok(!fs.existsSync(path.join(d, 'data/events-cache.json.gz')));
  // 2. absent private copy (UNKNOWN) after an earlier admission: the receipt is revoked first, legacy bytes stay at the module path untouched
  fs.writeFileSync(path.join(d, 'data/events-cache.json.gz'), 'priv'); assert.equal(pc(d, ['install-file', 'events-cache.json.gz', 'x/e.gz']).status, 0);
  fs.rmSync(path.join(d, 'data/events-cache.json.gz')); assert.equal(pc(d, ['install-file', 'events-cache.json.gz', 'x/e.gz']).status, 3);
  assert.equal(pc(d, ['stage-file', 'x/e.gz', 'events-cache.json.gz']).status, 1, 'an earlier receipt is not usable after a failed install');
  assert.equal(fs.readFileSync(path.join(d, 'ev-cache/events-cache.json.gz'), 'utf8'), 'legacy');
  // 3. over-bound install revokes; a receipt for one path does not admit another
  fs.writeFileSync(path.join(d, 'data/events-cache.json.gz'), 'priv'); assert.equal(pc(d, ['install-file', 'events-cache.json.gz', 'x/e.gz']).status, 0);
  assert.equal(pc(d, ['stage-file', 'ev-cache/events-cache.json.gz', 'events-cache.json.gz']).status, 1, 'receipt names another path');
  assert.equal(pc(d, ['install-file', 'events-cache.json.gz', 'x/e.gz'], { PRIVATE_CACHE_MAX_BYTES: '1' }).status, 1);
  assert.equal(pc(d, ['stage-file', 'x/e.gz', 'events-cache.json.gz']).status, 1); assert.equal(fs.readFileSync(path.join(d, 'data/events-cache.json.gz'), 'utf8'), 'priv');
  // 4. install over legacy bytes: they move, byte-identical, outside the module path; the installed copy is the private one
  r = pc(d, ['install-file', 'events-cache.json.gz', 'ev-cache/events-cache.json.gz']); assert.equal(r.status, 0); assert.match(r.stdout, /set aside unchanged/);
  assert.equal(fs.readFileSync(path.join(d, 'ev-cache/events-cache.json.gz'), 'utf8'), 'priv');
  const leg = path.join(d, 'rt/private-cache-admitted.legacy'); const lf = fs.readdirSync(leg).filter(n => n.startsWith('events-cache.json.gz.'));
  assert.deepEqual(lf.map(n => fs.readFileSync(path.join(leg, n), 'utf8')).sort(), ['legacy', 'priv'], 'both earlier module-path copies kept unchanged');
  // 5. directory: a non-empty legacy tree is set aside whole (never extracted into); a failed extraction leaves no receipt
  d = box(); const t = path.join(d, 'squad29-cache'); fs.mkdirSync(path.join(t, 'old'), { recursive: true }); fs.writeFileSync(path.join(t, 'old/f'), 'L');
  seedDir(d, 'squad29-cache.tar.gz'); assert.equal(pc(d, ['install-dir', 'squad29-cache.tar.gz', 'squad29-cache']).status, 0);
  assert.deepEqual(fs.readdirSync(t), [], 'installed tree holds only the private archive');
  const ld = path.join(d, 'rt/private-cache-admitted.legacy'); const lt = fs.readdirSync(ld)[0]; assert.equal(fs.readFileSync(path.join(ld, lt, 'old/f'), 'utf8'), 'L');
  fs.writeFileSync(path.join(d, 'data/squad29-cache.tar.gz'), 'not an archive'); assert.equal(pc(d, ['install-dir', 'squad29-cache.tar.gz', 'squad29-cache']).status, 1);
  assert.equal(pc(d, ['stage-dir', 'squad29-cache', 'squad29-cache.tar.gz']).status, 1); assert.equal(fs.readFileSync(path.join(d, 'data/squad29-cache.tar.gz'), 'utf8'), 'not an archive');
  // 6. no job-local admission directory: the helper stops
  r = spawnSync('bash', ['.github/private-cache.sh', 'install-file', 'squad29-cache.tar.gz', 'q'], { cwd: d, encoding: 'utf8', env: { PATH: process.env.PATH } }); assert.equal(r.status, 1); assert.match(r.stdout, /admission directory/);
});
test('install-dir refuses archives with a link, an absolute path or a parent traversal before extracting anything', () => {
  for (const kind of ['link', 'parent', 'abs']) { const d = box(), w = path.join(d, 'w'); fs.mkdirSync(path.join(w, 'in'), { recursive: true }); fs.writeFileSync(path.join(w, 'in/ok.json'), 'ok');
    if (kind === 'link') { fs.symlinkSync('/etc/hostname', path.join(w, 'in/l')); execSync('tar -czf ' + path.join(d, 'data/x.tar.gz') + ' -C ' + path.join(w, 'in') + ' .'); }
    if (kind === 'parent') execSync('tar -czf ' + path.join(d, 'data/x.tar.gz') + ' -C ' + path.join(w, 'in') + ' --transform "s,^\\./ok.json,../evil.json," ./ok.json');
    if (kind === 'abs') execSync('tar -czf ' + path.join(d, 'data/x.tar.gz') + ' -P ' + path.join(w, 'in/ok.json'));
    const r = pc(d, ['install-dir', 'x.tar.gz', 'out']); assert.equal(r.status, 1, kind + ': ' + r.stdout); assert.ok(!fs.existsSync(path.join(d, 'out')), kind + ': nothing extracted'); }
});
test('no workflow keeps an owner-derived cache in the public Actions cache; producers stage before their private save; fm-cache saves drop lane-private files', async () => {
  const yaml = await import('node:module').then(m => m.createRequire(import.meta.url)).catch(() => null);
  const TAINT = (p) => /^(?:ev-cache|squad29-cache)(?:\/|$)/.test(p) || /^fm-cache\/evr-(?:sec|min)\.json\.gz$/.test(p);
  for (const f of fs.readdirSync(WF).filter(x => x.endsWith('.yml'))) { const lines = fs.readFileSync(path.join(WF, f), 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) { if (!/uses: actions\/cache/.test(lines[i])) continue; const save = /cache\/save@/.test(lines[i]);
      // collect this step's path value(s): lines after 'path:' up to the next key at the same or lower indent
      let j = i + 1, paths = []; for (; j < lines.length && j < i + 12; j++) { const m = lines[j].match(/^(\s+)path: ?(.*)$/); if (!m) continue;
        if (m[2] === '|') { const ind = m[1].length; for (let k = j + 1; k < lines.length && (lines[k].match(/^\s*/)[0].length > ind) && lines[k].trim(); k++) paths.push(lines[k].trim()); } else paths.push(m[2].trim()); break; }
      for (const p of paths) assert.ok(!TAINT(p), f + ': owner-derived cache ' + p + ' in the public Actions cache');
      if (save && paths.includes('fm-cache')) { const prev = lines.slice(Math.max(0, i - 8), i + 1).join('\n');
        assert.match(prev, /id: fmx\n[^\n]*\n\s+run: \|\n\s+if \[ -n "\$\(find fm-cache -maxdepth 1 -name 'evr-\*' -print -quit/, f + ': fm-cache save without the lane-private export check');
        assert.match(lines[i - 1], /&& steps\.fmx\.outputs\.export == '1'$/, f + ': fm-cache save not gated on the export check');
        assert.doesNotMatch(prev, /rm -f? ?[^\n]*evr-/, f + ': legacy evr bytes must never be deleted'); } } }
  const sq = fs.readFileSync(path.join(WF, 'squad29-lab.yml'), 'utf8'), eo = fs.readFileSync(path.join(WF, 'event-orb-retest-research.yml'), 'utf8');
  assert.ok(sq.indexOf('stage-dir squad29-cache squad29-cache.tar.gz') < sq.indexOf('private-outputs.sh save "squad29'), 'squad29 stages before its private save');
  assert.ok(eo.indexOf('stage-file fm-cache/$n.json.gz $n.json.gz') < eo.indexOf('private-outputs.sh save'), 'event-orb stages before its private save');
  for (const l of sq.split('\n').filter(l => l.includes('retain-failed "squad29'))) assert.match(l, /squad29-cache\.tar\.gz/);
  for (const l of eo.split('\n').filter(l => l.includes('retain-failed "event-orb'))) assert.match(l, /evr-sec\.json\.gz evr-min\.json\.gz/);
  const priv = fs.readFileSync(path.join(REPO, '.github/private-files.txt'), 'utf8').split('\n'); for (const n of ['events-cache.json.gz', 'evr-sec.json.gz', 'evr-min.json.gz', 'squad29-cache.tar.gz']) assert.ok(priv.includes(n), n + ' is private');
});
