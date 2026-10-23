// Seam: the discovery2.mjs program on a small synthetic whole-market cache (no network; every side source absent, D2_ALLOW_MISSING=1).
//   - it finds the planted pattern (a 5x volume day on a down close before a +28% run) among the top rules
//   - the frozen pool does NOT depend on the newer half: the same cache with every session from 2024-01-01 scrambled freezes the same pool
//   - each frozen rule is tested once on the newer half, written to the library with its spec, and the live file is written
//   - a second run keeps the frozen pool and the frozen verdicts (firstRun) and adds no batch within 6 days
// Run: node test/discovery2-run.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function sessions() { const out = []; for (let d = new Date('2021-10-12T12:00:00Z'); d <= new Date('2026-03-31T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) { const w = d.getUTCDay(); if (w && w < 6) out.push(d.toISOString().slice(0, 10)); } return out; }
function makeCache(scrambleNewer) {
  // one random stream per stock (and a second one for the scrambled newer half), so the older half is identical in both caches
  const D = sessions(); let x = 0, y = 0; const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648, rnd2 = () => (y = (y * 1103515245 + 12345) % 2147483648) / 2147483648;
  const NSYM = 160, rows = D.map(() => ({ T: [], o: [], h: [], l: [], c: [], v: [] })), sic = {};
  for (let s = 0; s < NSYM; s++) { const sym = 'S' + String(s).padStart(3, '0'); sic[sym] = { c: s % 2 ? '2834' : '7372' }; x = 12345 + s * 7919; y = 999 + s * 104729; let p = 10 + rnd() * 30, boost = 0;
    for (let t = 0; t < D.length; t++) { const R = () => { const a = rnd(); return scrambleNewer && D[t] >= '2024-01-01' ? rnd2() : a; }; let v = 1e6 * (0.8 + R() * 0.4), up = (R() - 0.5) * 0.03, burst = false;
      if (boost > 0) { up = 0.025; boost--; } else if (R() < 0.004) { burst = true; boost = 10; v *= 5; up = -0.02; }   // planted: a volume burst on a down day, then +2.5% a day for 10 sessions
      const o = p * (1 + (R() - 0.5) * 0.005); p = Math.max(3.5, p * (1 + up)); const hi = Math.max(o, p) * (1 + R() * 0.01), lo = Math.min(o, p) * (1 - R() * 0.01);
      const r = rows[t]; r.T.push(sym); r.o.push(+o.toFixed(4)); r.h.push(+hi.toFixed(4)); r.l.push(+lo.toFixed(4)); r.c.push(+p.toFixed(4)); r.v.push(Math.round(v)); } }
  // SPY
  x = 4242; y = 2424; let sp = 400; for (let t = 0; t < D.length; t++) { const R = () => { const a = rnd(); return scrambleNewer && D[t] >= '2024-01-01' ? rnd2() : a; }; sp *= 1 + (R() - 0.48) * 0.01; const r = rows[t]; r.T.push('SPY'); r.o.push(sp); r.h.push(sp * 1.003); r.l.push(sp * 0.997); r.c.push(sp); r.v.push(5e7); }
  const days = {}; D.forEach((d, t) => { days[d] = rows[t]; }); return zlib.gzipSync(JSON.stringify({ days, sic }));
}
const lib = { note: 'x', updated: '2026-10-23', strategies: [{ id: 'X1', name: 'existing', status: 'tested: rejected' }] };
function runIn(dir, cache) {
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true }); fs.mkdirSync(path.join(dir, 'study-cache'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'study-cache/grouped.json.gz'), cache);
  if (!fs.existsSync(path.join(dir, 'data/strategy-library.json'))) fs.writeFileSync(path.join(dir, 'data/strategy-library.json'), JSON.stringify(lib));
  return execFileSync(process.execPath, [path.join(REPO, 'discovery2.mjs')], { cwd: dir, env: { PATH: process.env.PATH, D2_ALLOW_MISSING: '1' }, encoding: 'utf8', maxBuffer: 1 << 26 });
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'd2-'));
const A = tmp(), B = tmp();
let logA = '';
test('runs on a synthetic cache: finds the planted volume burst (a 5x volume day on a down close before a +28% run), freezes 10 rules, tests them once on the newer half', () => {
  logA = runIn(A, makeCache(false));
  const o = JSON.parse(fs.readFileSync(path.join(A, 'data/discovery2.json'), 'utf8'));
  assert.equal(o.status, 'OK', logA.slice(-2000));
  assert.ok(o.discovery.funnel.R10.runners > 50, 'runners ' + JSON.stringify(o.discovery.funnel));
  assert.ok(o.pool.length >= 10); assert.equal(o.batches.length, 1); assert.equal(o.batches[0].bar, 2.58); assert.equal(o.testedTotal, 10);
  const top3 = o.pool.slice(0, 3).flatMap(r => r.conds.map(c => c.f)); assert.ok(top3.some(f => ['vNow', 'v3'].includes(f)), 'top features ' + top3.join(','));
  assert.equal(Object.keys(o.results).length, 10);
  for (const r of Object.values(o.results)) assert.ok(r.newer && 'n' in r.newer && r.bar === 2.58);
  for (const t of Object.values(o.trades).flat()) assert.ok(t.buy >= '2024-01-01', 'a test trade before the split: ' + t.buy);
  const L = JSON.parse(fs.readFileSync(path.join(A, 'data/strategy-library.json'), 'utf8'));
  const e = L.strategies.find(x => x.id === 'D2-001'); assert.ok(e); assert.match(e.explain, /frozen .* BEFORE any newer-half session was read/); assert.match(e.explain, /hold (10|60) sessions, stop 15%/);
  assert.equal(L.strategies.filter(x => /^D2-/.test(x.id)).length, 10); assert.ok(L.strategies.find(x => x.id === 'X1'));
  const td = JSON.parse(fs.readFileSync(path.join(A, 'data/discovery2-today.json'), 'utf8')); assert.ok(Array.isArray(td.buys) && td.sessions.length > 60);
  assert.ok(o.costReality && o.diagnosis);
});

test('the frozen pool does not depend on the newer half (every session from 2024-01-01 scrambled -> the same pool)', () => {
  runIn(B, makeCache(true));
  const a = JSON.parse(fs.readFileSync(path.join(A, 'data/discovery2.json'), 'utf8')), b = JSON.parse(fs.readFileSync(path.join(B, 'data/discovery2.json'), 'utf8'));
  assert.deepEqual(b.pool.map(r => r.spec), a.pool.map(r => r.spec));
  assert.notDeepEqual(b.trades, a.trades);   // the newer half really differs
});

test('a second run keeps the frozen pool and verdicts and adds no batch within 6 days', () => {
  const before = JSON.parse(fs.readFileSync(path.join(A, 'data/discovery2.json'), 'utf8'));
  runIn(A, makeCache(true));   // even with different newer-half prices
  const after = JSON.parse(fs.readFileSync(path.join(A, 'data/discovery2.json'), 'utf8'));
  assert.deepEqual(after.pool, before.pool); assert.equal(after.batches.length, 1); assert.equal(after.frozenAt, before.frozenAt);
  for (const [k, r] of Object.entries(before.firstRun ? before.firstRun.results : {})) assert.deepEqual(after.firstRun.results[k], r);
});
