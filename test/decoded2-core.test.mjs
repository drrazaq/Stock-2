// Seams: decoded2-core.mjs (decoded trader methods, batch 2, 23 Oct 2026). Indicators, every detector on synthetic daily bars, the generic
// exit engine (entries, worst-case same-day stops, targets, partials, trails, scale-ins, Turtle units, bail-out) and its agreement with
// batch 1's own exits. Pure functions, no network, no files. Run: node test/decoded2-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { indicators, simulate, detectQBO, detectPB } from '../decoded-core.mjs';
import * as D2 from '../decoded2-core.mjs';
const { ind2, simulate2, METHODS2, EXITS, rsiArr, wilderArr, fromBase, NEEDS_DATA2 } = D2;

function bars(closes, a = 0.01, v = 1e6) { const S = { o: [], h: [], l: [], c: [], v: [] };
  closes.forEach((c, i) => { S.o.push(i ? closes[i - 1] : c); S.c.push(c); S.h.push(Math.max(c, S.o[i]) * (1 + a)); S.l.push(Math.min(c, S.o[i]) * (1 - a)); S.v.push(v); }); return S; }
const ramp = (n, a, b) => Array.from({ length: n }, (_, i) => a + (b - a) * (i + 1) / n);
const flat = (n, x) => Array(n).fill(x);
const set = (S, t, o, h, l, c, v) => { S.o[t] = o; S.h[t] = h; S.l[t] = l; S.c[t] = c; if (v !== undefined) S.v[t] = v; };
const push = (S, o, h, l, c, v = 1e6) => { S.o.push(o); S.h.push(h); S.l.push(l); S.c.push(c); S.v.push(v); };
const X = (m) => METHODS2[m];
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('indicators: Wilder average, RSI(2), ADX direction', () => {
  assert.ok(near(wilderArr([2, 4, 6, 8], 2)[1], 3)); assert.ok(near(wilderArr([2, 4, 6, 8], 2)[2], 4.5));
  const r = rsiArr(ramp(10, 10, 20), 2); assert.equal(r[9], 100);
  const I = ind2(bars(ramp(80, 10, 30))); assert.ok(I.adx[79] > 30 && I.pdi[79] > I.mdi[79]);
});
test('every method has a detector, a block, a time limit; 91 versions; needs-data list', () => {
  assert.equal(Object.keys(METHODS2).length, 91);
  for (const [k, m] of Object.entries(METHODS2)) { assert.equal(typeof m.detect, 'function', k); assert.ok(m.block > 0 && m.maxDays > 0, k); }
  assert.ok(Object.keys(NEEDS_DATA2).includes('DEC2-SHORT-CATALYST') && Object.keys(NEEDS_DATA2).includes('DEC2-EPS-REV'));
});

// ---- the engine reproduces batch 1's own exits (KQ for QBO, PB) on batch 1's fixtures
function qboSeries() { const cl = [...flat(120, 10), ...ramp(30, 10, 14)], S = bars(cl, 0.03);
  const base = [[13.9, 14.25, 13.5, 13.8], [13.8, 14.2, 13.45, 13.9], [13.9, 14.2, 13.5, 13.7], [13.7, 14.1, 13.4, 13.85], [13.85, 14.2, 13.5, 13.9],
    [13.9, 14.2, 13.6, 13.95], [13.95, 14.2, 13.65, 14.0], [14.0, 14.22, 13.7, 14.05], [14.05, 14.2, 13.75, 14.1], [14.1, 14.24, 13.8, 14.15]];
  for (const b of base) push(S, ...b); return S; }
