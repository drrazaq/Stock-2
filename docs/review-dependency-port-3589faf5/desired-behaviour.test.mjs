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


const noPriceClaim = /Last price|% from your|: HOLD:/;
test('D-F1a: 4-min quote UNDER stop -> both messages agree STOP LEVEL REACHED; no UNKNOWN/UNVERIFIED; no % from entry', async t => {
  const r = await setup(t, { pos: { ZZS: { entry: 100, stop: 80 } }, quotes: { ZZS: { c: 70, ageSec: 240 } } });
  await r.runOnce();
  const first = firstOf(r.sent)[0] || '', all = r.sent.join('\n');
  assert.match(first, /ZZS: STOP LEVEL REACHED/);
  assert.doesNotMatch(first, /STOP STATUS UNKNOWN|% from your/);
  assert.match(r.sent.find(x => /^YOUR STOPS/.test(x)) || '', /STOP LEVEL REACHED: ZZS/);
  assert.doesNotMatch(all, /PRICE UNVERIFIED|STOP CHECK UNKNOWN/);
});
test('D-F1b: 4-min quote ABOVE stop -> no HOLD, no target, no % from entry, no stop reached', async t => {
  const r = await setup(t, { pos: { ZZS: { entry: 100, stop: 80, t1: 85, t2: 88 } }, quotes: { ZZS: { c: 90, ageSec: 240 } } });
  await r.runOnce();
  const first = firstOf(r.sent)[0] || '', all = r.sent.join('\n');
  assert.match(first, /ZZS: PRICE STATUS UNKNOWN/);
  assert.doesNotMatch(all, /STOP LEVEL REACHED|TARGET|% from your|: HOLD:|Last price/);
});
test('D-F1c: 2-min quote under stop -> REACHED in both, with price evidence', async t => {
  const r = await setup(t, { pos: { ZZS: { entry: 100, stop: 80 } }, quotes: { ZZS: { c: 70, ageSec: 120 } } });
  await r.runOnce();
  assert.match(firstOf(r.sent)[0] || '', /ZZS: STOP LEVEL REACHED.*Last price 70\.00/);
  assert.match(r.sent.find(x => /^YOUR STOPS/.test(x)) || '', /STOP LEVEL REACHED: ZZS/);
});
test('D-F1d: 6-min quote under stop -> UNKNOWN in both routes, never REACHED', async t => {
  const r = await setup(t, { pos: { ZZS: { entry: 100, stop: 80 } }, quotes: { ZZS: { c: 70, ageSec: 360 } } });
  await r.runOnce();
  const all = r.sent.join('\n');
  assert.match(firstOf(r.sent)[0] || '', /ZZS: STOP STATUS UNKNOWN/);
  assert.doesNotMatch(all, /STOP LEVEL REACHED|% from your|Last price/);
});
test('D-F2a: future-at-fetch (status FUTURE_SOURCE_TIME) stays UNKNOWN at T+30s and T+4min (stop and plan line)', async t => {
  const r = await setup(t, { pos: {}, quotes: {} });
  const fut = { provider: 'FINNHUB', src: 'finnhub', reportedPrice: 70, t: T + 20000, observedAt: T, status: 'FUTURE_SOURCE_TIME', priceAgeMs: -20000, price: null };
  for (const dt of [0, 30000, 240000]) {
    const txt = await r.S.fn('firstCheckText')({ ZZS: { entry: 100, stop: 80 } }, [{ sym: 'ZZP', lo: 60, hi: 80 }], { ZZS: fut, ZZP: { ...fut } }, SIG, T + dt);
    assert.match(txt, /ZZS: STOP STATUS UNKNOWN.*in the future/);
    assert.doesNotMatch(txt, /STOP LEVEL REACHED|Last price|last price|INSIDE the range|% from your|: HOLD:/);
  }
});
test('D-F2b: future-at-fetch WITHOUT the status flag but with observedAt still UNKNOWN later', async t => {
  const r = await setup(t, { pos: {}, quotes: {} });
  const fut = { provider: 'FINNHUB', src: 'finnhub', reportedPrice: 70, t: T + 20000, observedAt: T, price: null };
  const txt = await r.S.fn('firstCheckText')({ ZZS: { entry: 100, stop: 80 } }, [], { ZZS: fut }, SIG, T + 30000);
  assert.match(txt, /ZZS: STOP STATUS UNKNOWN/); assert.doesNotMatch(txt, /STOP LEVEL REACHED|Last price/);
});
test('D-F2c: runtime future quote (source 20 s ahead of fetch) -> no stop reached / price claim in any message', async t => {
  const r = await setup(t, { pos: { ZZS: { entry: 100, stop: 80 } }, quotes: { ZZS: { c: 70, ageSec: -20 } } });
  await r.runOnce();
  const all = r.sent.join('\n');
  assert.doesNotMatch(all, /STOP LEVEL REACHED|Last price|% from your|: HOLD:/);
  assert.match(firstOf(r.sent)[0] || '', /ZZS: STOP STATUS UNKNOWN/);
});
test('loopback only', () => assert.deepEqual(blocked, []));
