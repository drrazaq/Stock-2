// Refreshed owner state in the isolated private pass (Codex 6851558974). A second writer (the bot) updates the owner's private store while
// the long nightly runs. The private pass must take the latest holdings ONLY from the authoritative store (no local snapshot presented
// as fresh), never save its stale copy over newer records, never re-add a sold position, and send actionable messages only when the
// holdings, halal marks and settings it rendered are still the store's current ones; otherwise one plain notice. Synthetic stores and
// local git fixtures only; no real private read, no provider call, no Telegram.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { loadScan, blocked } from './load-scan.mjs';
import { PUBLIC_ENV_ALLOW } from '../scan-passes.mjs';   // static: load-scan changes the working directory
const ROOT = path.resolve(import.meta.dirname, '..');
const STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-store-')), HELPER = path.join(STORE, '..', path.basename(STORE) + '-latest.sh');
fs.writeFileSync(HELPER, '#!/bin/bash\n[ -f "$STORE/FAIL" ] && exit 1\n[ -f "$STORE/$1" ] || exit 2\ncp "$STORE/$1" "$2"\n', { mode: 0o755 });
const put = (f, v) => fs.writeFileSync(path.join(STORE, f), JSON.stringify(v));
const P0 = { AAA: { entry: 10, since: '2026-11-01', stop: 9 } }, H0 = { AAA: { s: 'ok' } }, ST0 = { focus: true };
async function pass() { for (const f of fs.readdirSync(STORE)) fs.rmSync(path.join(STORE, f)); put('my-positions.json', P0); put('halal.json', H0); put('settings.json', ST0);
  process.env.STORE = STORE;
  const S = await loadScan({ files: { 'data/my-positions.json': P0, 'data/halal.json': H0, 'data/settings.json': ST0, 'data/signals.json': { session: '2026-11-12' } }, env: { SCAN_PASS: 'private', SCAN_OWNER_REFRESH: HELPER } });
  S.fn('ownerStartCheck')();   // what daily() does first in the private pass
  return S; }
const merge = (S) => { const my = structuredClone(P0); S.fn('mergeNightlyPositions')(structuredClone(P0), my); return my; };
test('unchanged store: holdings merged from the store, actionable send allowed', async () => {
  const S = await pass(); merge(S); assert.deepEqual(S.fn('ownerFreshAtSend')(), { ok: true });
});
test('the bot SOLD a holding before the merge: the store copy is kept and saved, the sold position is never re-added, and tonight\'s assessment (computed from the old holdings) is withheld and its private verdicts labelled stale', async () => {
  const S = await pass(); S.write('data/signals-private.json', { v: 1, session: '2026-11-12', generatedAt: '2026-11-12T21:40:00.000-05:00', posVerdict: { AAA: 'SELL: synthetic' } });
  put('my-positions.json', { BBB: { entry: 5, since: '2026-11-12' } }); const my = merge(S);
  assert.deepEqual(Object.keys(my), ['BBB']); assert.deepEqual(Object.keys(JSON.parse(S.read('data/my-positions.json'))), ['BBB']);
  assert.deepEqual(S.fn('ownerFreshAtSend')(), { ok: false, why: "your holdings changed while tonight's scan ran" });
  assert.equal(JSON.parse(S.read('data/signals-private.json')).ownerStale, true, 'paired private verdicts labelled stale');
});
test('Codex 6852179013 (2): the SAME holding changed (entry/stop) before the merge: fresh bytes kept, assessment withheld', async () => {
  const S = await pass(); put('my-positions.json', { AAA: { entry: 20, since: '2026-11-01', stop: 19 } }); const my = merge(S);
  assert.equal(my.AAA.entry, 20); assert.deepEqual(S.fn('ownerFreshAtSend')(), { ok: false, why: "your holdings changed while tonight's scan ran" });
});
test('Codex 6852179013 (1): DELETED marks or settings in the store are a change (exact, not subset); only scanner migration keys may differ', async () => {
  for (const [f, v, what] of [['halal.json', {}, 'halal marks'], ['settings.json', {}, 'settings']]) {
    put('my-positions.json', P0); const X = await (async () => { for (const g of fs.readdirSync(STORE)) fs.rmSync(path.join(STORE, g)); put('my-positions.json', P0); put('halal.json', H0); put('settings.json', ST0); put(f, v);
      const S = await loadScan({ files: { 'data/my-positions.json': P0, 'data/halal.json': H0, 'data/settings.json': ST0, 'data/signals.json': { session: '2026-11-12' } }, env: { SCAN_PASS: 'private', SCAN_OWNER_REFRESH: HELPER } }); S.fn('ownerStartCheck')(); merge(S); return S; })();
    assert.deepEqual(X.fn('ownerFreshAtSend')(), { ok: false, why: 'your ' + what + " changed before tonight's scan could use them" }); }
  const S = await pass(); merge(S); assert.deepEqual(S.fn('ownerFreshAtSend')(), { ok: true }, 'the copy differs from the store only by scanner migration keys');
});
test('a missing required store record (marks) is UNKNOWN, never assumed unchanged', async () => {
  const S = await pass(); fs.rmSync(path.join(STORE, 'halal.json')); S.value('OWNER_SEEN'); S.fn('ownerStartCheck')();
  assert.deepEqual(S.fn('ownerFreshAtSend')(), { ok: false, why: 'your halal marks could not be confirmed from your private records' });
});
test('a private verdict record labelled ownerStale is never hydrated as current', async () => {
  const { hydrateSignals } = await import(path.join(ROOT, 'signals-read.mjs'));
  const sig = { session: '2026-11-12', generatedAt: '2026-11-12T21:40:00.000-05:00' }, pv = { v: 1, session: sig.session, generatedAt: sig.generatedAt, posVerdict: { AAA: 'SELL: synthetic' } };
  assert.equal(hydrateSignals(sig, () => pv, undefined, () => { throw 0; }).posVerdict.AAA, 'SELL: synthetic');
  const h = hydrateSignals(sig, () => ({ ...pv, ownerStale: true }), undefined, () => { throw 0; }); assert.equal(h.posVerdict, undefined); assert.equal(h.posVerdictUnavailable, true);
});
test('the bot changed holdings AFTER the merge (during rendering): the actionable send stops', async () => {
  const S = await pass(); merge(S); put('my-positions.json', {});
  assert.deepEqual(S.fn('ownerFreshAtSend')(), { ok: false, why: "your holdings changed while tonight's scan ran" });
});
for (const [f, v, what] of [['halal.json', { AAA: { s: 'fail' } }, 'halal marks'], ['settings.json', { focus: false }, 'settings']])
  test('the owner changed ' + what + ' during the scan: the actionable send stops', async () => {
    const S = await pass(); merge(S); put(f, v); assert.deepEqual(S.fn('ownerFreshAtSend')(), { ok: false, why: 'your ' + what + " changed while tonight's scan ran" });
  });
