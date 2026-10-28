// Seams: shadow-stream.mjs, shadow-eval.mjs and the catalyst check in early-alerts.mjs (owner, 28 Oct 2026, Phase 1). Invariants: every
// candidate is kept whatever it later did; each soft gate is tested by removing it alone; fills use the ask (or an assumed spread, flagged),
// never the last trade; costs are always taken; a catalyst is never invented and a failed source is never read as "no catalyst".
// Run: node --test test/shadow.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShadow, variantPass, VARIANTS } from '../shadow-stream.mjs';
import { entryOf, netExit, score, stats, filterTable } from '../shadow-eval.mjs';
import { classifyCatalyst } from '../early-alerts.mjs';

const q = (o = {}) => ({ sym: 'X', m: 600, price: 10, chg: 0.05, score: 90, rv: 1, rvT: 3, dollarVol: 2e6, live: true, bid: 9.99, ask: 10.01, qAgeSec: 5, fc: 0.01, hard: { under1: false, halalFail: false, lottery: 0 }, ...o });

test('variants: base needs every gate; each no_ variant drops exactly one gate', () => {
  assert.equal(variantPass('base', q()), true);
  assert.equal(variantPass('base', q({ chg: 0.12 })), false); assert.equal(variantPass('no_chgMax', q({ chg: 0.12 })), true); assert.equal(variantPass('no_score', q({ chg: 0.12 })), false);
  assert.equal(variantPass('no_window', q({ m: 560 })), true); assert.equal(variantPass('no_dollarVol', q({ dollarVol: 1e5 })), true); assert.equal(variantPass('no_chgMin', q({ chg: 0.025 })), true);
  for (const v of VARIANTS) assert.equal(variantPass(v, q({ live: false })), false);   // a stale price is data integrity, never relaxed
});
test('recorder: one row per stock, first entry per variant kept, next-minute / 30-minute prices and high / low followed', () => {
  const S = createShadow({ day: '2026-10-29' });
  S.early(q({ chg: 0.02 })); S.early(q({ m: 601, chg: 0.05, price: 10.2 })); S.early(q({ m: 602, chg: 0.06, price: 10.3 }));
  const r = S.rows()[0]; assert.equal(S.rows().length, 1); assert.equal(r.m0, 600); assert.equal(r.v.base.m, 601); assert.equal(r.v.no_chgMin.m, 600);
  S.tick({ sym: 'X', m: 602, price: 10.3, live: true }); S.tick({ sym: 'X', m: 615, price: 9.5, live: true }); S.tick({ sym: 'X', m: 631, price: 11, live: true }); S.tick({ sym: 'X', m: 640, price: 10.8, live: false });
  assert.equal(r.v.base.next, 10.3); assert.equal(r.v.base.px30, 11); assert.equal(r.v.base.hi, 11); assert.equal(r.v.base.lo, 9.5); assert.equal(r.last, 11);
  S.trigger({ sym: 'Y', rule: 'IG1', m: 605, price: 4, prevC: 3.6, rv: 0.4, logged: 'volume too low' }, q({ sym: 'Y' })); assert.equal(S.rows()[1].ig[0].held, 'volume too low'); assert.equal(S.rows()[1].src, 'ig');
});
test('fills: ask when the quote is fresh and the spread sane; else last price plus an assumed half spread, flagged', () => {
  assert.deepEqual(entryOf({ px: 10, bid: 9.99, ask: 10.01, qAgeSec: 5 }), { price: 10.01, half: 0.001, assumedSpread: false });
  const st = entryOf({ px: 4, bid: 3.9, ask: 4.1, qAgeSec: 600 }); assert.equal(st.assumedSpread, true); assert.equal(st.price, 4 * 1.005);
  assert.equal(entryOf({ px: 4, bid: 3, ask: 5, qAgeSec: 1 }).assumedSpread, true);   // 50% spread: not trusted as a fill
  assert.equal(netExit({ price: 10, half: 0.001 }, 10.2), 0.0130);   // +2% gross -> +1.3% net after half spread and 0.6% fees
  assert.equal(entryOf({ px: 10, next: null }, true), null);
});
test('score: every horizon after costs; excursions reported separately', () => {
  const s = score({ px: 10, bid: 9.99, ask: 10.01, qAgeSec: 5, next: 10.1, px30: 10.3 }, { c0: 10.5, c1: 9.8, c5: 11, c10: null, h5: 12, l5: 9 });
  assert.equal(s.m30, 0.0219); assert.equal(s.day, 0.0419); assert.equal(s.d1, -0.028); assert.equal(s.d10, null); assert.equal(s.mfe5, 0.1988); assert.equal(s.mae5, -0.1009); assert.equal(s.dayDelayed, 0.0315);   // 10.3 x 0.999 / 10.01 - 1 - 0.6% = +2.19%
});
test('stats: median, hit rate for +2%, without the 2 best, worst', () => {
  const s = stats([0.5, 0.3, -0.05, -0.05, -0.05, 0.01]); assert.equal(s.n, 6); assert.equal(s.median, -0.05); assert.equal(s.noTop2, -0.035); assert.equal(s.worst, -0.05); assert.equal(s.hit2, 0.3333);
});
test('filter table: a gate is judged only on the candidates it alone rejects; hard-ineligible rows never count; COLLECTING before 10 sessions', () => {
  const rows = [], out = {};
  for (let i = 0; i < 40; i++) { const d = '2026-11-' + String(1 + (i % 12)).padStart(2, '0'), sym = 'S' + i, e = { m: 600, px: 10, bid: 9.99, ask: 10.01, qAgeSec: 5 };
    rows.push({ d, sym, hard: { under1: false, halalFail: false, lottery: 0 }, v: i < 10 ? { base: e, no_score: e } : { no_score: e }, last: 10 }); out[d + '|' + sym] = { c0: i < 10 ? 10.5 : 9.5 }; }
  rows.push({ d: '2026-11-01', sym: 'BAD', hard: { under1: false, halalFail: true, lottery: 0 }, v: { no_score: { px: 10 } } });
  const t = filterTable(rows, out, 'day');
  assert.equal(t.candidates, 40); assert.equal(t.base.n, 10); assert.equal(t.gates.score.rejected, 30); assert.ok(t.gates.score.avg < 0); assert.match(t.gates.score.verdict, /REJECTS LOSERS/);
  assert.equal(t.gates.window.rejected, 0);
  assert.equal(filterTable(rows.slice(0, 5), out).gates.score.verdict, 'COLLECTING');
});
test('catalyst classes: source, direction and freshness are separate; a failed source is UNAVAILABLE, never NONE; no reason is invented', () => {
  const now = Date.parse('2026-10-29T14:00:00Z'), ok = { known: true, filings: [] }, noNews = { ok: true, items: [] };
  let c = classifyCatalyst({ sec: { known: true, filings: [{ form: '8-K', items: '8.01', at: '2026-10-29T11:02:00.000Z' }] }, news: noNews, nowMs: now });
  assert.equal(c.cls, 'VERIFIED'); assert.equal(c.source, 'SEC'); assert.equal(c.direction, 'AMBIGUOUS'); assert.equal(c.freshness, 'FRESH'); assert.match(c.text, /SEC 8-K item 8\.01 accepted 07:02 New York/);
  c = classifyCatalyst({ sec: { known: true, filings: [{ form: '8-K', items: '8.01', at: '2026-10-29T11:02:00Z' }] }, news: { ok: true, items: [{ at: now - 3e6, source: 'GlobeNewswire', headline: 'X wins $40M Army contract' }] }, nowMs: now });
  assert.equal(c.direction, 'POSITIVE'); assert.match(c.text, /headline wording, not verified/);   // positive only ever comes from wording, and says so
  c = classifyCatalyst({ sec: { known: true, filings: [{ form: '8-K', items: '1.01,3.02', at: '2026-10-29T11:02:00Z' }] }, news: noNews, nowMs: now }); assert.equal(c.direction, 'DILUTION');
  c = classifyCatalyst({ sec: { known: true, filings: [{ form: '424B5', at: '2026-10-29T12:00:00Z' }] }, news: noNews, nowMs: now }); assert.equal(c.direction, 'DILUTION');
  c = classifyCatalyst({ sec: { known: true, filings: [{ form: '8-K', items: '3.01', at: '2026-10-29T12:00:00Z' }] }, news: noNews, nowMs: now }); assert.equal(c.direction, 'NEGATIVE');
  c = classifyCatalyst({ sec: ok, news: { ok: true, items: [{ at: now - 3600e3, source: 'Business Wire', headline: 'X announces pricing of $10M registered direct offering' }] }, nowMs: now });
  assert.equal(c.cls, 'UNCONFIRMED'); assert.equal(c.source, 'ISSUER_WIRE'); assert.equal(c.direction, 'DILUTION');
  c = classifyCatalyst({ sec: ok, news: { ok: true, items: [{ at: now - 3600e3, source: 'Benzinga', headline: 'Stocks moving in pre-market' }] }, nowMs: now }); assert.equal(c.source, 'AGGREGATOR'); assert.equal(c.direction, 'AMBIGUOUS');
  c = classifyCatalyst({ sec: ok, news: { ok: true, items: [{ at: now - 40 * 3600e3, source: 'Reuters', headline: 'X wins contract' }] }, nowMs: now }); assert.equal(c.cls, 'RECYCLED'); assert.equal(c.freshness, 'RECYCLED');
  c = classifyCatalyst({ sec: { known: true, filings: [{ form: '8-K/A', items: '2.02', at: '2026-10-29T12:00:00Z' }] }, news: noNews, nowMs: now }); assert.equal(c.cls, 'RECYCLED'); assert.match(c.text, /amended filing/);
  c = classifyCatalyst({ sec: ok, news: { ok: true, items: [{ at: now + 60e3, headline: 'future' }] }, nowMs: now }); assert.equal(c.cls, 'NONE');   // nothing after the check time counts
  assert.equal(classifyCatalyst({ sec: { known: false }, news: noNews, nowMs: now }).cls, 'UNAVAILABLE');
  assert.match(classifyCatalyst({ sec: ok, news: { ok: false, why: 'HTTP 429' }, nowMs: now }).text, /news source unavailable \(HTTP 429\)/);
});

test('(owner item 6) spread counted once: ask entry pays half going in, half coming out; last-trade entry pays both halves; stress adds slippage', () => {
  const ask = entryOf({ px: 10, bid: 9.9, ask: 10.1, qAgeSec: 3 }), last = entryOf({ px: 10, bid: 9.9, ask: 10.1, qAgeSec: 999 });
  // mid 10, spread 2%: ask entry 10.1 (half spread in), exit at a mid of 10 minus half (9.90): one full spread in total, then 0.6% fees
  assert.equal(netExit(ask, 10), -0.0258); assert.equal(ask.half, 0.01);   // 10 x 0.99 / 10.1 - 1 - 0.6%
  assert.equal(last.assumedSpread, true); assert.equal(netExit(last, 10), -0.009);   // stale quote: the assumed 0.15% half in and 0.15% half out, once each
  const s = score({ px: 10, bid: 9.99, ask: 10.01, qAgeSec: 5 }, { c0: 10.5 });
  assert.ok(s.dayStress < s.day); assert.equal(s.dayStress, 0.0398);
});
