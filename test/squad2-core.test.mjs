// Seams: squad2-core.mjs (squad 2, 24 Oct 2026): intraday execution of the traders' setups on 1-minute bars. Pure functions, no network.
// Covers: no look-ahead (minute and daily), fill ordering (orders fill only on a later bar, buy-stop at max(level, open), market at the
// next open), gap fills through a stop (minute and daily), the same-minute entry/stop ambiguity (worst / best case bounds), matched
// controls, swing exits, and the library pre-registration. Run: node test/squad2-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SETUPS, IDS, nyOffsetMin, toNyBars, curveAt, rvol, priceScale, buyStop, walkDay, lowBefore, fiveMin, setupORB, setupEP, setupQBO, setupVWAP, setupEMAPB, setupPWR,
  runDay, dayFlags, universe, htfAt, leaderScore, continueDaily, preRegister, idxFrom, SLIP } from '../squad2-core.mjs';

// a regular-session day: minute m from 570; f(m) -> [o,h,l,c,v]
const day = (f, from = 570, to = 959) => { const out = []; for (let m = from; m <= to; m++) { const [o, h, l, c, v] = f(m); out.push({ m, o, h, l, c, v, vw: (h + l + c) / 3 }); } return out; };
const flat = (px, v = 1000) => () => [px, px * 1.001, px * 0.999, px, v];
const clone = (b) => b.map(x => ({ ...x }));
// gapper: prior close 100, opens 105, opening range 105-106 with big volume, breaks out at 09:40
function gapper({ breakAt = 580, dip = null } = {}) {
  return day((m) => { if (m < 575) return [105, 106, 104.5, 105.5, 200000];
    if (dip && m === dip.m) return [105.2, 105.3, dip.l, 105.2, 5000];
    if (m < breakAt) return [105.2, 105.8, 104.9, 105.4, 5000];
    if (m === breakAt) return [105.5, 106.6, 105.4, 106.5, 9000];
    return [107, 107.5, 106.8, 107.2, 4000]; });
}
const ctxG = { pc: 100, adv: 1e6, adr: 0.05, scale: 1, f: { gap: 1 } };