test('engine = batch-1 KQ exit (QBO) for the F- versions, and ADD adds 50% at a new closing high', () => {
  const t = 159, sig = detectQBO(qboSeries(), indicators(qboSeries()), t, { regime: true });
  for (const days of [[[14.1, 15.0, 14.0, 14.9], [14.9, 15.6, 14.7, 15.5], [15.5, 16.2, 15.3, 16.0], [16.0, 16.8, 15.9, 16.6], [16.6, 16.9, 14.3, 14.4], [14.5, 14.8, 14.3, 14.6]],
    [[14.1, 14.6, 14.0, 14.4], [14.4, 14.5, 13.9, 14.0]], [[14.1, 14.5, 12.5, 13.0]]]) {
    const S = qboSeries(); for (const d of days) push(S, ...d, 2e6); const a = simulate('KQ', S, indicators(S), t, sig), b = simulate2(X('DEC2-F-QBO-EXT20'), S, ind2(S), t, METHODS2['DEC2-F-QBO-EXT20'].detect(qboSeries(), ind2(qboSeries()), t, { regime: true }));
    assert.equal(b.state, a.state); assert.ok(near(a.g, b.g), a.g + ' vs ' + b.g); }
  const S = qboSeries(); for (const d of [[14.1, 15.0, 14.0, 14.9], [14.9, 15.6, 14.7, 15.5], [15.5, 16.2, 15.3, 16.0], [16.0, 16.8, 15.9, 16.6], [16.6, 16.9, 14.3, 14.4], [14.5, 14.8, 14.3, 14.6]]) push(S, ...d, 2e6);
  const sg = X('DEC2-F-QBO-ADD').detect(qboSeries(), ind2(qboSeries()), t, { regime: true }), r = simulate2(X('DEC2-F-QBO-ADD'), S, ind2(S), t, sg);
  const add = r.legs.find(z => z[3].startsWith('add')); assert.ok(add, 'added'); assert.equal(add[2], 15.5);   // day 2 close 15.5 >= 14.25 x 1.05 and a new high
  assert.ok(r.g < simulate('KQ', S, indicators(S), t, sig).g, 'the add at 15.5 lowers the % return of this trade');
});
test('engine = batch-1 PB exit; EXT10 refuses an extended signal', () => {
  const S = bars([...flat(70, 10), ...ramp(70, 10, 16)], 0.01); const I = ind2(S), t = 139; const e21 = I.ema21[t];
  set(S, t, e21 * 1.003, e21 * 1.03, e21 * 0.999, e21 * 1.02); const I2 = ind2(S), p = detectPB(S, indicators(S), t); assert.ok(p, 'PB fires');
  for (const tail of [[[S.c[t] * 1.01, S.c[t] * 1.05, S.c[t] * 1.005, S.c[t] * 1.04], [S.c[t] * 1.04, S.c[t] * 1.05, S.c[t] * 0.9, S.c[t] * 0.92], [S.c[t] * 0.92, S.c[t] * 0.93, S.c[t] * 0.9, S.c[t] * 0.91]]]) {
    const W = { o: [...S.o], h: [...S.h], l: [...S.l], c: [...S.c], v: [...S.v] }; for (const d of tail) push(W, ...d);
    const a = simulate('PB', W, indicators(W), t, p), b = simulate2(X('DEC2-F-PB-EXT20'), W, ind2(W), t, X('DEC2-F-PB-EXT20').detect(S, I2, t, {}));
    assert.equal(a.state, b.state); assert.ok(near(a.g, b.g)); }
  const E = bars([...flat(70, 10), ...ramp(70, 10, 40)], 0.01); assert.ok(E.c[139] > 1.10 * ind2(E).sma20[139]);
  assert.equal(X('DEC2-F-PB-EXT10').detect(E, ind2(E), 139, {}), null);
});
test('STRONG filter: no signal unless the strong market flag is on (or the no-filter shadow)', () => {
  const S = qboSeries(), I = ind2(S), t = 159; assert.equal(X('DEC2-F-QBO-STRONG').detect(S, I, t, { regime: true, strong: false }), null);
  assert.ok(X('DEC2-F-QBO-STRONG').detect(S, I, t, { regime: true, strong: true })); assert.ok(X('DEC2-F-QBO-STRONG').detect(S, I, t, { regime: true, nf: true }));
});
test('exit set (A): day-low vs 2 ATR stop, 10-day-low trail, half at 3R', () => {
  const t = 159, S0 = qboSeries(), b = detectQBO(S0, indicators(S0), t, { regime: true }), I0 = ind2(S0);
  const dl = fromBase('QBO', b, I0.atr14[t], b.adr, 'DL'), a2 = fromBase('QBO', b, I0.atr14[t], b.adr, '2A');
  assert.equal(dl.stopEntryLow, true); assert.ok(near(a2.stopAtr, 2 * I0.atr14[t]));
  const n = D2.baseNums(b, I0, t); for (const id of ['DEC2-X-QBO-DL-L10-P', 'DEC2-X-QBO-2A-S50-N', 'DEC2-F-QBO-ADD']) assert.deepEqual(METHODS2[id].mk(n), METHODS2[id].detect(S0, I0, t, { regime: true }), id + ': the paper line rebuilds the same signal');
  const memo = {}; D2.baseSignal('QBO', S0, I0, t, { regime: true, memo }); assert.ok('QBO' in memo);
  const S = qboSeries(); for (const d of [[14.1, 14.4, 14.0, 14.3], ...Array.from({ length: 12 }, (_, i) => [14.3 + i * 0.4, 14.9 + i * 0.4, 14.25 + i * 0.4, 14.7 + i * 0.4])]) push(S, ...d);
  const r = simulate2(X('DEC2-X-QBO-DL-L10-P'), S, ind2(S), t, dl); const half = r.legs.find(z => z[3] === 'partial at 3R'); assert.ok(half, 'half at 3R');
  assert.ok(near(half[2], 14.25 + 3 * (14.25 - 14.0)), 'R from the entry-day low (14.0)'); assert.equal(half[1], 0.5);
  const D = qboSeries(); for (const d of [[14.1, 14.4, 14.0, 14.3], [14.3, 14.35, 13.9, 14.0]]) push(D, ...d);
  const z = simulate2(X('DEC2-X-QBO-DL-L10-N'), D, ind2(D), t, dl); assert.equal(z.state, 'closed'); assert.equal(z.legs[0][2], 14.0);
});

