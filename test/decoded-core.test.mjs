// Seams: decoded-core.mjs (decoded trader methods, 23 Oct 2026). Detectors on synthetic daily bars, the exit engines (stop, partial,
// trailing average, time limit), information discreteness, the frog pick, the live-record stats and the TRY SMALL readiness rule.
// Pure functions, no network, no files. Run: node test/decoded-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { indicators, detectQBO, detectEP, detectMB, detectVCP, detectPB, detectCrash, crashControl, trendTemplate, simulate, infoDiscreteness, frogRow, frogPick,
  boardStats, trySmallReady, regimeUp, priorMove, rsScore, METHODS, COST } from '../decoded-core.mjs';

// bars from closes: open = previous close, high/low = close +/- a (fraction), volume v
function bars(closes, a = 0.03, v = 1e6) { const S = { o: [], h: [], l: [], c: [], v: [] };
  closes.forEach((c, i) => { S.o.push(i ? closes[i - 1] : c); S.c.push(c); S.h.push(Math.max(c, S.o[i]) * (1 + a)); S.l.push(Math.min(c, S.o[i]) * (1 - a)); S.v.push(v); }); return S; }
const ramp = (n, a, b) => Array.from({ length: n }, (_, i) => a + (b - a) * (i + 1) / n);
const flat = (n, x) => Array(n).fill(x);
const set = (S, t, o, h, l, c, v) => { S.o[t] = o; S.h[t] = h; S.l[t] = l; S.c[t] = c; if (v !== undefined) S.v[t] = v; };

// ---- QBO: 120 flat sessions, a 40% climb in 30, then a tight 10-session base with higher lows just under its high
function qboSeries() { const cl = [...flat(120, 10), ...ramp(30, 10, 14)], S = bars(cl, 0.03);
  const base = [[13.9, 14.25, 13.5, 13.8], [13.8, 14.2, 13.45, 13.9], [13.9, 14.2, 13.5, 13.7], [13.7, 14.1, 13.4, 13.85], [13.85, 14.2, 13.5, 13.9],
    [13.9, 14.2, 13.6, 13.95], [13.95, 14.2, 13.65, 14.0], [14.0, 14.22, 13.7, 14.05], [14.05, 14.2, 13.75, 14.1], [14.1, 14.24, 13.8, 14.15]];
  for (const b of base) { S.o.push(b[0]); S.h.push(b[1]); S.l.push(b[2]); S.c.push(b[3]); S.v.push(1e6); } return S; }
test('QBO: a tight base after a 30%+ move, in an up market, gives a buy-stop at the base high', () => {
  const S = qboSeries(), I = indicators(S), t = S.c.length - 1;
  assert.ok(priorMove(S.c, t) >= 0.30);
  const s = detectQBO(S, I, t, { regime: true });
  assert.ok(s, 'should fire'); assert.equal(s.entry, 'stop'); assert.equal(s.trigger, 14.25); assert.equal(s.cancelBelow, 13.4); assert.equal(s.valid, 5);
  assert.equal(detectQBO(S, I, t, { regime: false }), null, 'no trade when the QQQ regime is down');
  const W = qboSeries(); W.l[W.l.length - 1] = 13.0; W.l[W.l.length - 2] = 13.0;   // a lower low late in the base: not higher lows
  assert.equal(detectQBO(W, indicators(W), t, { regime: true }), null);
});
test('QBO without a prior move is not a setup', () => {
  const cl = [...flat(150, 10)], S = bars(cl, 0.03); for (let i = 0; i < 10; i++) { S.c.push(10 + i * 0.01); S.o.push(10); S.h.push(10.2); S.l.push(9.9 + i * 0.005); S.v.push(1e6); }
  assert.equal(detectQBO(S, indicators(S), S.c.length - 1, { regime: true }), null);
});
test('regimeUp: 10-day above 20-day and both rising', () => {
  assert.equal(regimeUp(ramp(40, 100, 140), 39), true); assert.equal(regimeUp(ramp(40, 140, 100), 39), false); assert.equal(regimeUp(flat(40, 100), 39), false);
});