test('store unreadable: holdings UNKNOWN, the stale copy is NOT saved, no local fallback, the actionable send stops', async () => {
  const S = await pass(); fs.writeFileSync(path.join(STORE, 'FAIL'), ''); const before = S.read('data/my-positions.json');
  S.fn('mergeNightlyPositions')(structuredClone(P0), structuredClone(P0));
  assert.equal(S.read('data/my-positions.json'), before, 'stale snapshot not saved'); assert.equal(S.fn('latestPositions')(), null);
  assert.deepEqual(S.fn('ownerFreshAtSend')(), { ok: false, why: 'your holdings could not be refreshed from your private records' });
  fs.rmSync(path.join(STORE, 'FAIL'));
});
test('start check: the store changed between the copy and the start (marks differ from the copy the pass renders): stale; scan-added keys alone are not', async () => {
  let S = await pass(); merge(S); assert.deepEqual(S.fn('ownerFreshAtSend')(), { ok: true }, 'load-scan adds migration keys to the copy: allowed');
  put('halal.json', { AAA: { s: 'fail' } }); S = await (async () => { const X = await loadScan({ files: { 'data/my-positions.json': P0, 'data/halal.json': H0, 'data/settings.json': ST0, 'data/signals.json': { session: '2026-11-12' } }, env: { SCAN_PASS: 'private', SCAN_OWNER_REFRESH: HELPER } }); X.fn('ownerStartCheck')(); merge(X); return X; })();
  assert.deepEqual(S.fn('ownerFreshAtSend')(), { ok: false, why: "your halal marks changed before tonight's scan could use them" });
});
test('daily(): every actionable nightly message sits behind the send-time freshness gate', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scan.mjs'), 'utf8'), g = src.indexOf('const FRESH = ownerFreshAtSend();'), end = src.indexOf("console.log('daily scan done:'", g);
  assert.ok(g > 0 && end > g); const block = src.slice(g, end);
  assert.match(block, /if \(!FRESH\.ok\) \{[^]*ACTIONS NOT SENT TONIGHT[^]*\}\s*else if \(QUIET\(\)\)/);
  for (const k of ['actionsText(', 'planText(', 'holdingsText(', 'WEEKLY REVIEW OF YOUR STOCKS']) assert.ok(block.indexOf(k) > block.indexOf('else if (QUIET())'), k + ' only after the gate');
  assert.equal((src.match(/await actionsText\(/g) || []).length, (block.match(/await actionsText\(/g) || []).length + (src.slice(0, g).match(/await actionsText\(/g) || []).length);
  assert.deepEqual(blocked, []);
});
test('owner-latest.sh in private mode reads the private repository fresh (two writers), never prints contents; absent = 2; unreadable = 1', () => {
  const env = { PATH: process.env.PATH, HOME: os.tmpdir(), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-latest-')), sh = (c, cwd) => execSync(c, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  try {
    const pub = path.join(t, 'pub'); for (const f of ['owner-latest.sh', 'private-data.sh', 'private-files.txt']) { fs.mkdirSync(path.join(pub, '.github'), { recursive: true }); fs.copyFileSync(path.join(ROOT, '.github', f), path.join(pub, '.github', f)); }
    fs.writeFileSync(path.join(pub, '.github/private-data-mode'), ''); fs.mkdirSync(path.join(pub, 'data'));
    sh('git init -q --bare -b main priv.git && git clone -q priv.git seed 2>/dev/null && cd seed && mkdir data && echo \'{"AAA":1}\' > data/my-positions.json && git add -A && git -c commit.gpgsign=false commit -qm s && git push -q origin main', t);
    const run = (f, extra = {}) => spawnSync('bash', ['.github/owner-latest.sh', f, path.join(t, 'out.json')], { cwd: pub, encoding: 'utf8', env: { ...env, PRIVATE_DATA_URL: path.join(t, 'priv.git'), PRIVATE_DATA_DIR: path.join(t, 'clone'), ...extra } });
    let r = run('my-positions.json'); assert.equal(r.status, 0, r.stdout + r.stderr); assert.equal(fs.readFileSync(path.join(t, 'out.json'), 'utf8').trim(), '{"AAA":1}'); assert.doesNotMatch(r.stdout + r.stderr, /AAA/);
    sh('git clone -q priv.git bot 2>/dev/null && cd bot && echo \'{"BBB":2}\' > data/my-positions.json && git -c commit.gpgsign=false commit -qam bot && git push -q', t);   // the second writer
    r = run('my-positions.json'); assert.equal(r.status, 0); assert.equal(fs.readFileSync(path.join(t, 'out.json'), 'utf8').trim(), '{"BBB":2}', 'fresh, not the earlier clone');
    assert.equal(run('halal.json').status, 2, 'absent in the store'); assert.equal(run('../x').status, 1);
    assert.equal(run('my-positions.json', { PRIVATE_DATA_URL: path.join(t, 'missing.git'), PRIVATE_DATA_DIR: path.join(t, 'clone2') }).status, 1, 'unreadable store is UNKNOWN');
    // Codex 6852260667: the existing clone with ANOTHER declared address is never read (fail closed), and is kept as it is
    sh('git init -q --bare -b main other.git', t); fs.rmSync(path.join(t, 'out.json'), { force: true });
    const rr = run('my-positions.json', { PRIVATE_DATA_URL: path.join(t, 'other.git') }); assert.equal(rr.status, 1); assert.match(rr.stdout, /not bound to the declared private repository/);
    assert.ok(!fs.existsSync(path.join(t, 'out.json')), 'nothing read'); assert.doesNotMatch(rr.stdout + rr.stderr, /other\.git|priv\.git/, 'no origin printed'); assert.ok(fs.existsSync(path.join(t, 'clone/.git')), 'clone kept');
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
});
test('scan-passes gives the refresh route to the private pass only; the public environment never carries the private-data token', async () => {
  const sp = fs.readFileSync(path.join(ROOT, 'scan-passes.mjs'), 'utf8');
  assert.match(sp, /SCAN_PASS: 'private', SCAN_OWNER_REFRESH: path\.join\(ROOT, '\.github\/owner-latest\.sh'\)/); assert.doesNotMatch(sp.slice(sp.indexOf("SCAN_PASS: 'public'") - 200, sp.indexOf("SCAN_PASS: 'public'") + 200), /SCAN_OWNER_REFRESH/);
  assert.ok(!PUBLIC_ENV_ALLOW.includes('PRIVATE_DATA_TOKEN') && !PUBLIC_ENV_ALLOW.includes('SCAN_OWNER_REFRESH'));
});