// ---- breakouts
test('Darvas: buy-stop over a confirmed box top at a 52-week high; stop under the box bottom; raised by the next box', () => {
  const S = bars([...ramp(260, 5, 10), 10.2, 10.6, 11.0], 0.005); const p = S.c.length - 1; set(S, p, 10.6, 11.2, 10.5, 11.0);
  for (const c of [10.8, 10.6, 10.5, 10.7, 10.8, 10.9]) push(S, c, c * 1.01, c * 0.995, c); const t = S.c.length; push(S, 10.9, 11.5, 10.85, 11.4);
  const sig = D2.detectDarvas(S, ind2(S), t); assert.ok(sig); assert.equal(sig.entry, 'today'); assert.equal(sig.fill, 11.2); assert.ok(near(sig.stop, 10.5 * 0.995 * 0.995));
  for (const c of [11.6, 12.4, 12.3, 12.2, 12.25, 12.3, 12.35, 12.3]) push(S, c - 0.1, c * 1.01, c * 0.99, c);
  const r = simulate2(X('DEC2-DARVAS'), S, ind2(S), t, sig); assert.equal(r.state, 'open'); assert.ok(r.stop > sig.stop, 'stop raised under the newer box');
});
test('Turtles: 20-day breakout fills during the day, 2N stop, a unit added at +1/2 N, exit under the 10-day low', () => {
  const S = bars(flat(80, 10), 0.01); const t = S.c.length; push(S, 10.05, 10.5, 10.0, 10.4);
  const sig = METHODS2['DEC2-TURT20'].detect(S, ind2(S), t); assert.ok(sig); assert.ok(near(sig.fill, 10.1)); assert.ok(near(sig.stop, 10.1 - 2 * sig.N));
  push(S, 10.4, 10.9, 10.35, 10.8); for (let i = 0; i < 10; i++) push(S, 10.8, 10.85, 10.6, 10.7); push(S, 10.65, 10.66, 9.5, 9.6);
  const r = simulate2(X('DEC2-TURT20'), S, ind2(S), t, sig); assert.equal(r.state, 'closed'); assert.ok(r.legs.some(z => z[3] === 'Turtle unit at +1/2 N'));
  assert.equal(r.legs[r.legs.length - 1][3], 'stop'); assert.ok(near(r.legs[r.legs.length - 1][2], Math.max(10.8 - 2 * sig.N, 10.6 * 1)));
  assert.equal(X('DEC2-TURT20').skipIfLastWin, true); assert.equal(!!X('DEC2-TURT55').skipIfLastWin, false);
});
test('Weinstein: weekly breakout on 2x volume, MA turning up, RS > 0, SPY over its 30-week; exit on a week close under the 30-week', () => {
  const S = bars([...ramp(200, 8, 10), ...flat(100, 10)], 0.01, 1e6), spy = flat(320, 100); const ws = 300; for (let i = 0; i < 5; i++) push(S, 10.1 + i * 0.2, 10.4 + i * 0.2, 10.0 + i * 0.2, 10.3 + i * 0.2, 3e6); const t = 304;
  const I = ind2(S), ctx = { wkEnd: true, ws, spyC: spy, spy150: true }; const s = D2.detectWein(S, I, t, ctx); assert.ok(s, 'fires'); assert.equal(s.entry, 'open'); assert.equal(s.skipRisk, 0.15);
  assert.equal(D2.detectWein(S, I, t, { ...ctx, spy150: false }), null, 'market filter'); assert.ok(D2.detectWein(S, I, t, { ...ctx, spy150: false, nf: true }), 'no-filter shadow');
  assert.equal(D2.detectWein(S, I, t, { ...ctx, wkEnd: false }), null, 'only on the week\'s last session');
  const W = { ...S, c: [...S.c] }; const J = ind2(W); J.wkEnd = new Uint8Array(400); J.wkEnd[310] = 1; for (let i = 0; i < 8; i++) push(W, 10, 10.1, 9.9, 9.95);
  W.c[310] = 5; const J2 = ind2(W); J2.wkEnd = J.wkEnd; assert.equal(X('DEC2-WEIN').exit(W, J2, 310, {}).next, 'week closed under the 30-week average');
});
test('Livermore: close through the pivot after a 10%+ reaction, on volume; out under the pivot', () => {
  const S = bars([...ramp(250, 5, 20), ...ramp(10, 20, 17.5), ...ramp(9, 17.5, 19.9)], 0.01); const t = S.c.length; push(S, 19.9, 20.6, 19.8, 20.5, 2e6);
  const s = D2.detectLiver(S, ind2(S), t); assert.ok(s); assert.ok(near(s.P, 20)); assert.ok(s.react >= 0.10);
  assert.equal(X('DEC2-LIVER').exit({ ...S, c: [...S.c.slice(0, t + 1), 19.5] }, ind2(S), t + 1, { sig: s, maxC: 20.5 }).next, 'closed back under the pivotal point');
});
test('Zanger: close over a tight base on volume, 7% max stop, day-one rule, 25% at +15%', () => {
  const S = bars([...ramp(200, 5, 10), ...flat(20, 10)], 0.02); const t = S.c.length; push(S, 10.1, 10.5, 10.05, 10.4, 2e6);
  const s = D2.detectZanger(S, ind2(S), t); assert.ok(s); assert.ok(near(s.stop, Math.max(0.99 * 10.2, 0.93 * 10.4))); assert.equal(s.targetFrac, 0.25);
  push(S, 10.4, 10.45, 10.3, 10.35); const r = simulate2(X('DEC2-ZANGER'), S, ind2(S), t, s); assert.equal(r.legs[0][3], 'no acceleration on day one');
});
test('IBD: RS 85+ base breakout on 40% more volume; 20% profit taken, or held 8 weeks if it came within 3 weeks', () => {
  const S = bars([...ramp(120, 5, 10), ...ramp(100, 10, 14), ...flat(40, 14)], 0.03); const t = S.c.length; push(S, 14.2, 14.7, 14.1, 14.6, 2e6);
  const I = ind2(S); assert.equal(D2.detectIBD(S, I, t, { spyUp: true, rsPct: 0.8 }), null); const s = D2.detectIBD(S, I, t, { spyUp: true, rsPct: 0.9 }); assert.ok(s); assert.equal(s.stopPct, 0.08);
  const W = { o: [...S.o], h: [...S.h], l: [...S.l], c: [...S.c], v: [...S.v] }; for (let i = 1; i <= 45; i++) { const c = 14.6 * (1 + Math.min(i * 0.03, 0.3)); push(W, c * 0.99, c * 1.01, c * 0.98, c); }
  const r = simulate2(X('DEC2-IBD'), W, ind2(W), t, s); assert.equal(r.legs[0][3], 'end of the 8-week hold'); assert.equal(r.legs[0][0] - r.k + 1, 40);
  const Z = { o: [...S.o], h: [...S.h], l: [...S.l], c: [...S.c], v: [...S.v] }; for (let i = 1; i <= 30; i++) { const c = 14.6 * (1 + i * 0.008); push(Z, c * 0.99, c * 1.01, c * 0.985, c); }
  const q = simulate2(X('DEC2-IBD'), Z, ind2(Z), t, s); assert.equal(q.legs[0][3], 'took the 20% profit');
});
test('Bollinger squeeze fires on a close over the band after a 6-month low bandwidth; the SAR stop only rises', () => {
  const S = bars([...Array.from({ length: 160 }, (_, i) => 10 + Math.sin(i / 3) * (1 - i / 170))], 0.002); const t = S.c.length; push(S, 10, 10.6, 9.99, 10.5);
  const s = D2.detectBBSQ(S, ind2(S), t); assert.ok(s); for (let i = 0; i < 6; i++) push(S, 10.5 + i * 0.1, 10.7 + i * 0.1, 10.45 + i * 0.1, 10.6 + i * 0.1);
  const st = { sig: s }; const I = ind2(S); let prev = -Infinity; for (let j = t + 1; j < t + 7; j++) { const r = EXITS.sar(S, I, j, st); assert.ok(r.stop >= prev); prev = r.stop; } assert.ok(prev > s.stop);
});
test('Keltner: buy over yesterday\'s upper band; the stop follows the lower band', () => {
  const S = bars(flat(30, 10), 0.01); const I = ind2(S); const t = S.c.length; push(S, 10, 10.5, 9.95, 10.4); const s = D2.detectKelt(S, ind2(S), t); assert.ok(s); assert.ok(near(s.fill, I.kUp[t - 1])); assert.ok(near(s.stop, I.kLo[t - 1]));
});
test('Golden cross, Ichimoku, Appel MACD: fire on the cross, exit on the opposite signal', () => {
  const S = bars([...flat(250, 10), ...ramp(100, 10, 15)], 0.01); const I = ind2(S); let g = -1; for (let t = 230; t < S.c.length; t++) if (D2.detectGoldx(S, I, t)) { g = t; break; }
  assert.ok(g > 0, 'golden cross found'); assert.ok(I.sma50[g - 1] <= I.sma200[g - 1]);
  const n = 120, Ic = { dv20: Array(n).fill(1e7), spanA: Array(n).fill(10), spanB: Array(n).fill(10.5), tenkan: Array(n).fill(10.2), kijun: Array(n).fill(10) }, Sc = { c: Array(n).fill(10) };
  Sc.c[115] = 10.8; Ic.spanA[115] = 11; assert.ok(D2.detectIchi(Sc, Ic, 115), 'cloud breakout'); Ic.tenkan[115] = 9.9; assert.equal(D2.detectIchi(Sc, Ic, 115), null, 'tenkan under kijun');
  let a = -1; for (let t = 60; t < S.c.length; t++) if (D2.detectAppel(S, I, t)) { a = t; break; } assert.ok(a > 0 && I.macdB[a] > I.sigB[a]);
  assert.equal(X('DEC2-GOLDX').exit({ c: S.c }, { sma50: [1], sma200: [2] }, 0, {}).next, 'death cross');
});
test('pocket pivot and buyable gap-up; the 10-day violation + undercut sells, the 50-day takes over after 7 weeks', () => {
  const S = bars([...ramp(210, 5, 10)], 0.01); const t = S.c.length; S.v[t - 3] = 1.5e6; S.c[t - 3] = S.c[t - 4] * 0.99; const I = ind2(S); const m = I.sma10[t - 1];
  push(S, m * 1.0, m * 1.03, m * 0.995, m * 1.025, 2e6); const p = D2.detectPocket(S, ind2(S), t); assert.ok(p, 'pocket pivot'); assert.equal(p.entry, 'close');
  const B = bars(ramp(250, 5, 10), 0.01); const J = ind2(B), u = B.c.length; push(B, B.c[u - 1] + J.atr40[u - 1], B.c[u - 1] + 1.2 * J.atr40[u - 1], B.c[u - 1] + 0.9 * J.atr40[u - 1], B.c[u - 1] + 1.1 * J.atr40[u - 1], 3e6);
  const g = D2.detectBGU(B, ind2(B), u); assert.ok(g); assert.equal(g.stop, B.l[u]);
  const st = { k: 0, sig: { entry: 'close' }, stop: 5 }; const I2 = { sma10: [0, 11, 11], sma50: [0, 8, 8] }; const Sx = { c: [10, 10.5, 10.9], l: [9, 10.2, 10.6] };
  assert.equal(EXITS.oneil(Sx, I2, 0, st), null); assert.deepEqual(EXITS.oneil(Sx, I2, 1, st), { stopTo: 10.2 }); assert.equal(st.below10, true);
  assert.deepEqual(EXITS.oneil({ c: [10, 10.5, 11.5], l: Sx.l }, I2, 2, st), { stopTo: 5 });
  const s7 = { k: 0, sig: { entry: 'close' }, stop: 5 }; EXITS.oneil(Sx, I2, 0, s7); s7.below10 = false; EXITS.oneil({ c: Array(40).fill(12), l: Array(40).fill(11) }, { sma10: Array(40).fill(11), sma50: Array(40).fill(8) }, 36, s7); assert.equal(s7.line, 'sma50');
});
test('Kell wedge pop: gap back over the EMAs after a tight dip; half at the exhaustion extension', () => {
  const S = bars([...ramp(205, 5, 10), 9.9, 9.85, 9.9, 9.95, 9.9], 0.005); const t = S.c.length; push(S, 10.15, 10.4, 10.1, 10.35, 2e6);
  const s = D2.detectWedge(S, ind2(S), t); assert.ok(s); assert.equal(s.stop, 10.1);
  const r = X('DEC2-WEDGE').exit({ c: [13] }, { ema10: [10], ema20: [9] }, 0, { k: -1 }); assert.deepEqual(r.sellClose, [0.5, 'exhaustion extension: half sold']);
});
test('Minervini template (fresh) + 25% trail; Stine needs a small share count', () => {
  const S = bars([...ramp(300, 5, 20)], 0.01), I = ind2(S); assert.ok(D2.detectMinTT(S, I, 299, { rsPct: 0.9, rsPrev: 0.5 })); assert.equal(D2.detectMinTT(S, I, 299, { rsPct: 0.9, rsPrev: 0.9 }), null);
  assert.deepEqual(X('DEC2-MINTT').exit(S, I, 0, { maxC: 40 }), { stop: 30 });
  const F = bars([...flat(270, 10).map((x, i) => x + (i % 7) * 0.1)], 0.01); const t = F.c.length; push(F, 10.6, 11.5, 10.5, 11.4, 5e6);
  assert.ok(D2.detectStine(F, ind2(F), t, { shares: 20e6 })); assert.equal(D2.detectStine(F, ind2(F), t, { shares: 80e6 }), null);
});
// ---- pullbacks / reversals
test('Holy Grail: buy-stop over the EMA-touch bar, stop at its low, target the swing high', () => {
  const S = bars([...flat(50, 10), ...ramp(14, 10, 18), 17.6, 17.2], 0.004); const I = ind2(S); const t = S.c.length; const e = I.ema20[t - 1];
  push(S, 17.0, 17.1, e * 0.98, 17.05); const s = D2.detectHolyG(S, ind2(S), t); assert.ok(s, 'fires'); assert.equal(s.trigger, 17.1); assert.equal(s.target, S.h[63]);
  push(S, 17.1, 17.5, 17.0, 17.4); push(S, 17.4, 18.5, 17.3, 18.3); const r = simulate2(X('DEC2-HOLYG'), S, ind2(S), t, s); assert.equal(r.legs[0][3], 'target'); assert.ok(near(r.legs[0][2], S.h[63]));
});
test('80-20 and NR7 inside day: worst-case same-day stop; 80-20 sells on day 2', () => {
  const S = bars(flat(30, 10), 0.01); const t = S.c.length; push(S, 10.18, 10.2, 9.8, 9.82); push(S, 9.7, 9.9, 9.65, 9.88); push(S, 9.88, 10.1, 9.8, 10.0);
  const s = D2.detect8020(S, ind2(S), t + 1); assert.ok(s); assert.equal(s.fill, 9.8); const r = simulate2(X('DEC2-8020'), S, ind2(S), t + 1, s); assert.equal(r.x, t + 2); assert.ok(near(r.g, 10.0 / 9.8 - 1));
  const N = bars(flat(30, 10), 0.03); const u = N.c.length; push(N, 10, 10.1, 9.95, 10.05); const n7 = D2.detectNR7ID(N, ind2(N), u); assert.ok(n7);
  push(N, 10.05, 10.2, 9.9, 10.15); const q = simulate2(X('DEC2-NR7ID'), N, ind2(N), u, n7); assert.equal(q.legs[0][3], 'stop the same day (worst case: the low counted after the buy)');
});
test('Larry Williams: buy-stop at open + half a range; bail out at the first profitable open', () => {
  const S = bars(ramp(30, 9, 10), 0.01); const t = S.c.length; const r0 = S.h[t - 1] - S.l[t - 1]; push(S, 10, 10.3, 9.95, 10.2);
  const s = D2.detectLWVB(S, ind2(S), t); assert.ok(near(s.fill, 10 + 0.5 * r0)); push(S, 10.25, 10.3, 10.1, 10.2);
  const r = simulate2(X('DEC2-LWVB'), S, ind2(S), t, s); assert.equal(r.legs[0][3], 'first profitable open'); assert.equal(r.legs[0][2], 10.25);
});
test('Connors: RSI(2) exit over the 5-day; TPS scales in 10/20/30/40 and exits at RSI(2) > 70; Double 7s', () => {
  const S = bars([...ramp(220, 5, 12), 11.6, 11.2, 10.9], 0.01); const t = S.c.length - 1, I = ind2(S); assert.ok(I.rsi2[t] < 5); assert.ok(D2.detectRSI2(S, I, t)); assert.ok(D2.detectTPS(S, I, t)); assert.ok(D2.detectDbl7(S, I, t));
  const W = { o: [...S.o], h: [...S.h], l: [...S.l], c: [...S.c], v: [...S.v] }; push(W, 10.9, 10.9, 10.6, 10.7); push(W, 10.7, 10.7, 10.4, 10.5); push(W, 10.5, 11.6, 10.5, 11.5);
  const r = simulate2(X('DEC2-TPS'), W, ind2(W), t, D2.detectTPS(S, I, t)); const adds = r.legs.filter(z => z[1] < 0); assert.equal(adds.length, 2);
  const inv = 0.1 + 0.2 + 0.3, sh = 0.1 / 10.9 + 0.2 / 10.7 + 0.3 / 10.5; assert.ok(near(r.g, sh * 11.5 / inv - 1)); assert.equal(r.legs[r.legs.length - 1][3], 'RSI(2) over 70');
  const q = simulate2(X('DEC2-RSI2'), W, ind2(W), t, D2.detectRSI2(S, I, t)); assert.equal(q.legs[0][3], 'close over the 5-day average');
});
test('Brooks H2, Nison and Turtle Soup Plus One fire on their patterns', () => {
  const S = bars([...flat(40, 10), ...ramp(30, 10, 15)], 0.003); for (const b of [[15, 15.05, 14.8, 14.9], [14.9, 14.9, 14.6, 14.7], [14.7, 14.95, 14.7, 14.8], [14.8, 14.8, 14.5, 14.55], [14.55, 14.75, 14.0, 14.6]]) push(S, ...b);
  const I = ind2(S), t = S.c.length - 1; const h2 = D2.detectH2(S, ind2(S), t); assert.ok(h2, 'H2'); assert.equal(X('DEC2-H2').partialR, 2);
  const N = bars([...flat(30, 10), ...ramp(10, 10, 9)], 0.005); const y = N.c.length; push(N, 8.95, 9.0, 8.7, 8.98); push(N, 9.0, 9.2, 8.98, 9.15);
  const ns = D2.detectNison(N, ind2(N), y + 1); assert.ok(ns); assert.equal(ns.info.pattern, 'hammer'); assert.equal(ns.pl, 8.7);
  const T = bars([...flat(35, 10)], 0.005); T.l[30] = 9.5; const u = T.c.length; push(T, 9.6, 9.65, 9.3, 9.4); const ts = D2.detectTSoup(T, ind2(T), u); assert.ok(ts); assert.equal(ts.trigger, 9.5); assert.equal(ts.lowCap, 9.3);
  push(T, 9.35, 9.7, 9.2, 9.6); const r = simulate2(X('DEC2-TSOUP'), T, ind2(T), u, ts); assert.equal(r.state, 'open'); assert.equal(r.stop, 9.2);
});
test('Wyckoff spring: break under support, close back inside; half at the range top with the stop to cost', () => {
  const S = bars(Array.from({ length: 80 }, (_, i) => 10 + 0.8 * Math.sin(i / 4)), 0.005); const t = S.c.length; const Sp = Math.min(...S.l.slice(t - 60, t - 5));
  push(S, Sp * 1.01, Sp * 1.02, Sp * 0.97, Sp * 1.015); const s = D2.detectWyck(S, ind2(S), t); assert.ok(s); assert.equal(s.targets[0].frac, 0.5); assert.equal(s.targets[0].be, true);
  const top = s.targets[0].px; push(S, Sp * 1.02, Sp * 1.03, Sp * 1.0, Sp * 1.025); push(S, top * 0.99, top * 1.01, top * 0.98, top); const r = simulate2(X('DEC2-WYCK'), S, ind2(S), t, s);
  assert.equal(r.state, 'open'); assert.equal(r.held, 0.5); assert.ok(near(r.stop, r.fill));
});
test('gap and go (stop if the gap fills) and gap fill (target = yesterday\'s close)', () => {
  const S = bars(ramp(60, 8, 10), 0.01); const t = S.c.length; push(S, 10.5, 10.7, 9.9, 10.4); const g = D2.detectGapGo(S, ind2(S), t); assert.ok(g);
  const r = simulate2(X('DEC2-GAPGO'), S, ind2(S), t, g); assert.equal(r.legs[0][3], 'stop'); assert.equal(r.legs[0][2], 10);
  const F = bars(ramp(220, 8, 10), 0.01); const u = F.c.length; push(F, 9.7, 10.05, 9.6, 9.9); const f = D2.detectGapFill(F, ind2(F), u); assert.ok(f); const q = simulate2(X('DEC2-GAPFILL'), F, ind2(F), u, f); assert.equal(q.legs[0][2], 10);
});
test('calendar (SPY only): Santa and turn of the month read the month position', () => {
  const S = bars(flat(30, 100)), I = ind2(S); I.mon = new Uint8Array(30).fill(12); I.mLeft = new Int16Array(30); I.mIdx = new Int16Array(30); I.mLeft[10] = 5; I.mLeft[20] = 1;
  assert.ok(D2.detectSanta(S, I, 10)); assert.equal(D2.detectSanta(S, I, 11), null); assert.ok(D2.detectTOM(S, I, 20)); assert.equal(X('DEC2-SANTA').spyOnly, true);
});
test('FROG combination needs basket membership; CONTRACT needs a recent 8-K 1.01 and a small value; INSQ needs the B-FCF1 pass', () => {
  const S = qboSeries(), I = ind2(S), t = 159; assert.equal(D2.detectFrogTrig(S, I, t, { regime: true, frogIn: false }), null); const f = D2.detectFrogTrig(S, I, t, { regime: true, frogIn: true });
  assert.equal(f.info.via, 'QBO'); assert.equal(f.stop, Math.min(...S.l.slice(150, 160)));
  const C = bars(flat(80, 10), 0.01); const u = C.c.length; push(C, 10.1, 10.6, 10.05, 10.5, 3e6); const J = ind2(C);
  assert.ok(D2.detectContract(C, J, u, { contract: true, mcap: 5e8 })); assert.equal(D2.detectContract(C, J, u, { contract: true, mcap: 3e9 }), null); assert.equal(D2.detectContract(C, J, u, { contract: false, mcap: 5e8 }), null);
  assert.equal(D2.detectInsQ(C, J, u, { insq: { n: 2, usd: 3e5 }, fcfOk: () => false }), null); assert.ok(D2.detectInsQ(C, J, u, { insq: { n: 2, usd: 3e5 }, fcfOk: () => true }));
});