// ---- KQ exit engine (QBO / EP)
function afterQbo(days) { const S = qboSeries(); for (const d of days) { S.o.push(d[0]); S.h.push(d[1]); S.l.push(d[2]); S.c.push(d[3]); S.v.push(2e6); } return S; }
test('KQ: buy-stop fill at the trigger, 1/3 sold on day 3 above the fill, rest at the next open after a close under the 10-day', () => {
  const t = 159; // signal day (last base session)
  const days = [[14.1, 15.0, 14.0, 14.9], [14.9, 15.6, 14.7, 15.5], [15.5, 16.2, 15.3, 16.0], [16.0, 16.8, 15.9, 16.6], [16.6, 16.9, 14.3, 14.4], [14.5, 14.8, 14.3, 14.6]];
  const S = afterQbo(days), I = indicators(S), sig = detectQBO(qboSeries(), indicators(qboSeries()), t, { regime: true });
  const r = simulate('KQ', S, I, t, sig);
  assert.equal(r.k, t + 1); assert.equal(r.fill, 14.25);   // opened under the trigger, traded through it
  assert.deepEqual(r.legs[0].slice(1), [+(1 / 3).toFixed(4), 16.0, 'partial 1/3 on day 3']);
  assert.ok(I.sma10[t + 5] > 14.4, 'day 5 closes under its 10-day average');
  assert.equal(r.state, 'closed'); assert.equal(r.x, t + 6); assert.deepEqual(r.legs[1].slice(2), [14.5, 'next open after the exit close']);
  assert.ok(Math.abs(r.g - ((16.0 / 3 + (2 / 3) * 14.5) / 14.25 - 1)) < 1e-9);
});
test('KQ: the stop is the entry day low; a later trade under it closes the rest at the stop (or the open if it gaps under)', () => {
  const t = 159, days = [[14.1, 14.6, 14.0, 14.4], [14.4, 14.5, 13.9, 14.0]];
  const S = afterQbo(days), I = indicators(S), sig = detectQBO(qboSeries(), indicators(qboSeries()), t, { regime: true });
  const r = simulate('KQ', S, I, t, sig); assert.equal(r.state, 'closed'); assert.equal(r.legs[0][3], 'stop'); assert.equal(r.legs[0][2], 14.0);
  const G = afterQbo([[14.1, 14.6, 14.0, 14.4], [13.5, 13.8, 13.4, 13.6]]), r2 = simulate('KQ', G, indicators(G), t, sig);
  assert.equal(r2.legs[0][3], 'opened under the stop'); assert.equal(r2.legs[0][2], 13.5);
});
test('KQ: an entry day that falls more than 1 ADR under the fill is booked as stopped at 1 ADR (worst case)', () => {
  const t = 159, sig = detectQBO(qboSeries(), indicators(qboSeries()), t, { regime: true });
  const S = afterQbo([[14.1, 14.5, 12.5, 13.0]]), r = simulate('KQ', S, indicators(S), t, sig);
  assert.equal(r.state, 'closed'); assert.ok(Math.abs(r.g - -sig.adr) < 1e-9);
});
test('buy-stop orders: pending, expired after 5 sessions, cancelled by a close under the base low', () => {
  const t = 159, sig = detectQBO(qboSeries(), indicators(qboSeries()), t, { regime: true });
  assert.equal(simulate('KQ', qboSeries(), indicators(qboSeries()), t, sig).state, 'pending');
  const E = afterQbo(Array(5).fill([14.0, 14.1, 13.9, 14.0])); assert.equal(simulate('KQ', E, indicators(E), t, sig).state, 'expired');
  const C = afterQbo([[14.0, 14.1, 13.2, 13.3]]); assert.equal(simulate('KQ', C, indicators(C), t, sig).state, 'cancelled');
});

// ---- EP
function epSeries(pre = 10) { const S = bars([...flat(100, 10), ...flat(30, pre)], 0.02, 1e6); set(S, 130, 11.5, 12.6, 11.4, 12.4, 5e6); return S; }
test('EP: a 10%+ gap on 3x volume that holds, in a stock that had not run, fires; stop = gap-day low, capped at 1.5 ADR', () => {
  const S = epSeries(), I = indicators(S), s = detectEP(S, I, 130);
  assert.ok(s); assert.equal(s.entry, 'open'); assert.equal(s.stop, 11.4); assert.ok(Math.abs(s.maxRisk - 1.5 * I.adr20[129]) < 1e-12);
  const R = epSeries(); R.v[130] = 2e6; assert.equal(detectEP(R, indicators(R), 130), null, 'volume only 2x');
  const N = epSeries(); N.c[130] = 10.9; assert.equal(detectEP(N, indicators(N), 130), null, 'did not hold a 10% gain');
  const X = bars([...flat(67, 7), ...flat(63, 10)], 0.02, 1e6); set(X, 130, 11.5, 12.6, 11.4, 12.4, 5e6);
  assert.equal(detectEP(X, indicators(X), 130), null, 'already up 40%+ in 3 months: not neglected');
});
test('EP / KQ with an open entry: the stop is live from the entry day; skipped when it opens under the stop', () => {
  const S = epSeries(); S.o.push(12.5); S.h.push(12.6); S.l.push(11.0); S.c.push(11.2); S.v.push(3e6);
  const I = indicators(S), sig = detectEP(epSeries(), indicators(epSeries()), 130), r = simulate('KQ', S, I, 130, sig);
  const stop = Math.max(11.4, 12.5 * (1 - sig.maxRisk)); assert.equal(r.legs[0][3], 'stop'); assert.ok(Math.abs(r.legs[0][2] - stop) < 1e-4);
  const U = epSeries(); U.o.push(11.0); U.h.push(11.2); U.l.push(10.8); U.c.push(11.0); U.v.push(1e6);
  assert.equal(simulate('KQ', U, indicators(U), 130, sig).state, 'skipped');
});