test('pre-registration: 9 rules, each with a rule text, a source link, a kind and its old next-open counterpart(s); library add is idempotent', () => {
  assert.ok(IDS.length >= 8); assert.equal(IDS.length, 9);
  for (const id of IDS) { const s = SETUPS[id]; assert.match(id, /^SQ2-/); assert.ok(s.rule.length > 80, id); assert.ok(s.src.length && s.src.every(p => /^https:\/\//.test(p.url)), id); assert.ok(['day', 'swing'].includes(s.kind)); assert.ok(s.block >= 5); }
  const LB = { strategies: [{ id: 'DEC-QBO', status: 'tested: rejected' }] };
  assert.equal(preRegister(LB), IDS.length); assert.equal(preRegister(LB), 0); assert.equal(LB.strategies[0].status, 'tested: rejected');
  assert.ok(LB.strategies.filter(e => /^SQ2-/.test(e.id)).every(e => /BEFORE any run/.test(e.note) && /INTRADAY ENTRY/.test(e.note)));
});

test('clock: New York offset (summer / winter) and regular-session filter', () => {
  assert.equal(nyOffsetMin('2024-07-01'), -240); assert.equal(nyOffsetMin('2024-01-02'), -300);
  const rows = [{ t: '2024-07-01T13:29:00Z', o: 1, h: 1, l: 1, c: 1, v: 1 }, { t: '2024-07-01T13:30:00Z', o: 2, h: 2, l: 2, c: 2, v: 1 }, { t: '2024-07-01T19:59:00Z', o: 3, h: 3, l: 3, c: 3, v: 1 }, { t: '2024-07-01T20:00:00Z', o: 4, h: 4, l: 4, c: 4, v: 1 }];
  const b = toNyBars(rows, '2024-07-01'); assert.deepEqual(b.map(x => x.m), [570, 959]); assert.equal(b[0].o, 2);
});

test('relative volume curve and price scale', () => {
  assert.equal(curveAt(5), 0.04); assert.ok(Math.abs(curveAt(10) - 0.0625) < 1e-9); assert.ok(rvol(120000, 1e6, 5) === 3);
  assert.equal(priceScale(100, 101), 1); assert.ok(Math.abs(priceScale(50, 100) - 0.5) < 1e-12); assert.equal(priceScale(100, 137), null);
});

test('fill ordering: a buy-stop fills only on a bar after the decision, at max(level, open)', () => {
  const B = gapper(); const f = buyStop(B, idxFrom(B, 575), 930, 106);
  assert.equal(f.m, 580); assert.equal(f.px, 106); assert.equal(f.atOpen, false);
  const G = clone(B); G[idxFrom(G, 580)].o = 106.3; const g = buyStop(G, idxFrom(G, 575), 930, 106); assert.equal(g.px, 106.3); assert.equal(g.atOpen, true);
  // the opening-range bars themselves (high 106) can never fill their own breakout level
  const r = setupORB(ctxG, B, 5); assert.ok(r.fill.m >= 575); assert.equal(r.fill.m, 580);
  // VWAP reclaim is a market order: it fills at the NEXT minute's open, never inside the reclaim bar
  const V = day((m) => m < 575 ? [100, 100.2, 99.9, 100, 1000] : m < 600 ? [97.5, 97.6, 97.0, 97.2, 1000] : m < 615 ? [97.5, 101, 97.4, 100.8, 3000] : [101, 101.5, 100.9, 101.2, 1000]);
  const v = setupVWAP({ pc: 99, adv: 1e5, adr: 0.03, f: { lead: 1 } }, V); assert.ok(v.fill); const k = v.fill.i;
  assert.equal(V[k - 1].m % 5, 4); assert.equal(v.fill.px, V[k].o); assert.equal(v.fill.atOpen, true);
});

test('no look-ahead (minutes): changing bars AFTER the fill never changes the entry, the stop or the pool', () => {
  const B = gapper(), a = setupORB(ctxG, B, 5); const C = clone(B); for (const b of C) if (b.m > a.fill.m) { b.l = 50; b.h = 200; b.c = 60; b.v = 1e7; }
  const c = setupORB(ctxG, C, 5); assert.equal(c.fill.m, a.fill.m); assert.equal(c.fill.px, a.fill.px); assert.equal(c.stop, a.stop); assert.equal(c.pool, a.pool);
  // the stop is the day's low KNOWN at the fill: a deeper low later in the day is not used
  assert.equal(a.stop, lowBefore(B, a.fill.i)); assert.equal(a.stop, 104.5);
  // EP and QBO / HTF base breaks: same property
  const ep = setupEP({ ...ctxG, pc: 95, f: { ep: 1 } }, B), ep2 = setupEP({ ...ctxG, pc: 95, f: { ep: 1 } }, C); assert.deepEqual([ep2.fill.m, ep2.stop], [ep.fill.m, ep.stop]);
  const q = setupQBO({ ...ctxG, f: { qbo: { trig: 105.9, adr: 0.05 } } }, B), q2 = setupQBO({ ...ctxG, f: { qbo: { trig: 105.9, adr: 0.05 } } }, C); assert.deepEqual([q2.fill.m, q2.stop], [q.fill.m, q.stop]);
  assert.equal(q.info.level, 106);   // max(base high 105.9, opening-range high 106)
});

test('no look-ahead (EMA pullback): the trend must exist BEFORE the pullback bar; the order lives 15 minutes only', () => {
  const pc = 100; let B = day((m) => { if (m < 575) return [104, 105, 103.9, 104.5, 200000]; if (m < 600) return [106, 107, 105.9, 106.8, 5000]; if (m < 605) return [105, 105.2, 102, 104.9, 3000]; if (m < 610) return [105, 107.5, 104.9, 107.4, 3000]; return [108, 108.2, 107.8, 108, 1000]; });
  const r = setupEMAPB({ pc, adv: 1e6, adr: 0.05, f: { gap: 1 } }, B); assert.ok(r.pool); assert.equal(r.info.pullback, 600); assert.ok(r.fill.m >= 605 && r.fill.m <= 619); assert.equal(r.stop, 102);
  // same day but the high never exceeded the opening range before the dip: no trend, no trade at 10:00
  B = day((m) => { if (m < 575) return [104, 108, 103.9, 104.5, 200000]; if (m < 600) return [106, 107, 105.9, 106.8, 5000]; if (m < 605) return [105, 105.2, 102, 104.9, 3000]; return [105, 105.5, 104.9, 105.2, 1000]; });
  const s = setupEMAPB({ pc, adv: 1e6, adr: 0.05, f: { gap: 1 } }, B); assert.ok(!s.fill || s.info.pullback !== 600);
});

test('gap through a stop: a bar opening under the stop fills at its open (minutes and daily)', () => {
  const B = day((m) => m === 600 ? [100, 100.5, 95, 96, 1] : m < 600 ? [101, 101.5, 100.5, 101, 1] : [96, 96.5, 95.5, 96, 1], 590, 959);
  const w = walkDay(B, 0, 99, true); assert.equal(w.pess.px, 100 <= 99 ? 100 : 99);
  const B2 = clone(B); B2[idxFrom(B2, 600)].o = 97; const w2 = walkDay(B2, 0, 99, true); assert.equal(w2.pess.px, 97); assert.equal(w2.pess.why, 'opened under the stop');
  const S = { o: [100, 101, 90], h: [102, 103, 92], l: [99, 100, 89], c: [101, 102, 91] }, sma = [NaN, NaN, NaN];
  const r = continueDaily('L10', S, sma, 0, 100, 95, 2, { slip: 0 }); assert.equal(r.legs[0][2], 90); assert.equal(r.legs[0][3], 'opened under the stop'); assert.ok(Math.abs(r.g - (-0.10)) < 1e-9);
});

test('same-minute ambiguity: intrabar fill + low under the stop = worst case stopped, best case not; a fill at the open is not ambiguous', () => {
  const B = day((m) => m === 600 ? [100, 101.2, 98.8, 101, 1] : [101, 102, 100.8, 101.5, 1], 600, 959);
  const amb = walkDay(B, 0, 99, false); assert.equal(amb.ambiguous, true); assert.equal(amb.pess.px, 99); assert.equal(amb.opt.why, 'close'); assert.equal(amb.opt.px, 101.5);
  const at = walkDay(B, 0, 99, true); assert.equal(at.ambiguous, false); assert.equal(at.pess.px, 99); assert.deepEqual(at.pess, at.opt);
  // runDay books g (verdict) from the worst case and gOpt from the best
  const G = gapper({ breakAt: 580 }); G[idxFrom(G, 580)].l = 104.0;   // the breakout minute also dips under the 104.5 opening low
  const res = runDay([{ sym: 'AAA', ctx: ctxG, bars: G }]); const t = res['SQ2-ORB5'].trades[0];
  assert.equal(t.ambiguous, true); assert.ok(t.g < 0 && t.gOpt > 0); assert.ok(Math.abs(t.g - ((104.5 * (1 - SLIP)) / (106 * (1 + SLIP)) - 1)) < 1e-4);
});

test('matched control: other stocks of the same pool that had NOT triggered by the entry minute, bought at that minute, sold at the close', () => {
  const A = gapper({ breakAt: 580 }), Bx = gapper({ breakAt: 600 }), Cn = day((m) => m < 575 ? [105, 105.5, 104.8, 105.2, 200000] : [105, 105.4, 104.9, 105.1, 3000]);
  const out = runDay([{ sym: 'AAA', ctx: ctxG, bars: A }, { sym: 'BBB', ctx: ctxG, bars: Bx }, { sym: 'CCC', ctx: ctxG, bars: Cn }]);
  const T = out['SQ2-ORB5'].trades, a = T.find(x => x.sym === 'AAA'), b = T.find(x => x.sym === 'BBB');
  assert.equal(a.cType, 'matched'); assert.equal(a.cN, 2);   // BBB (not yet triggered at 09:40) and CCC
  assert.equal(b.cN, 1);   // at 10:00 AAA had already triggered: only CCC
  assert.ok(Math.abs(b.c - (105.1 / 105 - 1)) < 1e-4);
  assert.equal(out['SQ2-ORB5'].pool, 3);
});

test('no look-ahead (daily): day-t flags use only data to t-1 plus the open of t', () => {
  const n = 120, S = { o: [], h: [], l: [], c: [], v: [] };
  for (let k = 0; k < n; k++) { const p = 10 + k * 0.1; S.o.push(p); S.h.push(p * 1.02); S.l.push(p * 0.98); S.c.push(p); S.v.push(2e6); }
  const t = 100; S.o[t] = S.c[t - 1] * 1.12; const a = dayFlags(S, t);
  assert.ok(a && a.f.gap && a.pc === S.c[t - 1]); assert.ok(universe(S, t));
  const S2 = { o: [...S.o], h: [...S.h], l: [...S.l], c: [...S.c], v: [...S.v] }; for (let k = t; k < n; k++) { S2.h[k] *= 3; S2.l[k] /= 3; S2.c[k] *= 2; S2.v[k] = 1; } S2.o[t] = S.o[t];
  assert.deepEqual(dayFlags(S2, t), a); assert.equal(leaderScore(S2, t - 1), leaderScore(S, t - 1));
  // high tight flag at the close of y: pole 90%+, flag <= 25% deep, 3-25 sessions old
  const H = { o: [], h: [], l: [], c: [], v: [] }; for (let k = 0; k < 100; k++) { const p = k < 60 ? 10 : k <= 85 ? 10 + (k - 60) * 0.5 : 21; H.o.push(p); H.h.push(k === 85 ? 23 : p * 1.01); H.l.push(p * 0.99); H.c.push(p); H.v.push(2e6); }
  const f = htfAt(H, 95); assert.ok(f && f.top === 23 && f.p === 85);
  H.l[90] = 15; assert.equal(htfAt(H, 95), null);   // flag deeper than 25%
});

test('swing exits on daily bars: KQ sells 1/3 on day 3 and trails the 10-day; L10 trails the 10-day low; partial legs add up', () => {
  const n = 30, S = { o: [], h: [], l: [], c: [] }; for (let k = 0; k < n; k++) { const p = 100 + k; S.o.push(p); S.h.push(p + 1); S.l.push(p - 0.5); S.c.push(p + 0.5); }
  S.c[8] = 90; S.o[9] = 91; S.l[8] = 89.6; const sma = Array.from({ length: n }, (_, t) => t >= 9 ? S.c.slice(t - 9, t + 1).reduce((a, b) => a + b) / 10 : NaN);
  const kq = continueDaily('KQ', S, sma, 0, 100, 95, n - 1, { slip: 0 });
  assert.equal(kq.legs[0][3], 'partial 1/3 on day 3'); assert.equal(kq.legs[0][0], 2); assert.equal(kq.state, 'closed');
  const q = kq.legs.reduce((a, l) => a + l[1], 0); assert.ok(Math.abs(q - 1) < 1e-3);
  const L = continueDaily('L10', S, sma, 0, 100, 95, n - 1, { slip: 0 }); assert.equal(L.legs[0][3], 'stop'); assert.equal(L.legs[0][0], 8);   // the 10-day-low trail is hit by the 89.6 low
});

test('power hour: decided at 15:00 on completed bars only; buy-stop at the day high so far', () => {
  const B = day((m) => m < 900 ? [104, 104.5 + (m === 880 ? 0.5 : 0), 103.8, 104.4, 20000] : m === 905 ? [104.6, 105.6, 104.5, 105.4, 30000] : [104.6, 104.9, 104.5, 104.8, 10000]);
  const r = setupPWR({ pc: 100, adv: 1e6, adr: 0.05, f: { gap: 1 } }, B); assert.ok(r.pool); assert.equal(r.fill.m, 905); assert.equal(r.fill.px, 105); assert.ok(r.stop <= 103.8 + 1e-9);
});

test('five-minute bars are clock aligned and know their last minute', () => {
  const F = fiveMin(day(flat(10), 570, 584)); assert.deepEqual(F.map(x => x.s), [570, 575, 580]); assert.deepEqual(F.map(x => x.end), [4, 9, 14]);
});
