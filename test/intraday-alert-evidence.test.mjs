// R1 rev15 (Codex 6724441072 / 6724603156, N1): the intraday alerts ("Market hours check") make a price claim only on evidence that was
// valid WHEN FETCHED and is still valid WHEN SENT, each route under its EXISTING rule:
//   holding (YOUR POSITION target lines): the holding rule of holdingAction()/quoteEvidence() (5 minutes);
//   plan (BUY NOW cards and the planned-entry review lines: QUICK, LEADER, signal range, breakout trigger, paper trades): the 20-minute
//   BUY NOW gate. Undated or future-dated prices never qualify. A held-back holding alert is reported once as NOT CONFIRMED.
// Synthetic only: the ACTUAL intraday() caller, invented tickers and prices, loopback services, no owner records or real messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { loadScan, blocked } from './load-scan.mjs';

const T = Date.parse('2026-11-05T14:40:00Z');   // Thu 9:40 am New York
const SESSION_SRC = fs.readFileSync(new URL('../market-session.mjs', import.meta.url), 'utf8');
// quotes: SYM -> { c, ageSec } | { c, t } ; advance: SYM -> ms added to the clock once that symbol is fetched (a slow fetch loop)
async function run(t, { pos = {}, sig = {}, quotes, advance = {}, state }) {
  const sent = []; let clock = T;
  const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
    if (req.url.includes('/getUpdates')) return res.end(JSON.stringify({ ok: true, result: [] }));
    if (req.url.includes('/sendMessage')) { sent.push(JSON.parse(b).text); return res.end(JSON.stringify({ ok: true, result: { message_id: sent.length } })); }
    if (req.url.includes('/quote')) { const sym = new URL(req.url, 'http://x').searchParams.get('symbol'), q = quotes[sym];
      const body = !q ? { c: 0, t: 0 } : { c: q.c, t: 't' in q ? q.t : (clock - q.ageSec * 1000) / 1000 };
      if (advance[sym]) clock += advance[sym];
      return res.end(JSON.stringify(body)); }
    res.statusCode = 404; res.end('{}'); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const files = { 'data/my-positions.json': pos, 'data/signals.json': { session: '2026-11-04', stocks: [], quick: [], leaders: [], ...sig }, 'data/tg-state.json': { offset: 42 }, 'market-session.mjs': SESSION_SRC };
  if (state) files['data/alert-state.json'] = state;
  files['data/settings.json'] = { quiet: false };   // paper-trade lines are only sent outside quiet mode
  const S = await loadScan({ files, env: { BOT_ONLY: '', MODE: 'intraday', TG_TOKEN: 'x', TG_CHAT: '1', TG_BASE: base, FH_BASE: base, FINNHUB_KEY: 'x', TD_BASE: base } });
  const real = Date.now; Date.now = () => clock;
  try { await S.fn('intraday')(false); } finally { Date.now = real; }
  const alerts = sent.find(x => /^Market hours check/.test(x)) || '';
  return { sent, alerts, state: JSON.parse(S.read('data/alert-state.json') || '{}') };
}
const HOLD = { ZZT: { entry: 100, t2: 110, stop: 50 } };

test('holding target: a fresh price is sent as TARGET 2 REACHED (timely, eligible)', async t => {
  const r = await run(t, { pos: HOLD, quotes: { ZZT: { c: 115, ageSec: 10 } } });
  assert.match(r.alerts, /ZZT at 115\.00: YOUR POSITION: TARGET 2 REACHED \(110\.00\)\. You bought at 100\.00 \(\+15\.0%\)\./, r.alerts);
});
test('holding target: valid when fetched (290 s) but past the 5-minute rule when sent (+30 s): no target claim, NOT CONFIRMED once, re-checked next run', async t => {
  const r = await run(t, { pos: { ...HOLD, ZZF: { entry: 10, stop: 5 } }, quotes: { ZZT: { c: 115, ageSec: 290 }, ZZF: { c: 12, ageSec: 5 } }, advance: { ZZF: 30000 } });
  assert.doesNotMatch(r.alerts, /TARGET 2 REACHED|ZZT at 115/, r.alerts);
  assert.match(r.alerts, /YOUR POSITION, NOT CONFIRMED: a target check on ZZT \(the latest price is 5 min old \(limit 5 min\)\) used a price that was no longer current/);
  assert.equal(r.state.sent.ZZTmyt2, undefined, 'not marked as sent: a later run with a current price can still send it');
  const again = await run(t, { pos: HOLD, quotes: { ZZT: { c: 115, ageSec: 10 } }, state: r.state });
  assert.match(again.alerts, /ZZT at 115\.00: YOUR POSITION: TARGET 2 REACHED/);
  assert.doesNotMatch(again.alerts, /NOT CONFIRMED/, 'the held-back note is not repeated the same day');
});
test('holding target: future-dated or undated at fetch never makes a target claim', async t => {
  for (const q of [{ c: 115, t: (T + 20000) / 1000 }, { c: 115, t: 0 }]) {
    const r = await run(t, { pos: HOLD, quotes: { ZZT: q } });
    assert.doesNotMatch(r.alerts, /TARGET 2 REACHED/, JSON.stringify(q) + ' ' + r.alerts);
  }
});
test('plan route (paper trade lines, previously unchecked): 20-minute rule at fetch AND at send; undated/future never; fresh is sent', async t => {
  const sig = { openTrades: [{ sym: 'ZZP', since: '2026-11-01', stop: 5, target: 20 }, { sym: 'ZZQ', since: '2026-11-01', stop: 1, target: 99 }] };
  const ok = await run(t, { sig, quotes: { ZZP: { c: 21, ageSec: 60 }, ZZQ: { c: 2, ageSec: 1 } } });
  assert.match(ok.alerts, /ZZP at 21\.00: paper trade from 2026-11-01 reached its target 20\.00\./);
  const late = await run(t, { sig, quotes: { ZZP: { c: 21, ageSec: 1190 }, ZZQ: { c: 2, ageSec: 1 } }, advance: { ZZQ: 30000 } });
  assert.doesNotMatch(late.alerts, /ZZP at 21/, 'valid at fetch (1190 s) but 1220 s when sent: not sent');
  assert.equal(late.state.sent['ZZPtg2026-11-01'], undefined, 'and not marked');
  for (const q of [{ c: 21, t: (T + 20000) / 1000 }, { c: 21, t: 0 }]) {
    const r = await run(t, { sig, quotes: { ZZP: q, ZZQ: { c: 2, ageSec: 1 } } });
    assert.doesNotMatch(r.alerts, /ZZP at 21/, JSON.stringify(q));
  }
});
test('all requests stayed synthetic and on loopback', () => assert.deepEqual(blocked, []));