// ---- MB
function mbSeries() { const S = bars([...flat(30, 20), 20.1, 20.0, 20.05], 0.01, 1e6); S.o.push(20.05); S.h.push(21.0); S.l.push(20.0); S.c.push(20.95); S.v.push(1.5e6); return S; }
test('MB: +4% close near the high on rising volume, breadth >= 1, not after 3 up days', () => {
  const S = mbSeries(), I = indicators(S), t = S.c.length - 1;
  const s = detectMB(S, I, t, { breadth: 1.2 }); assert.ok(s); assert.equal(s.stop, 20.0);
  assert.equal(detectMB(S, I, t, { breadth: 0.8 }), null, 'weak breadth');
  const V = mbSeries(); V.v[t] = 0.9e6; assert.equal(detectMB(V, indicators(V), t, { breadth: 1.2 }), null, 'volume under the prior day');
  const U = mbSeries(); U.c[t - 4] = 19.8; U.c[t - 3] = 19.9; U.c[t - 2] = 20.0; U.c[t - 1] = 20.1; U.c[t] = 20.95; assert.equal(detectMB(U, indicators(U), t, { breadth: 1.2 }), null, 'after 3 up closes');
});
test('MB exit: sold at the close of day 5, or at the burst-day low', () => {
  const S = mbSeries(), t = S.c.length - 1; for (const c of [21.2, 21.5, 21.8, 22.0, 22.4, 23]) { S.o.push(c - 0.1); S.h.push(c + 0.2); S.l.push(c - 0.3); S.c.push(c); S.v.push(1e6); }
  const sig = detectMB(mbSeries(), indicators(mbSeries()), t, { breadth: 2 }), r = simulate('MB', S, indicators(S), t, sig);
  assert.equal(r.state, 'closed'); assert.equal(r.x, t + 5); assert.equal(r.legs[0][2], 22.4); assert.ok(Math.abs(r.g - (22.4 / 21.1 - 1)) < 1e-9);
  const L = mbSeries(); L.o.push(20.9); L.h.push(21.0); L.l.push(19.9); L.c.push(20.1); L.v.push(1e6); const r2 = simulate('MB', L, indicators(L), t, sig);
  assert.equal(r2.legs[0][3], 'stop'); assert.equal(r2.legs[0][2], 20.0);
});

// ---- VCP / trend template
function vcpSeries() { const cl = [...ramp(200, 20, 40), ...ramp(60, 40, 60)], S = bars(cl, 0.01, 1e6);
  // contractions over the last 40 sessions: depth ~16%, ~9%, ~4%; quiet volume in the last 10
  const n = S.c.length, seg = (a, b, H, L) => { for (let i = a; i <= b; i++) { S.h[i] = H; S.l[i] = L; S.o[i] = (H + L) / 2; S.c[i] = (H + L) / 2 + 0.3; } };
  seg(n - 40, n - 21, 60, 50.5); seg(n - 20, n - 11, 59.5, 54.5); seg(n - 10, n - 1, 59.2, 57); for (let i = n - 10; i < n; i++) S.v[i] = 5e5; S.c[n - 1] = 58.8; return S; }
