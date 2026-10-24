// Seams of the SQUAD 3 money-management lab (squad3-core.mjs, pure; squad3-lab.mjs reads and writes). No network, no files.
//   sizeFor / buyCash / sellCash   sizing math (fixed, % of equity, volatility target with cap and floor) and cost math
//   runAccount                     the cash account: time exit, stop at the next open, cash reservation (full size or skip), sales
//                                  before buys, liquidity order, pyramiding (once), cut -8% + 50-day trail, regime, sector cap,
//                                  drawdown brake, rank-and-rotate
//   regimeAt / holdFund / curve / gates / preRegister
// Run: node test/squad3-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { POLICIES, PLAIN, RULES, COST, FEE, sizeFor, buyCash, sellCash, runAccount, regimeAt, holdFund, curve, gates, top2Usd, preRegister, indicators, stopFor } from '../squad3-core.mjs';
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, a + ' vs ' + b);
const T = 400, D = Array.from({ length: T }, (_, t) => { const d = new Date(Date.UTC(2022, 0, 3) + t * 864e5); return d.toISOString().slice(0, 10); });
const flat = (px = 100) => ({ O: new Float64Array(T).fill(px), C: new Float64Array(T).fill(px) });
const cand = (sym, t, extra = {}) => ({ sym, rule: 'ANOM-RESMOM', family: 'MOMENTUM', sector: 'S' + sym, halal: 'unknown', t, k: t + 1, hold: 10, stop: 0.15, liq: 1, ...extra });
const run = (o) => runAccount({ D, a: 0, b: T - 1, capital: 10000, policy: PLAIN, ...o });

test('registry: 11 pre-registered policies, 8 input rules with family and hold, stop by hold', () => {
  assert.equal(Object.keys(POLICIES).length, 11); assert.ok(Object.keys(POLICIES).every(k => /^SQ3-/.test(k)));
  assert.equal(Object.keys(RULES).length, 8); for (const r of Object.values(RULES)) { assert.ok(['VALUE', 'MOMENTUM', 'EARNINGS', 'MACRO'].includes(r.family)); assert.ok(r.hold > 0); }
  assert.equal(stopFor(126), 0.35); assert.equal(stopFor(63), 0.15);
});

test('sizing math: fixed, % of equity, volatility target (cap 20%, floor 250 USD)', () => {
  assert.equal(sizeFor({ kind: 'fixed', usd: 1000 }, { eq: 55555 }), 1000);
  near(sizeFor({ kind: 'equity', frac: 0.1 }, { eq: 25000 }), (2500 - 3) / 1.004);   // 2,500 of cash out, costs included
  const v = POLICIES['SQ3-VOLRISK'].size;
  near(sizeFor(v, { eq: 10000, sigma: 0.025 }), 10000 * 0.01 / (3 * 0.025));   // 1,333 USD
  near(sizeFor(v, { eq: 10000, sigma: 0.005 }), 2000);                         // capped at 20% of equity
  assert.equal(sizeFor(v, { eq: 1000, sigma: 0.05 }), 0);                      // 66 USD < 250: skip
  assert.equal(sizeFor(v, { eq: 10000, sigma: NaN }), 0);                      // no volatility known: skip
});

test('cost math: 0.4% + 3 USD on each side; a flat round trip of 1,000 USD costs 14 USD', () => {
  near(buyCash(1000), 1007); near(sellCash(1000), 993); near(buyCash(1000) - sellCash(1000), 14);
  near(buyCash(1000, 0.012), 1009);
});

test('time exit at the close of the last hold session; cash math exact', () => {
  const s = flat(100); for (let t = 6; t < T; t++) { s.O[t] = 110; s.C[t] = 110; }
  const r = run({ cands: [cand('A', 0)], series: () => s });   // buy open 1 at 100, hold 10 -> sold at close 10 at 110
  assert.equal(r.trades.length, 1); const z = r.trades[0]; assert.equal(z.k, 1); assert.equal(z.x, 10); assert.equal(z.why, 'time');
  near(z.usd, sellCash(1100) - buyCash(1000)); near(r.cash, 10000 + z.usd);
  near(r.eq[5], 10000 - buyCash(1000) + 1000); near(r.eq[T - 1], r.cash);
});

