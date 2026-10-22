// Seam: earnings-study.mjs run in MODE=study on a fixture price cache (study-cache format: days[d] = { T, o, h, l, c, v } for the stocks
// that pass the 3 USD / 1M USD filter, plus x = the same columns for stocks that fell under it). Output: data/earnings-study.json.
// Guards review S-18 (22 Oct): earnings-study built its prices from the main rows only. A stock bought on an earnings beat that then
// collapsed under 3 USD vanished before its exit, the trade returned null and was DROPPED from the sample (survivorship bias in the one
// rule that drives live buys); the average-stock yardstick dropped such stocks too. The x rows are now used to value exits (never entries),
// as in the other studies.
// Run: node test/earnings-study-dead-stocks.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 120 weekday sessions from 2 Jan 2025
const D = []; for (let t = Date.parse('2025-01-02T12:00:00Z'); D.length < 120; t += 864e5) { const w = new Date(t).getUTCDay(); if (w && w < 6) D.push(new Date(t).toISOString().slice(0, 10)); }
const REACT = 70, ENTRY = 71, GONE = 72;   // earnings reaction day, entry day (next open), first day under 3 USD

function fixture(fillers) {
  const days = {};
  for (let t = 0; t < D.length; t++) {
    const m = { T: [], o: [], h: [], l: [], c: [], v: [] }, x = { T: [], o: [], h: [], l: [], c: [], v: [] };
    const put = (r, s, o, h, l, c) => { r.T.push(s); r.o.push(o); r.h.push(h); r.l.push(l); r.c.push(c); r.v.push(1e6); };
    put(m, 'SPY', 500, 501, 499, 500);
    // AAA: 20 USD; beats by 20% before the open on day 70 and closes +6.5% near the high; bought at the day-71 open (21.40); collapses
    // to 2.60 at the day-72 open (under its stop of 20.30): the trade exits there, at -87.85% before costs
    if (t < REACT) put(m, 'AAA', 20, 20.2, 19.8, 20);
    else if (t === REACT) put(m, 'AAA', 20.5, 21.5, 20.4, 21.3);
    else if (t === ENTRY) put(m, 'AAA', 21.4, 21.8, 21.0, 21.5);
    else put(x, 'AAA', 2.6, 2.7, 2.4, 2.5);
    // fillers: flat at 10 USD; the first tenth collapse to 1 USD from day 72 (x rows only)
    for (let i = 0; i < fillers; i++) { const s = 'F' + String(i).padStart(4, '0'); if (t >= GONE && i < fillers / 10) put(x, s, 1, 1, 1, 1); else put(m, s, 10, 10, 10, 10); }
    days[D[t]] = { ...m, x };
  }
  return { days };
}
function run(fillers) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'earn-test-'));
  fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'data/earnings-cache.json.gz'), zlib.gzipSync(JSON.stringify({ syms: { AAA: [{ d: D[REACT], t: 'bmo', a: 1.2, e: 1.0 }] }, tried: {} })));
  fs.writeFileSync(path.join(dir, 'grouped.json.gz'), zlib.gzipSync(JSON.stringify(fixture(fillers))));
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, MODE: 'study', CACHE: path.join(dir, 'grouped.json.gz') };
  execFileSync(process.execPath, [path.join(REPO, 'earnings-study.mjs')], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = JSON.parse(fs.readFileSync(path.join(dir, 'data/earnings-study.json'), 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

test('a stock that collapses under 3 USD after the buy keeps its trade, valued at its real price (-87.85% - 0.8% cost)', () => {
  const out = run(0);
  assert.equal(out.results.main.newer.n, 1);
  assert.ok(Math.abs(out.results.main.newer.avg - (2.6 / 21.4 - 1 - 0.008)) < 1e-6, String(out.results.main.newer.avg));
});

test('the average-stock yardstick keeps collapsed stocks too: 100 of 1,000 flat stocks fall to 1 USD, so the average stock made -9.08%', () => {
  const out = run(1000);
  // average stock from the day-71 open to the day-72 open: (900 x 0% + 100 x -90% + AAA -87.85%) / 1001 = -9.0787%
  // the trade after costs (-88.65%) minus that = -79.57%
  assert.equal(out.gates.newer.vsAvgStock, -0.7957);
});
