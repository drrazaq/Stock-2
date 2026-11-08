// Independent review reproducers for cf63a04a (dev dependency port). Synthetic tickers, loopback only.
// Run: REVIEW_TREE=<worktree> node --test port-review.test.mjs
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
async function setup(t, { pos, quotes, tgStatus = () => 200 }) {
  const sent = [];
  const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
    if (req.url.includes('/getUpdates')) return res.end(JSON.stringify({ ok: true, result: [] }));
    if (req.url.includes('/sendMessage')) { const txt = JSON.parse(b).text, code = tgStatus(txt); if (code !== 200) { res.statusCode = code; return res.end(JSON.stringify({ ok: false })); } sent.push(txt); return res.end(JSON.stringify({ ok: true, result: { message_id: 1 } })); }
    if (req.url.includes('/quote')) { const sym = new URL(req.url, 'http://x').searchParams.get('symbol'), q = quotes[sym];
      if (!q) return res.end(JSON.stringify({ c: 0, t: 0 }));
      return res.end(JSON.stringify({ c: q.c, t: Math.floor((T - q.ageSec * 1000) / 1000) })); }
    res.statusCode = 404; res.end('{}'); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const S = await loadScan({ root, files: { 'data/my-positions.json': pos, 'data/signals.json': SIG, 'data/tg-state.json': { offset: 42 }, 'market-session.mjs': SESSION_SRC },
    env: { BOT_ONLY: '', MODE: 'intraday', TG_TOKEN: 'x', TG_CHAT: '1', TG_BASE: base, FH_BASE: base, FINNHUB_KEY: 'x', TD_BASE: base } });
  const runOnce = async () => { const real = Date.now; Date.now = () => T; try { await S.fn('intraday')(false); } finally { Date.now = real; } };
  return { S, sent, runOnce };
}
const firstOf = (sent) => sent.filter(x => /FIRST MARKET-HOURS CHECK/.test(x));

test('F1: a 4-minute-old quote under the stop -> same run says STOP STATUS UNKNOWN in the first check AND STOP LEVEL REACHED in YOUR STOPS', async t => {
  const r = await setup(t, { pos: { ZZS: { entry: 100, stop: 80 } }, quotes: { ZZS: { c: 70, ageSec: 240 } } });
  await r.runOnce();
  const first = firstOf(r.sent)[0] || '', stopMsg = r.sent.find(x => /^YOUR STOPS/.test(x)) || '';
  assert.match(first, /ZZS: STOP STATUS UNKNOWN.*limit 3 min/);
  assert.match(stopMsg, /STOP LEVEL REACHED: ZZS/);   // documents the inconsistency (3-min summary vs 5-min STOP gate)
});

test('F2: a quote whose source time was in the FUTURE when fetched becomes a price claim (and a stop-reached claim) in firstCheckText once wall-clock passes it', async t => {
  const r = await setup(t, { pos: {}, quotes: {} });
  const fut = { provider: 'FINNHUB', src: 'finnhub', reportedPrice: 70, t: T + 20000, observedAt: T, status: 'FUTURE_SOURCE_TIME', price: null };
  const atFetch = await r.S.fn('firstCheckText')({ ZZS: { entry: 100, stop: 80 } }, [], { ZZS: fut }, SIG, T);
  assert.match(atFetch, /ZZS: STOP STATUS UNKNOWN.*in the future/);
  const later = await r.S.fn('firstCheckText')({ ZZS: { entry: 100, stop: 80 } }, [], { ZZS: fut }, SIG, T + 30000);
  assert.match(later, /ZZS: STOP LEVEL REACHED.*Last price 70\.00/);   // observation-time status FUTURE_SOURCE_TIME is ignored
});

test('runtime: no-stop holding without valid price is STATUS UNKNOWN; all quotes failing still sends exactly one first check; rerun does not duplicate', async t => {
  const r = await setup(t, { pos: { ZZN: { entry: 20 }, ZZL: { entry: 30, src: 'leader dip', target: 36 } }, quotes: {} });
  await r.runOnce(); await r.runOnce();
  const f = firstOf(r.sent); assert.equal(f.length, 1);
  assert.match(f[0], /\nZZN: STATUS UNKNOWN: .*NO STOP SET/); assert.match(f[0], /\nZZL: STATUS UNKNOWN: .*leader dip/);
  assert.doesNotMatch(f[0], /HOLD|Last price|% from your/);
});

test('runtime: no holdings and no list stays silent', async t => {
  const r = await setup(t, { pos: {}, quotes: {} }); await r.runOnce(); assert.equal(firstOf(r.sent).length, 0);
});

test('delivery: first check refused with HTTP 429 is retried on the next run (not consumed pre-ACK); HTTP 500 is UNKNOWN and not repeated', async t => {
  let fail = 429; const r = await setup(t, { pos: { ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } }, tgStatus: (x) => /FIRST MARKET-HOURS/.test(x) && fail ? fail : 200 });
  await r.runOnce(); assert.equal(firstOf(r.sent).length, 0);
  assert.equal(r.S.readJson('data/alert-state.json').sent.__open, undefined);
  fail = 0; await r.runOnce(); assert.equal(firstOf(r.sent).length, 1);
  const r2 = await setup(t, { pos: { ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } }, tgStatus: (x) => /FIRST MARKET-HOURS/.test(x) && fail ? fail : 200 });
  fail = 500; await r2.runOnce(); fail = 0; await r2.runOnce();
  assert.equal(firstOf(r2.sent).length, 0, 'a 5xx is treated as uncertain: the first check is not resent that day');
  assert.equal(r2.S.readJson('data/alert-state.json').delivery.__open.status, 'UNKNOWN');
});

test('loopback only', () => assert.deepEqual(blocked, []));