test('stop: a close 15% under the buy sells at the NEXT open', () => {
  const s = flat(100); s.C[3] = 84; s.O[4] = 83; s.C[4] = 83;
  const r = run({ cands: [cand('A', 0)], series: () => s }); const z = r.trades[0];
  assert.equal(z.why, 'stop'); assert.equal(z.x, 4); near(z.usd, sellCash(830) - buyCash(1000));
});

test('cash reservation: full size, else what the cash covers if at least half, else skip; most liquid first; cash never negative', () => {
  const s = flat(100), cands = [cand('A', 0, { liq: 1 }), cand('B', 0, { liq: 3 }), cand('C', 0, { liq: 2 })];
  const r = runAccount({ D, a: 0, b: 5, capital: 2020, policy: PLAIN, cands, series: () => s });   // 2 x 1,007 = 2,014; 6 USD left: A skipped
  assert.deepEqual(r.trades.map(z => z.sym).sort(), ['B', 'C']); assert.equal(r.skippedCash, 1); assert.equal(r.partial, 0);
  const r2 = runAccount({ D, a: 0, b: 5, capital: 2000, policy: PLAIN, cands, series: () => s });   // B 1,007; 993 left -> C gets 986 of stock (>= 500); A skipped
  assert.deepEqual(r2.trades.map(z => z.sym).sort(), ['B', 'C']); near(r2.trades.find(z => z.sym === 'C').paid, 993); assert.equal(r2.partial, 1); assert.equal(r2.skippedCash, 1);
  near(r2.cash + 0, 0, 1e-6); for (const e of r2.eq) if (isFinite(e)) assert.ok(e > 0);
  // % of equity slots: 10 positions of 10% fit exactly (costs included)
  const ten = Array.from({ length: 10 }, (_, i) => cand('S' + i, 0, { liq: 20 - i }));
  const r3 = runAccount({ D, a: 0, b: 5, capital: 10000, policy: POLICIES['SQ3-SLOT10'], cands: ten, series: () => s });
  assert.equal(r3.trades.length, 10); assert.equal(r3.partial, 0); near(r3.trades[0].paid, 1000); near(r3.cash, 0, 1e-6);
});

test('sales at an open come before buys: the stopped position funds the new one; a held stock is not bought twice', () => {
  const a = flat(100), b = flat(50); a.C[2] = 80; a.O[3] = 80;
  const r = runAccount({ D, a: 0, b: 30, capital: 1250, policy: PLAIN, cands: [cand('A', 0), cand('B', 2), cand('A', 1)], series: (x) => x === 'A' ? a : b });
  const A = r.trades.find(z => z.sym === 'A'), B = r.trades.find(z => z.sym === 'B');
  assert.equal(A.x, 3); assert.equal(A.why, 'stop'); assert.equal(B.k, 3); near(B.paid, 1007);   // 243 USD cash + A's sale (793) at open 3 pay for B in full at open 3
  assert.equal(r.trades.filter(z => z.sym === 'A').length, 1);
});

test('pyramiding: add 50% once, at the next open after a close +10% above the buy and above the 20-day', () => {
  const s = flat(100); for (let t = 30; t < T; t++) { s.O[t] = 100 + (t - 29); s.C[t] = 100 + (t - 29); }
  const P = POLICIES['SQ3-PYRAMID'], c = cand('A', 28, { hold: 60 });   // bought at open 29 at 100
  const r = runAccount({ D, a: 0, b: T - 1, capital: 10000, policy: P, cands: [c], series: () => s }); const z = r.trades[0];
  assert.equal(z.adds, 1); // the first close >= +10% (110) is session 39; add at the open of 40 (111)
  near(z.paid, buyCash(1000) + buyCash(500)); const sh = 1000 / 100 + 500 / 111; near(z.usd, sellCash(sh * s.C[88]) - z.paid);
  assert.equal(r.nBuys, 2);
});

