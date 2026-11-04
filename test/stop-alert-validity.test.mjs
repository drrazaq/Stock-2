// Stop-alert validity (4 Nov 2026 review, findings 1-5). Synthetic fixtures only: invented tickers and prices, loopback services,
// no owner records, credentials, provider requests or real messages.
// 1 one stop route at a time: the bot repeats a stop only when the watcher has no ACKNOWLEDGED delivery for it
// 2 one wording, which never asks for a second sale after a broker stop order filled
// 3 "at or below"   4 price source, observation time and age; stale, undated, future, wrong-ticker or bar prices are UNKNOWN
// 5 catalyst times carry their full date and one time zone
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { stopHits, priceEvidence, nyStamp, stopMessageKey, STOP_MAX_AGE_MIN } from '../stop-watch.mjs';
import { classifyCatalyst, nyStamp as nyStampAlerts } from '../early-alerts.mjs';
import { loadScan, blocked } from './load-scan.mjs';

const NOW = Date.parse('2026-11-05T15:31:00Z');   // Thu 10:31 New York (winter time)
const q = (sym, price, ageSec = 20, extra = {}) => ({ sym, price, t: NOW - ageSec * 1000, provider: 'ALPACA', feed: 'iex', kind: 'TRADE', ...extra });
const POS = { ZZA: { entry: 100, stop: 80 } };

test('price evidence: only a ticker-bound, dated, fresh trade price is OK', () => {
  assert.equal(priceEvidence('ZZA', q('ZZA', 79), NOW).state, 'OK');
  const why = (x) => priceEvidence('ZZA', x, NOW).why;
  assert.match(why(undefined), /no live price/);
  assert.match(why(q('ZZB', 79)), /not for this ticker/);
  assert.match(why(q('ZZA', 0)), /no valid price/);
  assert.match(why(q('ZZA', 79, 20, { kind: 'DAILY_BAR' })), /daily bar, not a live trade/);
  assert.match(why(q('ZZA', 79, 20, { t: null })), /no source timestamp/);
  assert.match(why(q('ZZA', 79, -600)), /in the future/);
  assert.match(why(q('ZZA', 79, STOP_MAX_AGE_MIN * 60 + 1)), /latest price is 5 min old \(limit 5 min\)/);
  assert.equal(priceEvidence('ZZA', q('ZZA', 79, STOP_MAX_AGE_MIN * 60), NOW).state, 'OK');   // exactly at the limit
});

test('r2: any future timestamp (even 1 s) and any nonfinite or non-numeric price are UNKNOWN', () => {
  const why = (x) => priceEvidence('ZZA', x, NOW).why;
  assert.match(why(q('ZZA', 79, -1)), /in the future/);
  assert.match(why(q('ZZA', 79, 20, { t: Infinity })), /no source timestamp/);
  assert.match(why(q('ZZA', 79, 20, { t: NaN })), /no source timestamp/);
  for (const price of [Infinity, -Infinity, NaN, '79', null]) assert.match(why(q('ZZA', price)), /no valid price/, String(price));
  assert.equal(priceEvidence('ZZA', q('ZZA', 79), NaN).state, 'UNKNOWN', 'a nonfinite clock never vouches for freshness');
  const a = stopHits(POS, { ZZA: q('ZZA', Infinity) }, {}, NOW); assert.equal(a[0].kind, 'unknown'); assert.doesNotMatch(a[0].text, /REACHED/);
});

test('r2: an invalid recorded stop (Infinity, NaN, text, zero) is UNKNOWN, never a crossing or a silent skip', () => {
  for (const stop of [Infinity, NaN, '80', 0, -5]) {
    const a = stopHits({ ZZA: { entry: 100, stop } }, { ZZA: q('ZZA', 70) }, {}, NOW);
    assert.equal(a.length, 1, String(stop)); assert.equal(a[0].kind, 'unknown'); assert.match(a[0].text, /recorded stop is not a valid number/);
  }
  assert.deepEqual(stopHits({ ZZA: { entry: 100 } }, { ZZA: q('ZZA', 70) }, {}, NOW), [], 'no stop recorded: nothing to check');
});