test('VCP: trend template + three shrinking contractions + dry volume near the pivot', () => {
  const S = vcpSeries(), I = indicators(S), t = S.c.length - 1;
  assert.equal(trendTemplate(S, I, t, 0.9), true); assert.equal(trendTemplate(S, I, t, 0.5), false, 'relative strength under the top 30%');
  const s = detectVCP(S, I, t, { spyUp: true, rsPct: 0.9 }); assert.ok(s); assert.equal(s.trigger, 59.2); assert.equal(s.base, 57); assert.equal(s.maxAbove, 0.05);
  assert.equal(detectVCP(S, I, t, { spyUp: false, rsPct: 0.9 }), null, 'SPY under its 50-day');
  const W = vcpSeries(); for (let i = W.c.length - 10; i < W.c.length; i++) W.v[i] = 2e6; assert.equal(detectVCP(W, indicators(W), t, { spyUp: true, rsPct: 0.9 }), null, 'no volume dry-up');
});
test('MO exit: half at +20%, stop to the fill after +10%, rest at the next open after a close under the 50-day; no fill 5%+ above the pivot', () => {
  const S0 = vcpSeries(), t = S0.c.length - 1, sig = detectVCP(S0, indicators(S0), t, { spyUp: true, rsPct: 0.9 });
  const G = vcpSeries(); G.o.push(62.5); G.h.push(63); G.l.push(62); G.c.push(62.8); G.v.push(1e6);
  assert.equal(simulate('MO', G, indicators(G), t, sig).state, 'skipped');
  const S = vcpSeries(); const add = (o, h, l, c) => { S.o.push(o); S.h.push(h); S.l.push(l); S.c.push(c); S.v.push(1e6); };
  add(59, 60, 58.8, 59.9); add(60, 65.5, 59.8, 65.2); add(65.2, 71.5, 65, 71); add(71, 71.2, 59.0, 60);
  const r = simulate('MO', S, indicators(S), t, sig);
  assert.equal(r.fill, 59.2); assert.equal(r.legs[0][3], 'half at +20%'); assert.ok(Math.abs(r.legs[0][2] - 59.2 * 1.2) < 1e-9);
  assert.equal(r.legs[1][3], 'stop'); assert.equal(r.legs[1][2], 59.2, 'breakeven stop after the +10% close');
});

// ---- PB
function pbSeries() { const S = bars(ramp(160, 20, 40), 0.01, 1e6), t = 159, I = indicators(S); const e = I.ema21[159];
  set(S, t, e * 1.01, e * 1.04, e * 0.995, e * 1.03, 1e6); return S; }
test('PB: a strong stock dips to its rising 21-day EMA and closes back above it, up on the day', () => {
  const S = pbSeries(), I = indicators(S), s = detectPB(S, I, 159); assert.ok(s); assert.equal(s.stop, S.l[159]);
  const N = pbSeries(); N.c[159] = N.o[159] * 0.99; assert.equal(detectPB(N, indicators(N), 159), null, 'closed down on the day');
  const W = bars(ramp(160, 35, 40), 0.01, 1e6); assert.equal(detectPB(W, indicators(W), 159), null, 'not up 30%');
});
test('PB exit: the next open after a close under the 9-day EMA', () => {
  const S = pbSeries(), sig = detectPB(S, indicators(S), 159), p = S.c[159];
  for (const [o, h, l, c] of [[p, p * 1.03, p * 0.995, p * 1.02], [p * 1.02, p * 1.05, p * 1.01, p * 1.04], [p * 1.03, p * 1.03, p * 0.97, p * 0.975], [p * 0.98, p * 0.99, p * 0.96, p * 0.97]]) { S.o.push(o); S.h.push(h); S.l.push(l); S.c.push(c); S.v.push(1e6); }
  const I = indicators(S), r = simulate('PB', S, I, 159, sig); assert.ok(I.ema9[162] > S.c[162]);
  assert.equal(r.state, 'closed'); assert.equal(r.x, 163); assert.ok(Math.abs(r.legs[0][2] - S.o[163]) < 1e-4);
});

// ---- frog in the pan
test('information discreteness: many small up days = low (negative) ID; a few jumps = high ID', () => {
  const smooth = [100]; for (let i = 0; i < 100; i++) smooth.push(smooth[i] * (i % 5 === 4 ? 0.995 : 1.004));
  const jumpy = [100]; for (let i = 0; i < 100; i++) jumpy.push(jumpy[i] * (i % 20 === 0 ? 1.12 : i % 2 ? 0.998 : 1.001));
  const a = infoDiscreteness(smooth, 0, 100), b = infoDiscreteness(jumpy, 0, 100);
  assert.ok(smooth[100] > 100 && jumpy[100] > 100); assert.ok(a < -0.5); assert.ok(b > a); assert.ok(Math.abs(a - (20 / 100 - 80 / 100)) < 1e-9);
});
test('frogPick: the top 30% by 12-1 return, then the lowest ID first', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ key: 'S' + i, r: i / 10, id: (i % 3) - 1 }));
  const p = frogPick(rows, 0.3, 2).map(x => x.key); assert.deepEqual(p, ['S9', 'S7']);   // winners S9,S8,S7; ids 1? S9 -> 9%3-1=-1, S8 -> 1, S7 -> 0
  const S = bars(ramp(300, 10, 30), 0.01, 1e6), I = indicators(S), f = frogRow(S, I, 299); assert.ok(f.r > 0 && f.id < 0);
});