test('cut losers at -8%; winners above their 50-day keep running after the hold and leave on a close under it', () => {
  const P = POLICIES['SQ3-CUTRUN'];
  const l = flat(100); l.C[5] = 91.9; l.O[6] = 91;
  const r1 = runAccount({ D, a: 0, b: T - 1, capital: 10000, policy: P, cands: [cand('L', 0)], series: () => l }); assert.equal(r1.trades[0].why, 'stop'); assert.equal(r1.trades[0].x, 6);
  const PL = runAccount({ D, a: 0, b: T - 1, capital: 10000, policy: PLAIN, cands: [cand('L', 0)], series: () => l }); assert.equal(PL.trades[0].why, 'time');   // -8.1% is no stop for the rule (15%)
  const w = flat(100); for (let t = 60; t < 150; t++) { w.O[t] = 100 + (t - 59); w.C[t] = 100 + (t - 59); } for (let t = 150; t < T; t++) { w.O[t] = 150; w.C[t] = 150; }   // rises to 190, then falls to 150
  const r2 = runAccount({ D, a: 0, b: T - 1, capital: 10000, policy: P, cands: [cand('W', 59, { hold: 30 })], series: () => w }); const z = r2.trades[0];
  assert.equal(z.why, 'trail'); assert.ok(z.x > 60 + 30, 'held past the rule hold'); assert.equal(z.x, 151);   // the close of 150 (150) is under the 50-day; sold at the open of 151
  const PW = runAccount({ D, a: 0, b: T - 1, capital: 10000, policy: PLAIN, cands: [cand('W', 59, { hold: 30 })], series: () => w }); assert.ok(z.usd > PW.trades[0].usd);
});

test('regime: crash = SPY 15% under its 252-day high; full needs SPY above its 200-day AND breadth > 50%', () => {
  const spyC = new Float64Array(T).fill(100); for (let t = 250; t < T; t++) spyC[t] = 120; spyC[300] = 100;
  const br = new Float64Array(T).fill(0.6);
  assert.equal(regimeAt(260, { spyC, breadth: br }), 'full'); assert.equal(regimeAt(300, { spyC, breadth: br }), 'crash');
  br[260] = 0.4; assert.equal(regimeAt(260, { spyC, breadth: br }), 'weak');
  br[260] = NaN; assert.equal(regimeAt(260, { spyC, breadth: br }), 'full');                // breadth unknown: SPY alone
  assert.equal(regimeAt(10, { spyC, breadth: br }), 'weak');                                 // no 200 days of SPY yet
  assert.equal(regimeAt(10, { spyC, breadth: br, off: 250 }), 'full');                       // SPY history before the window counts
  // in the account: no buy the open after a crash close, half size in a weak regime
  const s = flat(100), ctx = { spyC, breadth: new Float64Array(T).fill(0.6) }, P = POLICIES['SQ3-REGIME'];
  assert.equal(runAccount({ D, a: 0, b: 330, capital: 10000, policy: P, ctx, cands: [cand('A', 300)], series: () => s }).trades.length, 0);
  ctx.breadth[280] = 0.3; const r = runAccount({ D, a: 0, b: 330, capital: 10000, policy: P, ctx, cands: [cand('A', 280)], series: () => s }); near(r.trades[0].paid, buyCash(500));
  near(runAccount({ D, a: 0, b: 330, capital: 10000, policy: P, ctx, cands: [cand('A', 270)], series: () => s }).trades[0].paid, buyCash(1000));
});

test('sector cap 25%: a buy that would put a sector over 25% of equity is skipped', () => {
  const s = flat(100), P = POLICIES['SQ3-SECTOR'], cands = [1, 2, 3].map(i => cand('X' + i, 0, { sector: '36', liq: 10 - i }));
  const r = runAccount({ D, a: 0, b: 5, capital: 10000, policy: P, cands, series: () => s });
  assert.equal(r.trades.length, 2); assert.equal(r.skippedCap, 1);   // 2,000 of 10,000 ok; 3,000 > 2,500
});