test('stale or missing evidence below the stop is UNKNOWN, never a hit and never silent; a later fresh price still alerts', () => {
  const sent = {};
  const a = stopHits(POS, { ZZA: q('ZZA', 70, 900) }, sent, NOW);   // 15-minute-old price under the stop
  assert.equal(a.length, 1); assert.equal(a[0].kind, 'unknown');
  assert.match(a[0].text, /^STOP CHECK UNKNOWN: ZZA: the latest price is 15 min old/); assert.match(a[0].text, /not a sign the position is safe/);
  assert.doesNotMatch(a[0].text, /REACHED/);
  assert.equal(stopHits(POS, {}, sent, NOW).length, 0, 'UNKNOWN once a day');
  const b = stopHits(POS, { ZZA: q('ZZA', 79.5) }, sent, NOW); assert.equal(b.length, 1); assert.equal(b[0].kind, 'hit');
  assert.equal(stopHits(POS, {}, sent, NOW).length, 0, 'no UNKNOWN after the hit');
  const c = stopHits(POS, {}, {}, NOW); assert.equal(c[0].kind, 'unknown'); assert.match(c[0].text, /no live price for this stock/);
});

test('"at or below": a price equal to the stop is a crossing and is worded as at or below', () => {
  const a = stopHits(POS, { ZZA: q('ZZA', 80) }, {}, NOW);
  assert.equal(a[0].kind, 'hit'); assert.match(a[0].text, /traded at or below your stop 80\.00: last price 80\.00/); assert.doesNotMatch(a[0].text, /under your stop/);
});

test('wording respects an order that already filled: no second sale, the fill price is what to report', () => {
  const t = stopHits(POS, { ZZA: q('ZZA', 78) }, {}, NOW)[0].text;
  assert.match(t, /If your broker stop order has filled, you are already out: do not sell again; send  sold ZZA FILLPRICE/);
  assert.match(t, /If no stop order is working at your broker, decide now whether to sell/);
  assert.doesNotMatch(t, /SELL NOW|Sell \/ reassess|not instructions/);
  assert.match(t, /\(ALPACA IEX, Nov 5 10:30 New York, 20 s old\)/);
});

test('already sold (position no longer recorded): nothing is sent for it', () => {
  assert.deepEqual(stopHits({}, { ZZA: q('ZZA', 70) }, {}, NOW), []);
});

test('stop levels and positions are read, never changed', () => {
  const pos = JSON.parse(JSON.stringify(POS)), before = JSON.stringify(pos);
  stopHits(pos, { ZZA: q('ZZA', 70) }, {}, NOW); stopHits(pos, {}, {}, NOW);
  assert.equal(JSON.stringify(pos), before);
});

test('catalyst times have a full date and one time zone (previous-day items no longer read like today)', () => {
  assert.equal(nyStamp(Date.parse('2026-11-03T21:07:00Z')), 'Nov 3 16:07 New York');   // EST
  assert.equal(nyStamp(Date.parse('2026-10-30T20:07:00Z')), 'Oct 30 16:07 New York');   // EDT, before the 1 Nov change
  for (const t of ['2026-11-03T21:07:00Z', '2026-10-30T20:07:00Z', '2027-03-15T13:30:00Z']) assert.equal(nyStampAlerts(Date.parse(t)), nyStamp(Date.parse(t)), 'one format in both modules');
  const now = Date.parse('2026-11-04T14:37:00Z');
  const v = classifyCatalyst({ sec: { known: true, filings: [{ form: '6-K', at: '2026-11-03T21:07:00Z' }] }, news: { ok: true, items: [{ at: Date.parse('2026-11-03T21:05:00Z'), source: 'Yahoo', headline: 'ZZQ Reports Third Quarter' }] }, nowMs: now });
  assert.match(v.text, /SEC 6-K accepted Nov 3 16:07 New York; headline Nov 3 16:05 New York \(Yahoo\)/);
  const r = classifyCatalyst({ sec: { known: true, filings: [{ form: '8-K', at: '2026-11-02T12:15:00Z' }] }, news: { ok: true, items: [] }, nowMs: now });
  assert.equal(r.cls, 'RECYCLED'); assert.match(r.text, /SEC 8-K accepted Nov 2 07:15 New York/); assert.doesNotMatch(r.text, /UTC/);
  const h = classifyCatalyst({ sec: { known: true, filings: [] }, news: { ok: true, items: [{ at: Date.parse('2026-11-04T08:05:00Z'), source: 'Benzinga', headline: 'ZZQ moves' }] }, nowMs: now });
  assert.match(h.text, /earliest headline Nov 4 03:05 New York \(Benzinga\)/);
});

