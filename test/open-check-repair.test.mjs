// Open-check repair (6 Nov 2026). Synthetic fixtures only: invented tickers and prices, loopback services, no owner records,
// credentials, provider requests or real messages. Every case runs the ACTUAL intraday() caller (the scanner's market-hours check).
// 1 one holding action: a nightly exit (posVerdict, a trend exit included) is never shown as HOLD, and agrees with ACTIONS (planText)
// 2 a price-based stop claim needs ticker-bound, dated, fresh evidence; stale, undated or missing prices are UNKNOWN, never HOLD
// 3 no "PROVEN BUYS" label and no timing promise; a late first run shows its actual time and says it did not observe the open
// 4 the regular NYSE close (4:00 pm, 1:00 pm on early-close days) is kept apart from the watcher's configured 3:00 pm cutoff
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { loadScan, blocked } from './load-scan.mjs';

const AT = (iso) => Date.parse(iso);
const ON_TIME = AT('2026-11-05T14:40:00Z');   // Thu 9:40 am New York (winter time)
const LATE = AT('2026-11-06T19:57:00Z');      // Fri 2:57 pm New York, the 6 Nov pattern
const EARLY_CLOSE = AT('2026-11-27T15:00:00Z');   // Fri 27 Nov 10:00 am New York, NYSE early close 1:00 pm
const SIG = { session: '2026-11-04', stocks: [], quick: [], leaders: [], posVerdict: { ZZG: 'it closed under its 50 day average, the trend is broken.' } };

// quotes: { SYM: { c, ageSec } | { c, t: 0 } | null }, served as Finnhub /quote responses
// the reviewed NYSE calendar is loaded by scan.mjs at run time (dynamic import), so the fixture folder gets the repository's copy
const SESSION_SRC = fs.readFileSync(new URL('../market-session.mjs', import.meta.url), 'utf8');
async function run(t, { now = ON_TIME, pos, quotes, sig = SIG, calendar = true }) {
  const sent = [];
  const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
    if (req.url.includes('/getUpdates')) return res.end(JSON.stringify({ ok: true, result: [] }));
    if (req.url.includes('/sendMessage')) { sent.push(JSON.parse(b).text); return res.end(JSON.stringify({ ok: true, result: { message_id: 1 } })); }
    if (req.url.includes('/quote')) { const sym = new URL(req.url, 'http://x').searchParams.get('symbol'), q = quotes[sym];
      if (!q) return res.end(JSON.stringify({ c: 0, t: 0 }));
      return res.end(JSON.stringify({ c: q.c, t: 't' in q ? q.t : Math.floor((now - q.ageSec * 1000) / 1000) })); }
    res.statusCode = 404; res.end('{}'); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const files = { 'data/my-positions.json': pos, 'data/signals.json': sig, 'data/tg-state.json': { offset: 42 } }; if (calendar) files['market-session.mjs'] = SESSION_SRC;
  const S = await loadScan({ files,
    env: { BOT_ONLY: '', MODE: 'intraday', TG_TOKEN: 'x', TG_CHAT: '1', TG_BASE: base, FH_BASE: base, FINNHUB_KEY: 'x', TD_BASE: base } });
  const real = Date.now; Date.now = () => now;
  try { await S.fn('intraday')(false); } finally { Date.now = real; }
  const first = sent.find(x => /FIRST MARKET-HOURS CHECK|MARKET OPEN CHECK/.test(x)) || '';
  return { sent, first, S, line: (sym) => first.split('\n').find(l => l.startsWith(sym + ' ') || l.startsWith(sym + ':')) || '' };
}