test('drawdown brake: half tickets while equity is 10%+ under its peak', () => {
  const crash = flat(100); for (let t = 3; t < T; t++) { crash.O[t] = 0.0001; crash.C[t] = 0.0001; }   // 1,000 USD lost: 10,000 -> about 8,990
  const cands = []; for (let i = 0; i < 2; i++) cands.push(cand('Z' + i, 0, { hold: 300, stop: 0.999999 }));
  cands.push(cand('N', 10)); const s = flat(100);
  const ser = (x) => x === 'N' ? s : crash, P = POLICIES['SQ3-DDBRAKE'];
  const r = runAccount({ D, a: 0, b: 20, capital: 10000, policy: P, cands, series: ser }); near(r.trades.find(z => z.sym === 'N').paid, buyCash(500));
  const p = runAccount({ D, a: 0, b: 20, capital: 10000, policy: PLAIN, cands, series: ser }); near(p.trades.find(z => z.sym === 'N').paid, buyCash(1000));
});

test('rank-and-rotate: holds the strongest live signals at equity/N; drops a stock when its signal is no longer live', () => {
  const P = { ...POLICIES['SQ3-ROTATE'], rotate: { ...POLICIES['SQ3-ROTATE'].rotate, n: 1, keepRank: 1, lookback: 5 } };
  const up = flat(100), dn = flat(100); for (let t = 0; t < T; t++) { up.C[t] = up.O[t] = 100 + t; dn.C[t] = dn.O[t] = 200 - t * 0.1; }
  const cands = [cand('UP', 10, { hold: 20 }), cand('DN', 10, { hold: 100 })];
  const r = runAccount({ D, a: 0, b: 60, capital: 10000, policy: P, cands, series: (x) => x === 'UP' ? up : dn });
  const U = r.trades.find(z => z.sym === 'UP'), N = r.trades.find(z => z.sym === 'DN');
  assert.equal(U.k, 11); near(U.paid, 10000);              // first ranking at close 10: UP is strongest -> all the equity (n = 1) at open 11
  assert.equal(U.x, 31); assert.equal(U.why, 'not live');   // its signal is live at closes 10..29; the ranking at close 30 drops it
  assert.equal(N.k, 31); assert.equal(N.x, null);           // DN (still live) replaces it at the same open, from the sale's cash
});

test('fund held, curve stats and the four gates', () => {
  const f = { O: new Float64Array(T).fill(100), C: new Float64Array(T).fill(100) }; for (let t = 40; t < T; t++) f.C[t] = 110;
  const e = holdFund(f, 0, T - 1, 10000); near(e[T - 1], (10000 - 3 - 5) / 100 * 110);
  const c = curve(e, D, 0, T - 1, 10000); assert.ok(c.profit > 0); assert.ok(c.months >= 13); near(c.maxDD, (e[0] / 10000) - 1, 1e-4);
  const g = gates({ profit: 3000, maxDD: -0.25 }, { profit: 1000 }, { profit: 2000, maxDD: -0.22 }, [{ usd: 500 }, { usd: 400 }, { usd: -50 }]);
  assert.equal(g.pass, true); near(g.noTop2Profit, 2100);
  assert.equal(gates({ profit: 3000, maxDD: -0.28 }, { profit: 1000 }, { profit: 2000, maxDD: -0.22 }, []).drawdownOk, false);
  assert.equal(gates({ profit: 3000, maxDD: -0.2 }, { profit: 2500 }, { profit: 2000, maxDD: -0.22 }, [{ usd: 400 }, { usd: 300 }]).noTop2BeatsPlain, false);
  assert.equal(top2Usd([{ usd: -5 }, { usd: -9 }]), 0);
});

test('indicators: 20/50-day averages need full history; volatility from daily returns', () => {
  const C = new Float64Array(80).fill(10); const I = indicators(C); assert.ok(isNaN(I.sma20[18])); near(I.sma20[19], 10); near(I.sig20[40], 0);
});

test('pre-registration writes each SQ3 policy once into the library', () => {
  const LB = { strategies: [] }; assert.equal(preRegister(LB), 11); assert.equal(preRegister(LB), 0);
  assert.ok(LB.strategies.every(e => /pre-registered/.test(e.status) && e.explain.includes('NOT a buy signal')));
});