// ---- the bot's fallback route, through the actual intraday() caller
async function botRun(t, { watcherState = null, quote = { c: 79, t: Math.floor((NOW - 20000) / 1000) }, alertState = null } = {}) {
  const sent = [];
  const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
    if (req.url.includes('/getUpdates')) return res.end(JSON.stringify({ ok: true, result: [] }));
    if (req.url.includes('/sendMessage')) { sent.push(JSON.parse(b).text); return res.end(JSON.stringify({ ok: true, result: { message_id: 1 } })); }
    if (req.url.includes('/quote')) return res.end(JSON.stringify(quote));
    res.statusCode = 404; res.end('{}'); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port, day = '2026-11-05';
  const files = { 'data/my-positions.json': POS, 'data/signals.json': { session: '2026-11-04', stocks: [], quick: [], leaders: [] }, 'data/tg-state.json': { offset: 42 } };
  if (alertState) files['data/alert-state.json'] = alertState;
  if (watcherState) files['data/watcher-message-state/' + day + '/' + crypto.createHash('sha256').update(stopMessageKey('ZZA', 'hit')).digest('hex') + '.json'] = { version: 2, day, state: watcherState };
  const S = await loadScan({ files, env: { BOT_ONLY: '', TG_TOKEN: 'x', TG_CHAT: '1', TG_BASE: base, FH_BASE: base, FINNHUB_KEY: 'x', TD_BASE: base } });
  const real = Date.now; Date.now = () => NOW;
  try { await S.fn('intraday')(true); } finally { Date.now = real; }
  return { sent, S };
}

test('bot fallback: a stop the watcher already delivered (ACKNOWLEDGED) is not repeated', async t => {
  const { sent, S } = await botRun(t, { watcherState: 'ACKNOWLEDGED' });
  assert.equal(sent.filter(x => /STOP LEVEL REACHED|STOP LOSS REACHED/.test(x)).length, 0);
  assert.equal(S.readJson('data/alert-state.json').sent.ZZAmyst, 'watcher');
  assert.equal(S.readJson('data/tg-state.json').offset, 42, 'Telegram offset untouched');
});

for (const watcherState of [null, 'UNSENT', 'UNCERTAIN'])
  test('bot fallback: watcher delivery ' + (watcherState || 'missing') + ' -> the bot sends the stop once, in the shared wording', async t => {
    const { sent, S } = await botRun(t, { watcherState });
    const stop = sent.filter(x => /STOP LEVEL REACHED/.test(x));
    assert.equal(stop.length, 1); assert.match(stop[0], /^YOUR STOPS \(bot check; the live watcher had not confirmed these\)/);
    assert.match(stop[0], /ZZA traded at or below your stop 80\.00: last price 79\.00 \(FINNHUB, Nov 5 10:30 New York, 20 s old\)/);
    assert.match(stop[0], /do not sell again/); assert.doesNotMatch(stop[0], /not instructions|Sell \/ reassess/);
    assert.equal(S.readJson('data/my-positions.json').ZZA.stop, 80, 'stop level unchanged');
  });

test('bot fallback: duplicate delivery prevention holds across runs (once a day)', async t => {
  const { sent } = await botRun(t, { alertState: { day: '2026-11-05', sent: { ZZAmyst: 1 } } });
  assert.equal(sent.filter(x => /STOP LEVEL REACHED/.test(x)).length, 0);
});

test('bot fallback: an undated or stale quote under the stop is STOP CHECK UNKNOWN, not a crossing', async t => {
  const a = await botRun(t, { quote: { c: 70, t: 0 } });
  const u = a.sent.filter(x => /STOP CHECK UNKNOWN/.test(x)); assert.equal(u.length, 1); assert.match(u[0], /no source timestamp/);
  assert.equal(a.sent.filter(x => /REACHED/.test(x)).length, 0);
  const b = await botRun(t, { quote: { c: 70, t: Math.floor((NOW - 30 * 60000) / 1000) } });
  assert.match(b.sent.find(x => /STOP CHECK UNKNOWN/.test(x)), /latest price is 30 min old/);
});

test('r2 bot fallback: a future-dated or nonfinite quote is UNKNOWN through the actual caller', async t => {
  const f = await botRun(t, { quote: { c: 70, t: Math.floor(NOW / 1000) + 5 } });
  assert.match(f.sent.find(x => /STOP CHECK UNKNOWN/.test(x)) || '', /in the future/); assert.equal(f.sent.filter(x => /REACHED/.test(x)).length, 0);
  const n = await botRun(t, { quote: { c: 'Infinity', t: Math.floor((NOW - 20000) / 1000) } });
  assert.equal(n.sent.filter(x => /REACHED/.test(x)).length, 0);
});

test('all requests stayed synthetic and on loopback', () => assert.deepEqual(blocked, []));
