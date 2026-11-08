// Adversarial desired-behaviour reproducers for 730bda07 (R1/R2/R3 residual repair). Synthetic tickers, loopback only.
// Run: REVIEW_TREE=<worktree> node --test break.test.mjs
// Clock advances by ADV ms when ZZB's quote is served (ZZS is fetched first), standing in for fetch latency between fetch and report.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.env.REVIEW_TREE; if (!root) throw Error('set REVIEW_TREE');
const { loadScan, blocked } = await import(pathToFileURL(root + '/test/load-scan.mjs'));
const T = Date.parse('2026-11-05T14:40:00Z');
const SIG = { session: '2026-11-04', stocks: [], quick: [], leaders: [] };
const SESSION_SRC = fs.readFileSync(root + '/market-session.mjs', 'utf8');
async function setup(t, { pos, quotes, adv = 0 }) {
  const sent = [], order = []; let clock = T;
  const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
    if (req.url.includes('/getUpdates')) return res.end(JSON.stringify({ ok: true, result: [] }));
    if (req.url.includes('/sendMessage')) { sent.push(JSON.parse(b).text); return res.end(JSON.stringify({ ok: true, result: { message_id: 1 } })); }
    if (req.url.includes('/quote')) { const sym = new URL(req.url, 'http://x').searchParams.get('symbol'), q = quotes[sym]; order.push(sym);
      if (sym === 'ZZB') clock += adv;
      if (!q) return res.end(JSON.stringify({ c: 0, t: 0 }));
      return res.end(JSON.stringify({ c: q.c, t: Math.floor((T - q.ageSec * 1000) / 1000) })); }
    res.statusCode = 404; res.end('{}'); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const S = await loadScan({ root, files: { 'data/my-positions.json': pos, 'data/signals.json': SIG, 'data/tg-state.json': { offset: 42 }, 'market-session.mjs': SESSION_SRC },
    env: { BOT_ONLY: '', MODE: 'intraday', TG_TOKEN: 'x', TG_CHAT: '1', TG_BASE: base, FH_BASE: base, FINNHUB_KEY: 'x', TD_BASE: base } });
  const real = Date.now; Date.now = () => clock; try { await S.fn('intraday')(false); } finally { Date.now = real; }
  const first = sent.find(x => /FIRST MARKET-HOURS CHECK/.test(x)) || '';
  return { sent, order, first, zzs: (first.match(/^ZZS:.*$/m) || [''])[0], stops: sent.find(x => /^YOUR STOPS/.test(x)) || '', all: sent.join('\n') };
}
const ZZB = { entry: 10, stop: 8 }, ZZBq = { c: 12, ageSec: 30 };