test('conflicting exits: last night\'s trend exit is SELL in the first check, never HOLD, and agrees with ACTIONS', async t => {
  const pos = { ZZG: { entry: 6, stop: 1.98, kind: 'leader', since: '2026-10-20' } };
  const r = await run(t, { pos, quotes: { ZZG: { c: 3.77, ageSec: 20 } } });
  const l = r.line('ZZG');
  assert.match(l, /^ZZG: SELL: last night's exit rule, it closed under its 50 day average, the trend is broken\./);
  assert.doesNotMatch(l, /HOLD/);
  assert.match(l, /Last price 3\.77 \(FINNHUB, Nov 5 09:39 New York, 20 s old\) \(-37\.2% from your 6\.00\)/);
  // the same holding in ACTIONS (planText, unchanged) is a SELL from the same nightly verdict
  const actions = r.S.fn('planText')(SIG, pos, { ZZG: 3.77 });
  assert.match(actions, /ZZG: SELL at the close or next open\. It closed under its 50 day average, the trend is broken\./);
  assert.equal(r.S.readJson('data/my-positions.json').ZZG.stop, 1.98, 'stop unchanged');
});

test('stop reached on fresh evidence takes precedence over a nightly exit, as in ACTIONS', async t => {
  const r = await run(t, { pos: { ZZG: { entry: 6, stop: 4, kind: 'leader', since: '2026-10-20' } }, quotes: { ZZG: { c: 3.77, ageSec: 20 } } });
  assert.match(r.line('ZZG'), /^ZZG: STOP LEVEL REACHED: at or below your stop 4\.00\. If your broker stop order has filled, you are already out: do not sell again\./);
});

test('stale quote under the stop: UNKNOWN in the first check (not a hit, not HOLD), and STOP CHECK UNKNOWN from the stop route', async t => {
  const r = await run(t, { pos: { ZZS: { entry: 100, stop: 80 } }, quotes: { ZZS: { c: 70, ageSec: 30 * 60 } } });
  const l = r.line('ZZS');
  assert.match(l, /^ZZS: STOP STATUS UNKNOWN: no exit rule is active, but whether your stop 80\.00 was reached cannot be confirmed right now/);
  assert.match(l, /Current price UNKNOWN \(the latest price is 30 min old \(limit 5 min\)\)/);
  assert.doesNotMatch(l, /REACHED|HOLD|% from your/);
  assert.match(r.sent.find(x => /STOP CHECK UNKNOWN/.test(x)) || '', /ZZS: the latest price is 30 min old/);
  assert.equal(r.sent.filter(x => /STOP LEVEL REACHED|STOP LOSS REACHED/.test(x)).length, 0);
});

test('undated quote and a holding with no price at all are UNKNOWN and still listed (never dropped)', async t => {
  const r = await run(t, { pos: { ZZU: { entry: 50, stop: 40 }, ZZN: { entry: 20, stop: 15 }, ZZF: { entry: 10, stop: 8 } },
    quotes: { ZZU: { c: 39, t: 0 }, ZZF: { c: 12, ageSec: 30 } } });
  assert.match(r.line('ZZU'), /^ZZU: STOP STATUS UNKNOWN.*Current price UNKNOWN \(the price has no source timestamp\)/);
  assert.match(r.line('ZZN'), /^ZZN: STOP STATUS UNKNOWN.*Current price UNKNOWN \(no valid price\)/);
  assert.match(r.line('ZZF'), /^ZZF: HOLD: no exit rule is active; above your stop 8\.00\. Last price 12\.00 \(FINNHUB, Nov 5 09:39 New York, 30 s old\)/);
});

test('delayed startup: a 2:57 pm first run shows its actual time and says it did not observe the open', async t => {
  const r = await run(t, { now: LATE, pos: { ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.match(r.first, /^TODAY'S FIRST MARKET-HOURS CHECK, run at 2:57 pm New York \(22:57 Kuwait\)\. The system is running\./);
  assert.match(r.first, /LATE: this is the first check that reached this point today, so it did NOT observe the open\. The market opened at 9:30 am New York \(5:30 pm Kuwait\), 5 h 27 min before this check\./);
  assert.doesNotMatch(r.first, /MARKET OPEN CHECK/);
  const ok = await run(t, { now: ON_TIME, pos: { ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.match(ok.first, /run at 9:40 am New York \(17:40 Kuwait\)/); assert.doesNotMatch(ok.first, /LATE|did NOT observe/);
});

test('labels and promises: no PROVEN BUYS, no "the moment", no fixed 30-minute promise; buy lines need fresh evidence', async t => {
  const r = await run(t, { pos: { ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.doesNotMatch(r.first, /PROVEN BUYS|the moment|I check every 30 minutes/);
  assert.match(r.first, /BUY LIST FROM LAST NIGHT'S SCAN \(the rules are NOT PROVEN; a line is a buy only while its price is INSIDE its range\)/);
  assert.match(r.first, /none\. Nothing qualified in last night's scan\. New buy candidates are chosen only by the nightly scan, never during the day\./);
  assert.match(r.first, /scheduled every 30 minutes while the market is open, but GitHub can start them late or skip them, so no exact time is promised/);
});

test('close statement: the regular 4:00 pm NYSE close is kept apart from the watcher\'s 3:00 pm cutoff; early-close days use 1:00 pm', async t => {
  const r = await run(t, { pos: { ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.match(r.first, /Regular NYSE session today: 9:30 am to 4:00 pm New York \(5:30 pm to 12 am Kuwait\)\. The live watcher’s configured window ends at 3:00 pm New York, 60 minutes before the close; the last part of the session is not watched live\./);
  const e = await run(t, { now: EARLY_CLOSE, pos: { ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.match(e.first, /Regular NYSE session today: 9:30 am to 1:00 pm New York \(5:30 pm to 9 pm Kuwait\)\. The live watcher’s configured window ends at 3:00 pm New York\./);
  const u = await run(t, { calendar: false, pos: { ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.match(u.first, /Regular session hours today: UNKNOWN \(the NYSE calendar could not be read\)\./); assert.doesNotMatch(u.first, /4:00 pm/);
});

test('records untouched: positions and Telegram offset unchanged; one first check a day', async t => {
  const pos = { ZZF: { entry: 10, stop: 8 } };
  const r = await run(t, { pos, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.deepEqual(r.S.readJson('data/my-positions.json'), pos); assert.equal(r.S.readJson('data/tg-state.json').offset, 42);
  assert.equal(r.S.readJson('data/alert-state.json').sent.__open, 1);
  assert.equal(r.sent.filter(x => /FIRST MARKET-HOURS CHECK/.test(x)).length, 1);
});

test('8 Nov review: a no-stop leader-dip holding with no valid price is STATUS UNKNOWN (never HOLD) when another holding triggers the check', async t => {
  const r = await run(t, { pos: { ZZN: { entry: 20, src: 'leader dip', target: 24 }, ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.match(r.line('ZZN'), /^ZZN: STATUS UNKNOWN: no exit rule is active from last night, but the current price cannot be confirmed right now \(leader dip, no stop by design; check whether your sell limit 24\.00 has filled\)/);
  assert.doesNotMatch(r.line('ZZN'), /HOLD/);
  assert.match(r.line('ZZF'), /^ZZF: HOLD: no exit rule is active; above your stop 8\.00/, 'the priced holding is unaffected');
  const c = await run(t, { pos: { ZZN: { entry: 20, src: 'leader dip', target: 24 } }, quotes: { ZZN: { c: 21, ageSec: 30 } } });
  assert.match(c.line('ZZN'), /^ZZN: HOLD: no exit rule is active; leader dip, no stop by design, sell limit 24\.00\. Last price 21\.00/, 'control: with fresh evidence it is still HOLD');
  const ns = await run(t, { pos: { ZZM: { entry: 5 }, ZZF: { entry: 10, stop: 8 } }, quotes: { ZZF: { c: 12, ageSec: 30 } } });
  assert.match(ns.line('ZZM'), /^ZZM: STATUS UNKNOWN: .*; NO STOP SET;/, 'an ordinary holding without a stop too');
});

test('8 Nov review: when EVERY holding quote is missing the first check is still sent and lists each holding as UNKNOWN', async t => {
  const r = await run(t, { pos: { ZZN: { entry: 20, stop: 15 }, ZZL: { entry: 30, src: 'leader dip', target: 36 } }, quotes: {} });
  assert.match(r.first, /^TODAY'S FIRST MARKET-HOURS CHECK/);
  assert.match(r.line('ZZN'), /^ZZN: STOP STATUS UNKNOWN/); assert.match(r.line('ZZL'), /^ZZL: STATUS UNKNOWN/);
  assert.equal(r.sent.filter(x => /FIRST MARKET-HOURS CHECK/.test(x)).length, 1);
  const none = await run(t, { pos: {}, quotes: {} });
  assert.equal(none.first, '', 'no holdings and no prices: nothing to report (unchanged)');
});

// rev10 (Codex 6720355907, reproduced on rev9 0663f337): ZZS's quote is stamped 20 s in the FUTURE when fetched; fetching the second
// holding moves the clock 30 s on. Rev9's first check then said "STOP LEVEL REACHED ... 10 s old" while the same run's stop route said
// STOP CHECK UNKNOWN. With the observation-time latch both stay UNKNOWN and the reason says when it was judged.
test('rev10: a quote future-dated when fetched stays UNKNOWN after the clock moves on (actual intraday caller; no contradiction with the stop route)', async t => {
  const T = ON_TIME, sent = []; let clock = T, quotes = 0;
  const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
    if (req.url.includes('/getUpdates')) return res.end(JSON.stringify({ ok: true, result: [] }));
    if (req.url.includes('/sendMessage')) { sent.push(JSON.parse(b).text); return res.end(JSON.stringify({ ok: true, result: { message_id: sent.length } })); }
    if (req.url.includes('/quote')) { quotes++; const sym = new URL(req.url, 'http://x').searchParams.get('symbol');
      if (sym === 'ZZS') return res.end(JSON.stringify({ c: 70, t: (T + 20000) / 1000 }));
      clock = T + 30000; return res.end(JSON.stringify({ c: 12, t: (T - 30000) / 1000 })); }
    res.statusCode = 404; res.end('{}'); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const S = await loadScan({ files: { 'data/my-positions.json': { ZZS: { entry: 100, stop: 80 }, ZZF: { entry: 10, stop: 8 } }, 'data/signals.json': { session: '2026-11-04', stocks: [], quick: [], leaders: [] }, 'data/tg-state.json': { offset: 42 }, 'market-session.mjs': SESSION_SRC },
    env: { BOT_ONLY: '', MODE: 'intraday', TG_TOKEN: 'x', TG_CHAT: '1', TG_BASE: base, FH_BASE: base, FINNHUB_KEY: 'x', TD_BASE: base } });
  const real = Date.now; Date.now = () => clock;
  try { await S.fn('intraday')(false); } finally { Date.now = real; }
  assert.equal(quotes, 2, 'both holdings were fetched, ZZS first');
  const first = sent.find(x => /FIRST MARKET-HOURS CHECK/.test(x)) || '', stop = sent.find(x => /^YOUR STOPS/.test(x)) || '';
  const zzs = first.split('\n').find(l => l.startsWith('ZZS:')) || '';
  assert.match(zzs, /^ZZS: STOP STATUS UNKNOWN/, zzs); assert.match(zzs, /the price timestamp was in the future when fetched/);
  assert.doesNotMatch(first, /STOP LEVEL REACHED|ZZS:.*Last price 70|ZZS:.*% from your/, 'no price claim and no stop reached from a future-at-fetch quote');
  assert.match(stop, /STOP CHECK UNKNOWN: ZZS: the price timestamp is in the future/, 'the stop route says UNKNOWN in the same run');
  // the other holding, fetched after the clock moved, is judged normally (30 s old at fetch, fresh)
  assert.match(first.split('\n').find(l => l.startsWith('ZZF:')) || '', /^ZZF: HOLD: no exit rule is active; above your stop 8\.00\. Last price 12\.00/);
});

// rev11 (review of Codex's corrected development port, R1): ZZS's quote is 4 min 50 s old when fetched and under the stop; fetching the
// next holding moves the clock 30 s. The stop route judges at fetch (REACHED); the first check must reach the same verdict on the same
// quote instead of re-ageing it past the 5-minute limit (which said STOP STATUS UNKNOWN in the same run).
test('rev11: a stop quote near the 5-minute limit gets ONE verdict in both messages of the same run (judged at fetch time)', async t => {
  const T = ON_TIME, sent = []; let clock = T;
  const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
    if (req.url.includes('/getUpdates')) return res.end(JSON.stringify({ ok: true, result: [] }));
    if (req.url.includes('/sendMessage')) { sent.push(JSON.parse(b).text); return res.end(JSON.stringify({ ok: true, result: { message_id: sent.length } })); }
    if (req.url.includes('/quote')) { const sym = new URL(req.url, 'http://x').searchParams.get('symbol');
      if (sym === 'ZZS') return res.end(JSON.stringify({ c: 70, t: (T - 290000) / 1000 }));
      clock = T + 30000; return res.end(JSON.stringify({ c: 12, t: (T + 25000) / 1000 })); }
    res.statusCode = 404; res.end('{}'); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const S = await loadScan({ files: { 'data/my-positions.json': { ZZS: { entry: 100, stop: 80 }, ZZF: { entry: 10, stop: 8 } }, 'data/signals.json': { session: '2026-11-04', stocks: [], quick: [], leaders: [] }, 'data/tg-state.json': { offset: 42 }, 'market-session.mjs': SESSION_SRC },
    env: { BOT_ONLY: '', MODE: 'intraday', TG_TOKEN: 'x', TG_CHAT: '1', TG_BASE: base, FH_BASE: base, FINNHUB_KEY: 'x', TD_BASE: base } });
  const real = Date.now; Date.now = () => clock;
  try { await S.fn('intraday')(false); } finally { Date.now = real; }
  const first = sent.find(x => /FIRST MARKET-HOURS CHECK/.test(x)) || '', stop = sent.find(x => /^YOUR STOPS/.test(x)) || '';
  assert.match(stop, /STOP LEVEL REACHED[\s\S]*ZZS|ZZS[\s\S]*STOP LEVEL REACHED/, 'the stop route judged the quote at fetch: reached');
  const zzs = first.split('\n').find(l => l.startsWith('ZZS:')) || '';
  assert.match(zzs, /^ZZS: STOP LEVEL REACHED/, 'the first check agrees with the stop route: ' + zzs);
  assert.doesNotMatch(first, /ZZS: STOP STATUS UNKNOWN/);
});

// rev12 (Codex 6722848900, reproduced on rev11 8567fd46): ZZS 90 with stop 80, 290 s old when fetched; the next fetch moves the clock 30 s,
// so the price is 320 s old when the first check is written. Rev11 froze the fetch-time verdict and said "HOLD ... above your stop 80 ...
// 5 min old". A current-price claim must still pass its gate at report time; only a stop REACHED is kept as a timed fetch-time observation.
async function twoHoldingRun(t, zzs) {
  const T = ON_TIME, sent = []; let clock = T;
  const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
    if (req.url.includes('/getUpdates')) return res.end(JSON.stringify({ ok: true, result: [] }));
    if (req.url.includes('/sendMessage')) { sent.push(JSON.parse(b).text); return res.end(JSON.stringify({ ok: true, result: { message_id: sent.length } })); }
    if (req.url.includes('/quote')) { const sym = new URL(req.url, 'http://x').searchParams.get('symbol');
      if (sym === 'ZZS') return res.end(JSON.stringify({ c: zzs.c, t: (T - zzs.ageSec * 1000) / 1000 }));
      clock = T + 30000; return res.end(JSON.stringify({ c: 12, t: (T + 25000) / 1000 })); }
    res.statusCode = 404; res.end('{}'); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const S = await loadScan({ files: { 'data/my-positions.json': { ZZS: { entry: 100, stop: 80, t1: 85 }, ZZF: { entry: 10, stop: 8 } }, 'data/signals.json': { session: '2026-11-04', stocks: [], quick: [], leaders: [] }, 'data/tg-state.json': { offset: 42 }, 'market-session.mjs': SESSION_SRC },
    env: { BOT_ONLY: '', MODE: 'intraday', TG_TOKEN: 'x', TG_CHAT: '1', TG_BASE: base, FH_BASE: base, FINNHUB_KEY: 'x', TD_BASE: base } });
  const real = Date.now; Date.now = () => clock;
  try { await S.fn('intraday')(false); } finally { Date.now = real; }
  const first = sent.find(x => /FIRST MARKET-HOURS CHECK/.test(x)) || '';
  return { first, stop: sent.find(x => /^YOUR STOPS/.test(x)) || '', zzs: first.split('\n').find(l => l.startsWith('ZZS:')) || '' };
}
test('rev12: a price valid when fetched but past its gate when the check is written is never HOLD, a target or % from entry (actual caller)', async t => {
  const r = await twoHoldingRun(t, { c: 90, ageSec: 290 });
  assert.match(r.zzs, /^ZZS: STOP STATUS UNKNOWN/, r.zzs);
  assert.match(r.zzs, /latest price is 5 min old \(limit 5 min\)/);
  assert.doesNotMatch(r.first, /ZZS: HOLD|ZZS: TARGET|ZZS:.*Last price 90|ZZS:.*% from your/);
  assert.equal(r.stop, '', 'above the stop at fetch: the stop route sends nothing, so nothing contradicts the UNKNOWN line');
});
test('rev12: the 4 min 50 s stop observation stays REACHED in both messages, shown with when it was checked and that no current price remains', async t => {
  const r = await twoHoldingRun(t, { c: 70, ageSec: 290 });
  assert.match(r.stop, /STOP LEVEL REACHED[\s\S]*ZZS|ZZS[\s\S]*STOP LEVEL REACHED/);
  assert.match(r.zzs, /^ZZS: STOP LEVEL REACHED/, r.zzs);
  assert.match(r.zzs, /5 min old when checked at Nov 5 09:40 New York; no current price now: the latest price is 5 min old \(limit 5 min\)/);
  assert.doesNotMatch(r.zzs, /% from your/, 'no current-price claim from an observation that is no longer current');
});

// rev14 (Codex 6723732821 B4): the YOUR STOPS batch is sent after all fetches. Fetched 10 s old at 09:40, sent at 09:50: the stop observation
// keeps its own time ("10 s old when checked at ...") and, no longer current, drops the entry % and says so. Sent promptly, it stays current.
test('rev14: the dedicated stop batch states when the price was checked; after a long batch delay it is not presented as a current price', async t => {
  const T = ON_TIME, sent = []; let clock = T;
  const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
    if (req.url.includes('/getUpdates')) return res.end(JSON.stringify({ ok: true, result: [] }));
    if (req.url.includes('/sendMessage')) { sent.push(JSON.parse(b).text); return res.end(JSON.stringify({ ok: true, result: { message_id: sent.length } })); }
    if (req.url.includes('/quote')) { const sym = new URL(req.url, 'http://x').searchParams.get('symbol');
      if (sym === 'ZZS') return res.end(JSON.stringify({ c: 70, t: (T - 10000) / 1000 }));
      clock = T + 600000; return res.end(JSON.stringify({ c: 12, t: (T + 590000) / 1000 })); }
    res.statusCode = 404; res.end('{}'); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const S = await loadScan({ files: { 'data/my-positions.json': { ZZS: { entry: 100, stop: 80 }, ZZF: { entry: 10, stop: 8 } }, 'data/signals.json': { session: '2026-11-04', stocks: [], quick: [], leaders: [] }, 'data/tg-state.json': { offset: 42 }, 'market-session.mjs': SESSION_SRC },
    env: { BOT_ONLY: '', MODE: 'intraday', TG_TOKEN: 'x', TG_CHAT: '1', TG_BASE: base, FH_BASE: base, FINNHUB_KEY: 'x', TD_BASE: base } });
  const real = Date.now; Date.now = () => clock;
  try { await S.fn('intraday')(false); } finally { Date.now = real; }
  const stop = sent.find(x => /^YOUR STOPS/.test(x)) || '';
  assert.match(stop, /STOP LEVEL REACHED: ZZS traded at or below your stop 80\.00: last price 70\.00 \(FINNHUB, [^)]*, 10 s old when checked at Nov 5 09:40 New York\)\. No current price now: the latest price is 10 min old \(limit 5 min\)\./, stop);
  assert.doesNotMatch(stop, /ZZS[^\n]*bought 100\.00/, 'no entry % from an observation that is no longer current');
});
test('rev14: a stop batch sent promptly keeps the current price and entry %, with the time it was checked', async t => {
  const r = await run(t, { pos: { ZZS: { entry: 100, stop: 80 } }, quotes: { ZZS: { c: 70, ageSec: 10 } } });
  const stop = r.sent.find(x => /^YOUR STOPS/.test(x)) || '';
  assert.match(stop, /last price 70\.00 \([^)]*10 s old when checked at Nov 5 09:40 New York\) \(bought 100\.00, -30\.0%\)\./, stop);
  assert.doesNotMatch(stop, /No current price now/);
});

test('all requests stayed synthetic and on loopback', () => assert.deepEqual(blocked, []));