// ---- crash then stabilising, and its control
function crashSeries(lowerLow) { const S = bars([...flat(40, 40), ...ramp(100, 40, 12), ...flat(20, 12)], 0.04, 1e6); const n = S.c.length;
  for (let i = n - 20; i < n - 10; i++) { S.h[i] = 13.5; S.l[i] = 11; S.c[i] = 12; S.v[i] = 1e6; }
  for (let i = n - 10; i < n; i++) { S.h[i] = 12.6; S.l[i] = lowerLow ? 10.5 : 11.6; S.c[i] = 12.2; S.v[i] = 1.4e6; } return S; }
test('CRASH: down 50%+ in 6 months, no lower low, a tighter range, rising volume; the control keeps making lower lows', () => {
  const S = crashSeries(false), I = indicators(S), t = S.c.length - 1, s = detectCrash(S, I, t); assert.ok(s); assert.equal(s.base, 11.6);
  assert.equal(crashControl(S, I, t), null);
  const C = crashSeries(true), IC = indicators(C); assert.equal(detectCrash(C, IC, t), null); assert.ok(crashControl(C, IC, t));
  S.o.push(12.3); S.h.push(12.8); S.l.push(12.1); S.c.push(12.5); S.v.push(1e6); S.o.push(12.5); S.h.push(12.5); S.l.push(11.3); S.c.push(11.4); S.v.push(1e6); S.o.push(11.2); S.h.push(11.4); S.l.push(11); S.c.push(11.1); S.v.push(1e6);
  const r = simulate('CRASH', S, indicators(S), t, s); assert.equal(r.state, 'closed'); assert.equal(r.x, t + 3); assert.equal(r.legs[0][2], 11.2);
});
test('TIME exit: sold at the close of day 126', () => {
  const S = bars(ramp(400, 10, 20), 0.01, 1e6), r = simulate('TIME', S, indicators(S), 200, { entry: 'open' });
  assert.equal(r.x, 201 + 125); assert.ok(Math.abs(r.g - (S.c[326] / S.o[201] - 1)) < 1e-9);
});
test('a stock with no prices for 15+ sessions is closed at its last price', () => {
  const S = bars(ramp(300, 10, 20), 0.01, 1e6); for (let i = 230; i < 300; i++) { S.o[i] = S.h[i] = S.l[i] = S.c[i] = NaN; }
  const r = simulate('TIME', S, indicators(S), 200, { entry: 'open' }); assert.equal(r.state, 'closed'); assert.equal(r.legs[0][3], 'no more prices'); assert.ok(Math.abs(r.legs[0][2] - S.c[229]) < 1e-4);
});

// ---- live record
test('board stats net of 0.8% cost, and the TRY SMALL readiness rule (30+ trades, 10+ days, positive)', () => {
  const rows = [{ d: 'a', sym: 'X', g: 0.108 }, { d: 'a', sym: 'Y', g: -0.042 }, { d: 'b', sym: 'X', g: 0.008 }];
  const s = boardStats(rows); assert.equal(s.n, 3); assert.equal(s.days, 2); assert.equal(s.stocks, 2);
  assert.equal(s.win, +(1 / 3).toFixed(4)); assert.equal(s.avgWin, 0.1); assert.equal(s.avgLoss, -0.025); assert.equal(s.pf, 2); assert.equal(s.avg, +((0.1 - 0.05 + 0) / 3).toFixed(4));
  assert.equal(trySmallReady({ n: 30, days: 10, avg: 0.001 }), true); assert.equal(trySmallReady({ n: 29, days: 10, avg: 0.01 }), false);
  assert.equal(trySmallReady({ n: 40, days: 9, avg: 0.01 }), false); assert.equal(trySmallReady({ n: 40, days: 12, avg: 0 }), false); assert.equal(COST, 0.008);
});
test('every method has an engine, a block length and a name; RS score needs a year', () => {
  for (const [id, m] of Object.entries(METHODS)) { assert.ok(/^DEC-/.test(id)); assert.ok(m.engine && m.block > 0 && m.name); }
  assert.ok(isNaN(rsScore(ramp(200, 1, 2), 199))); assert.ok(rsScore(ramp(300, 1, 2), 299) > 0);
});