test('a) Codex counterexample: 90 / stop 80, 290 s at fetch, +30 s -> no HOLD/target/% ; STOP STATUS UNKNOWN', async t => {
  const r = await setup(t, { pos: { ZZS: { entry: 100, stop: 80, t1: 85, t2: 88 }, ZZB }, quotes: { ZZS: { c: 90, ageSec: 290 }, ZZB: ZZBq }, adv: 30000 });
  assert.deepEqual(r.order.slice(0, 2), ['ZZS', 'ZZB']);
  console.log('a ZZS:', r.zzs);
  assert.match(r.zzs, /^ZZS: STOP STATUS UNKNOWN/);
  assert.doesNotMatch(r.zzs, /HOLD|TARGET|Target|% from your|Last price|REACHED/);
  assert.doesNotMatch(r.all, /ZZS at \d|STOP LEVEL REACHED: ZZS/);
});
test('a2) 90 / stop 80 / t2 88, 170 s at fetch, +30 s -> fetch-valid but report-stale: PRICE STATUS UNKNOWN in first check, no target', async t => {
  const r = await setup(t, { pos: { ZZS: { entry: 100, stop: 80, t2: 88 }, ZZB }, quotes: { ZZS: { c: 90, ageSec: 170 }, ZZB: ZZBq }, adv: 30000 });
  console.log('a2 ZZS:', r.zzs);
  assert.match(r.zzs, /^ZZS: PRICE STATUS UNKNOWN/);
  assert.doesNotMatch(r.zzs, /: HOLD|Target 2 \(|TARGET|% from your|Last price/);
});
test('a3 (probe, pre-existing path) same run: market-hours alert must not say TARGET 2 REACHED at a price the first check calls unknown', async t => {
  const r = await setup(t, { pos: { ZZS: { entry: 100, stop: 80, t2: 88 }, ZZB }, quotes: { ZZS: { c: 90, ageSec: 170 }, ZZB: ZZBq }, adv: 30000 });
  const al = r.sent.find(x => /^Market hours check/.test(x)) || '';
  console.log('a3 ALERT:', (al.match(/^ZZS.*$/m) || [''])[0]);
  assert.ok(!(/ZZS at 90\.00: YOUR POSITION: TARGET 2 REACHED/.test(al) && /^ZZS: PRICE STATUS UNKNOWN/.test(r.zzs)), 'alert claims a current target at a price the first check rejects, with no observation time');
});
test('b) future-at-fetch (source 20 s ahead), under stop, +30 s -> UNKNOWN everywhere, never REACHED/HOLD/%', async t => {
  const r = await setup(t, { pos: { ZZS: { entry: 100, stop: 80 }, ZZB }, quotes: { ZZS: { c: 70, ageSec: -20 }, ZZB: ZZBq }, adv: 30000 });
  console.log('b ZZS:', r.zzs);
  assert.match(r.zzs, /^ZZS: STOP STATUS UNKNOWN/);
  assert.doesNotMatch(r.all, /STOP LEVEL REACHED: ZZS|ZZS: STOP LEVEL REACHED|ZZS: HOLD|ZZS at \d/);
  assert.doesNotMatch(r.zzs, /% from your|Last price/);
});
test('b2) future-at-fetch above stop, +30 s -> no HOLD', async t => {
  const r = await setup(t, { pos: { ZZS: { entry: 100, stop: 80 }, ZZB }, quotes: { ZZS: { c: 90, ageSec: -20 }, ZZB: ZZBq }, adv: 30000 });
  assert.doesNotMatch(r.zzs, /HOLD|% from your|Last price/);
});
test('c) 4m50s under stop, +30 s -> one verdict: both REACHED (or both UNKNOWN); first-check stop line timed, no %', async t => {
  const r = await setup(t, { pos: { ZZS: { entry: 100, stop: 80 }, ZZB }, quotes: { ZZS: { c: 70, ageSec: 290 }, ZZB: ZZBq }, adv: 30000 });
  console.log('c ZZS:', r.zzs); console.log('c STOPS:', r.stops.replace(/\n+/g, ' | '));
  const fR = /^ZZS: STOP LEVEL REACHED/.test(r.zzs), sR = /STOP LEVEL REACHED: ZZS/.test(r.stops), fU = /^ZZS: STOP STATUS UNKNOWN/.test(r.zzs), sU = /STOP CHECK UNKNOWN: ZZS/.test(r.stops);
  assert.ok((fR && sR) || (fU && sU && !fR && !sR), 'disagreement');
  if (fR) { assert.match(r.zzs, /old when checked at/); assert.doesNotMatch(r.zzs, /% from your/); }
});
test('d) 10 s old under stop, YOUR STOPS emitted after 10 min batching delay -> every observation in the dedicated message is time-qualified', async t => {
  const r = await setup(t, { pos: { ZZS: { entry: 100, stop: 80 }, ZZB }, quotes: { ZZS: { c: 70, ageSec: 10 }, ZZB: ZZBq }, adv: 600000 });
  console.log('d STOPS:', r.stops.replace(/\n+/g, ' | ')); console.log('d ZZS:', r.zzs);
  const blk = r.stops.split(/\n\n/).find(x => /STOP LEVEL REACHED: ZZS/.test(x)) || '';
  assert.ok(blk, 'stop message present');
  assert.match(blk, /^Checked at Nov 5 09:40 New York/, 'observation must carry its check time, not read as current at delivery (09:50)');
  assert.match(r.zzs, /10 s old when checked at Nov 5 09:40/);
  assert.match(r.zzs, /no current price now/);
  assert.doesNotMatch(r.zzs, /% from your/);
});
test('loopback only', () => assert.deepEqual(blocked, []));
